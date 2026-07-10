#!/usr/bin/env bash
# Tests for scripts/claude-agent/agent-run
#
# Run: bash scripts/claude-agent/agent-run.test.sh
#
# Strategy: agent-run fires `/team-pickup` via the Claude CLI, then runs the
# Exhaustion Classifier over the captured output and, on EXHAUSTED, pauses the
# in-flight issue (freeze partial work, flip team:in-progress → team:paused,
# comment) instead of failing. We drive it entirely with stubs injected via env
# so nothing real runs:
#   CLAUDE_BIN — prints a captured-output fixture and exits with a chosen code
#   GH_BIN     — logs each gh call and answers `issue list` with a fixed number
#   GIT_BIN    — logs each git call (and reports staged changes) so the wip
#                freeze path is exercised without a real repo history
# REPO_DIR/LOG_DIR point at a temp workspace. The tests assert observable
# behavior (exit code, label transition, comment, resetAt emission) — never
# internal steps.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_RUN="${SCRIPT_DIR}/agent-run"

TESTS_RUN=0
TESTS_FAILED=0
FAILED_NAMES=()

pass() {
    TESTS_RUN=$((TESTS_RUN + 1))
    echo "  PASS: $1"
}

fail() {
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILED_NAMES+=("$1")
    echo "  FAIL: $1"
    if [ -n "${2:-}" ]; then
        echo "    $2"
    fi
}

if [ ! -f "${AGENT_RUN}" ]; then
    echo "FATAL: ${AGENT_RUN} not found"
    exit 2
fi

# Build a temp workspace with a fake git checkout and command stubs. The Claude
# stub prints the fixture passed as $1 and exits with the code passed as $2.
make_env() {
    local fixture="$1" claude_exit="$2"
    local dir; dir="$(mktemp -d)"
    mkdir -p "${dir}/repo/.git" "${dir}/logs"
    : > "${dir}/gh.log"
    : > "${dir}/git.log"

    printf '%s' "${fixture}" > "${dir}/fixture.txt"
    cat > "${dir}/claude-stub" <<EOF
#!/usr/bin/env bash
cat "${dir}/fixture.txt"
exit ${claude_exit}
EOF

    # gh stub: log the call; answer \`issue list\` with a fixed in-flight number.
    cat > "${dir}/gh-stub" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${dir}/gh.log"
if [ "\${1:-}" = "issue" ] && [ "\${2:-}" = "list" ]; then
  echo "291"
fi
exit 0
EOF

    # git stub: log the call; report staged changes so the wip freeze commits.
    cat > "${dir}/git-stub" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${dir}/git.log"
if [ "\${1:-}" = "diff" ]; then
  # \`diff --cached --quiet\` exits 1 when there are staged changes.
  exit 1
fi
exit 0
EOF

    chmod +x "${dir}/claude-stub" "${dir}/gh-stub" "${dir}/git-stub"
    printf '%s' "${dir}"
}

run_agent() {
    local dir="$1"
    REPO_DIR="${dir}/repo" LOG_DIR="${dir}/logs" \
        CLAUDE_BIN="${dir}/claude-stub" \
        GH_BIN="${dir}/gh-stub" \
        GIT_BIN="${dir}/git-stub" \
        bash "${AGENT_RUN}"
}

#-------------------------------------------------------------------------------
# Test 1 (CRITICAL): a mid-run usage exhaustion pauses the in-flight issue rather
# than failing — the branch is frozen with a wip commit, the issue flips
# team:in-progress → team:paused, a timestamped pause comment is posted, the
# scraped resetAt is emitted, team:failed is NEVER applied, and agent-run exits 0
# (AC 1, 2, 3, 4, 5).
#-------------------------------------------------------------------------------
test_exhaustion_pauses_not_fails() {
    echo "TEST: mid-run exhaustion pauses the in-flight issue"

    local reset_epoch dir rc gh git_calls
    reset_epoch=$(date -u -d '2026-07-06T01:00:00Z' +%s)
    dir="$(make_env "picking issue #291
Claude AI usage limit reached|${reset_epoch}" 1)"
    trap "rm -rf '${dir}'" RETURN

    local out
    out="$(run_agent "${dir}")"
    rc=$?

    if [ "${rc}" -ne 0 ]; then
        fail "an out-of-gas run must NOT fail (exit 0)" "rc=${rc}"
        return
    fi

    gh="$(cat "${dir}/gh.log")"
    git_calls="$(cat "${dir}/git.log")"

    if ! printf '%s' "${gh}" | grep -q 'issue edit 291.*--remove-label team:in-progress'; then
        fail "must remove team:in-progress from the in-flight issue" "gh:
${gh}"
        return
    fi
    if ! printf '%s' "${gh}" | grep -q 'issue edit 291.*--add-label team:paused'; then
        fail "must add team:paused to the in-flight issue" "gh:
${gh}"
        return
    fi
    if printf '%s' "${gh}" | grep -q 'team:failed'; then
        fail "an out-of-gas event must NEVER apply team:failed" "gh:
${gh}"
        return
    fi
    if ! printf '%s' "${gh}" | grep -q 'issue comment 291'; then
        fail "must record the pause as an issue comment" "gh:
${gh}"
        return
    fi
    if ! printf '%s' "${git_calls}" | grep -q 'commit'; then
        fail "must freeze partial work with a wip commit" "git:
${git_calls}"
        return
    fi
    if ! printf '%s' "${out}" | grep -qi "resetAt=.*2026-07-06T01:00:00"; then
        fail "must emit the scraped resetAt for the daemon" "out:
${out}"
        return
    fi

    pass "mid-run exhaustion pauses the in-flight issue"
}

#-------------------------------------------------------------------------------
# Test 2 (CRITICAL): a genuine failure is surfaced, not paused — no team:paused
# transition, and agent-run exits non-zero so the failure escalates (AC 3).
#-------------------------------------------------------------------------------
test_genuine_failure_does_not_pause() {
    echo "TEST: a genuine failure escalates instead of pausing"

    local dir rc gh
    dir="$(make_env "FAIL apps/backend/src/temps/temps.service.spec.ts
Error: process exited with code 1" 1)"
    trap "rm -rf '${dir}'" RETURN

    run_agent "${dir}" >/dev/null 2>&1
    rc=$?

    if [ "${rc}" -eq 0 ]; then
        fail "a genuine failure must exit non-zero" "rc=${rc}"
        return
    fi

    gh="$(cat "${dir}/gh.log")"
    if printf '%s' "${gh}" | grep -q 'team:paused'; then
        fail "a genuine failure must NOT pause the issue" "gh:
${gh}"
        return
    fi

    pass "a genuine failure escalates instead of pausing"
}

#-------------------------------------------------------------------------------
# Test 3: a clean success exits 0 and does not touch labels (AC 1).
#-------------------------------------------------------------------------------
test_clean_success_exits_zero() {
    echo "TEST: a clean success exits 0 without touching labels"

    local dir rc gh
    dir="$(make_env "opened PR https://github.com/benjr70/Smart-Smoker-V2/pull/300
pr-watch verdict: success" 0)"
    trap "rm -rf '${dir}'" RETURN

    run_agent "${dir}" >/dev/null 2>&1
    rc=$?

    if [ "${rc}" -ne 0 ]; then
        fail "a clean success must exit 0" "rc=${rc}"
        return
    fi

    gh="$(cat "${dir}/gh.log")"
    if printf '%s' "${gh}" | grep -qE 'team:(paused|failed)'; then
        fail "a clean success must not change labels" "gh:
${gh}"
        return
    fi

    pass "a clean success exits 0 without touching labels"
}

#-------------------------------------------------------------------------------
# Test 4: every fire starts from the tip of master — the checkout is reset and
# switched to master before claude is invoked, so a prior run's feat/issue-N
# branch (or crash debris) never leaks into the next pick.
#-------------------------------------------------------------------------------
test_fire_starts_from_latest_master() {
    echo "TEST: every fire starts from latest master"

    local dir git_calls
    dir="$(make_env "opened PR https://github.com/benjr70/Smart-Smoker-V2/pull/300" 0)"
    trap "rm -rf '${dir}'" RETURN

    run_agent "${dir}" >/dev/null 2>&1

    git_calls="$(cat "${dir}/git.log")"
    if ! printf '%s' "${git_calls}" | grep -q 'checkout --quiet master'; then
        fail "must checkout master before firing" "git:
${git_calls}"
        return
    fi
    if ! printf '%s' "${git_calls}" | grep -q 'reset --hard --quiet origin/master'; then
        fail "must hard-reset master to origin/master before firing" "git:
${git_calls}"
        return
    fi

    pass "every fire starts from latest master"
}

#-------------------------------------------------------------------------------
# Test 5: a clean run that picked nothing emits AGENT_RUN_NO_WORK=1 so the
# daemon sleeps out the window instead of re-firing into an empty queue.
#-------------------------------------------------------------------------------
test_no_eligible_issue_emits_no_work_marker() {
    echo "TEST: empty pick emits the no-work marker"

    local dir rc out
    dir="$(make_env "team-pickup: no eligible issue" 0)"
    trap "rm -rf '${dir}'" RETURN

    out="$(run_agent "${dir}" 2>/dev/null)"
    rc=$?

    if [ "${rc}" -ne 0 ]; then
        fail "an empty pick is not a failure (exit 0)" "rc=${rc}"
        return
    fi
    if ! printf '%s' "${out}" | grep -q '^AGENT_RUN_NO_WORK=1'; then
        fail "an empty pick must emit AGENT_RUN_NO_WORK=1" "out:
${out}"
        return
    fi

    pass "empty pick emits the no-work marker"
}

#-------------------------------------------------------------------------------
# Test 6 (REGRESSION): the real skip report line — `picked:   skip — N in flight`
# observed live 2026-07-09 — must emit AGENT_RUN_NO_WORK=1. The old grep only
# matched `team-pickup: skip`, so a lock-skip looked like a clean run and the
# daemon hot-looped one fire every ~90s.
#-------------------------------------------------------------------------------
test_real_skip_output_emits_no_work_marker() {
    echo "TEST: real skip report line emits the no-work marker"

    local dir rc out
    dir="$(make_env "=== /team-pickup 2026-07-09T00:00:00Z ===
picked:   skip — 1 in flight" 0)"
    trap "rm -rf '${dir}'" RETURN

    out="$(run_agent "${dir}" 2>/dev/null)"
    rc=$?

    if [ "${rc}" -ne 0 ]; then
        fail "a skip is not a failure (exit 0)" "rc=${rc}"
        return
    fi
    if ! printf '%s' "${out}" | grep -q '^AGENT_RUN_NO_WORK=1'; then
        fail "a lock-skip must emit AGENT_RUN_NO_WORK=1" "out:
${out}"
        return
    fi

    pass "real skip report line emits the no-work marker"
}

#-------------------------------------------------------------------------------
# Test 7: a genuine failure that had already picked an issue (its log carries the
# `picked:   #N` line) clears the lock it created — team:in-progress → team:failed
# with a triage comment — so the next fire is not blocked forever (the #280
# stuck-lock scenario).
#-------------------------------------------------------------------------------
test_failed_run_clears_its_own_lock() {
    echo "TEST: failed run clears the lock it created"

    local dir rc gh
    dir="$(make_env "=== /team-pickup 2026-07-09T00:00:00Z ===
picked:   #280 Tracer: full data-integrity stack
implementing…
Error: process exited with code 1" 1)"
    trap "rm -rf '${dir}'" RETURN

    run_agent "${dir}" >/dev/null 2>&1
    rc=$?

    if [ "${rc}" -eq 0 ]; then
        fail "a genuine failure must exit non-zero" "rc=${rc}"
        return
    fi

    gh="$(cat "${dir}/gh.log")"
    if ! printf '%s' "${gh}" | grep -q 'issue edit 280.*--remove-label team:in-progress'; then
        fail "must remove the leaked team:in-progress lock from the picked issue" "gh:
${gh}"
        return
    fi
    if ! printf '%s' "${gh}" | grep -q 'issue edit 280.*--add-label team:failed'; then
        fail "must mark the picked issue team:failed for triage" "gh:
${gh}"
        return
    fi
    if ! printf '%s' "${gh}" | grep -q 'issue comment 280'; then
        fail "must comment the failure on the picked issue" "gh:
${gh}"
        return
    fi

    pass "failed run clears the lock it created"
}

#-------------------------------------------------------------------------------
# Test 8: a genuine failure that never picked an issue (no `picked:   #N` line)
# touches NO labels — it must never clear a lock some other run holds.
#-------------------------------------------------------------------------------
test_failed_run_without_pick_touches_no_lock() {
    echo "TEST: failed run with no pick leaves foreign locks untouched"

    local dir gh
    dir="$(make_env "=== /team-pickup 2026-07-09T00:00:00Z ===
FAIL apps/backend/src/temps/temps.service.spec.ts
Error: process exited with code 1" 1)"
    trap "rm -rf '${dir}'" RETURN

    run_agent "${dir}" >/dev/null 2>&1

    gh="$(cat "${dir}/gh.log")"
    if printf '%s' "${gh}" | grep -qE 'issue edit .*team:(failed|in-progress)'; then
        fail "a failure with no pick must not edit any issue's labels" "gh:
${gh}"
        return
    fi

    pass "failed run with no pick leaves foreign locks untouched"
}

#-------------------------------------------------------------------------------
# Test 8b: a failed RECONCILE fire (log carries `picked:   reconcile PR #P
# (issue #N)`) restores the borrowed lock — team:in-progress removed and
# team:done RE-ADDED, never team:failed (the issue's work was already done) —
# and leaves the breadcrumb on the PR, not the issue.
#-------------------------------------------------------------------------------
test_failed_reconcile_restores_done_lock() {
    echo "TEST: failed reconcile fire restores team:done, never team:failed"

    local dir rc gh
    dir="$(make_env "=== /team-pickup 2026-07-10T00:00:00Z ===
picked:   reconcile PR #310 (issue #281)
reconciling…
Error: process exited with code 1" 1)"
    trap "rm -rf '${dir}'" RETURN

    run_agent "${dir}" >/dev/null 2>&1
    rc=$?

    if [ "${rc}" -eq 0 ]; then
        fail "a genuine failure must exit non-zero" "rc=${rc}"
        return
    fi

    gh="$(cat "${dir}/gh.log")"
    if ! printf '%s' "${gh}" | grep -q 'issue edit 281.*--remove-label team:in-progress'; then
        fail "must clear the borrowed team:in-progress lock" "gh:
${gh}"
        return
    fi
    if ! printf '%s' "${gh}" | grep -q 'issue edit 281.*--add-label team:done'; then
        fail "must restore team:done on the reconcile issue" "gh:
${gh}"
        return
    fi
    if printf '%s' "${gh}" | grep -q 'team:failed'; then
        fail "a crashed reconcile must NEVER fail a finished issue" "gh:
${gh}"
        return
    fi
    if ! printf '%s' "${gh}" | grep -q 'pr comment 310'; then
        fail "must leave the crash breadcrumb on the PR" "gh:
${gh}"
        return
    fi

    pass "failed reconcile fire restores team:done, never team:failed"
}

#-------------------------------------------------------------------------------
# Test 9: the claude invocation runs with the print background-task ceiling
# lifted (CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0), so a long team dispatch is not
# killed at the default 600s. A host override (already-set value) is honored.
#-------------------------------------------------------------------------------
test_bg_ceiling_lifted_for_claude() {
    echo "TEST: claude runs with the background-task ceiling lifted"

    local dir out
    dir="$(make_env "opened PR https://github.com/benjr70/Smart-Smoker-V2/pull/300" 0)"
    trap "rm -rf '${dir}'" RETURN
    # Replace the claude stub so it reports the ceiling env it was invoked with.
    cat > "${dir}/claude-stub" <<EOF
#!/usr/bin/env bash
echo "CEILING=\${CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS:-unset}"
exit 0
EOF
    chmod +x "${dir}/claude-stub"

    # Default (unset by caller) → agent-run must set 0.
    out="$(run_agent "${dir}" 2>/dev/null)"
    if ! printf '%s' "${out}" | grep -q '^CEILING=0'; then
        fail "default must lift the ceiling to 0" "out:
${out}"
        return
    fi

    # Host override must be honored, not clobbered.
    out="$(CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=1200000 run_agent "${dir}" 2>/dev/null)"
    if ! printf '%s' "${out}" | grep -q '^CEILING=1200000'; then
        fail "an existing host override must be honored" "out:
${out}"
        return
    fi

    pass "claude runs with the background-task ceiling lifted"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "agent-run tests"
echo "=========================================="

test_exhaustion_pauses_not_fails
test_genuine_failure_does_not_pause
test_clean_success_exits_zero
test_fire_starts_from_latest_master
test_no_eligible_issue_emits_no_work_marker
test_real_skip_output_emits_no_work_marker
test_failed_run_clears_its_own_lock
test_failed_run_without_pick_touches_no_lock
test_failed_reconcile_restores_done_lock
test_bg_ceiling_lifted_for_claude

echo ""
echo "=========================================="
echo "Ran: ${TESTS_RUN} | Failed: ${TESTS_FAILED}"
echo "=========================================="

if [ "${TESTS_FAILED}" -gt 0 ]; then
    echo "Failed tests:"
    for name in "${FAILED_NAMES[@]}"; do
        echo "  - ${name}"
    done
    exit 1
fi

exit 0
