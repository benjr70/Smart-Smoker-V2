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
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "agent-run tests"
echo "=========================================="

test_exhaustion_pauses_not_fails
test_genuine_failure_does_not_pause
test_clean_success_exits_zero

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
