#!/usr/bin/env bash
# Integration tests for scripts/claude-agent/agent-daemon
#
# Run: bash scripts/claude-agent/agent-daemon.integration.test.sh
#
# Strategy: unlike agent-daemon.test.sh (which stubs agent-run to a one-line
# logger), this drives the REAL loop end-to-end — Budget Gate -> the real
# agent-run -> the real Exhaustion Classifier -> Sleep Planner -> the real
# Pause/Resume state logic — and stubs ONLY the true external boundaries so
# nothing real runs:
#   CCUSAGE_CMD — prints a ccusage-shaped fixture (fresh / spent)
#   CLAUDE_BIN  — stands in for the `claude` CLI running /team-pickup: the first
#                 fire is cut off by usage exhaustion; a later fire takes the
#                 resume path, sourcing the real pause-resume.sh to decide, just
#                 as the /team-pickup skill does
#   GH_BIN      — a STATEFUL gh: it remembers each issue's label across calls, so
#                 agent-run's pause (team:in-progress -> team:paused) is visible
#                 to the next fire's resume lookup
#   GIT_BIN     — logs each git call (and reports staged changes) so the wip
#                 freeze path runs without real history
#   SLEEP_CMD   — logs the requested sleep and returns immediately (no waiting)
# BUDGET_GATE_NOW pins "now" so fixture windows are deterministic, SLEEP_POLL_MAX
# caps post-wake polling, and AGENT_DAEMON_MAX_ITERS caps the otherwise-infinite
# loop. Tests assert observable behavior only (fired vs slept, label transitions,
# which issue resumed) — never internal steps.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAEMON="${SCRIPT_DIR}/agent-daemon"
AGENT_RUN="${SCRIPT_DIR}/agent-run"
LIB_DIR="${SCRIPT_DIR}/lib"

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

for f in "${DAEMON}" "${AGENT_RUN}" "${LIB_DIR}/pause-resume.sh"; do
    if [ ! -f "${f}" ]; then
        echo "FATAL: ${f} not found"
        exit 2
    fi
done

# The in-flight issue the simulated /team-pickup is working when it runs dry.
INFLIGHT_ISSUE=291

NOW_EPOCH=$(date -u -d '2026-07-05T20:00:00Z' +%s)
RESET_EPOCH=$(date -u -d '2026-07-06T01:00:00Z' +%s)
iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%S.000Z; }

# Build a fixture whose active window is [start, start+5h].
fixture() {
    local start="$1" end=$(( $1 + 18000 ))
    printf '{"blocks":[{"id":"active","isActive":true,"isGap":false,"startTime":"%s","endTime":"%s"}]}\n' \
        "$(iso "${start}")" "$(iso "${end}")"
}

# Create a temp workspace with a fake git checkout, a fixture file, and the
# boundary stubs wired to shared state under ${dir}/gh-state. Echoes the dir.
#
# The gh + claude stubs are self-locating (they resolve paths from $0) and read
# tunables from ${dir}/stub.env, so they can be quoted heredocs with no runtime
# escaping. The in-flight issue starts labelled team:in-progress.
make_env() {
    local dir; dir="$(mktemp -d)"
    mkdir -p "${dir}/repo/.git" "${dir}/logs" "${dir}/gh-state"
    : > "${dir}/gh.log"
    : > "${dir}/git.log"
    : > "${dir}/team-pickup.log"

    # Shared tunables the stubs source at runtime.
    cat > "${dir}/stub.env" <<EOF
LIB_DIR="${LIB_DIR}"
RESET_EPOCH="${RESET_EPOCH}"
INFLIGHT_ISSUE="${INFLIGHT_ISSUE}"
EOF

    # Initial label state: the in-flight issue is being worked.
    echo "team:in-progress" > "${dir}/gh-state/label-${INFLIGHT_ISSUE}"

    # claude stub — stands in for `claude ... /team-pickup`. Call 1 is cut off by
    # usage exhaustion (agent-run then pauses the issue). Any later call takes the
    # resume path: it finds the paused issue, counts its pauses, and asks the REAL
    # pause-resume.sh what to do — exactly as the /team-pickup skill §1.5 does.
    cat > "${dir}/claude-stub" <<'STUB'
#!/usr/bin/env bash
D="$(cd "$(dirname "$0")" && pwd)"
. "${D}/stub.env"
STATE="${D}/gh-state"
TPLOG="${D}/team-pickup.log"
CALLS="${D}/claude-calls"

n=$(( $(cat "${CALLS}" 2>/dev/null || echo 0) + 1 ))
echo "${n}" > "${CALLS}"
echo "invoked call=${n}" >> "${TPLOG}"

if [ "${n}" -eq 1 ]; then
    # First fire: pick the issue, then get cut off by Claude usage exhaustion.
    echo "picking issue #${INFLIGHT_ISSUE}"
    echo "Claude AI usage limit reached|${RESET_EPOCH}"
    exit 1
fi

# Later fire: the /team-pickup resume path. Discover the paused issue from label
# state, count its pause comments, and let the real module decide.
paused=""
for f in "${STATE}"/label-*; do
    [ -e "${f}" ] || continue
    [ "$(cat "${f}")" = "team:paused" ] && paused="${f##*/label-}"
done
count=0
[ -f "${STATE}/pauses-${paused}" ] && count=$(wc -l < "${STATE}/pauses-${paused}")

. "${LIB_DIR}/pause-resume.sh"
verdict="$(pause_resume_action "${paused}" "${count}")"
action="$(printf '%s' "${verdict}" | jq -r '.action')"
issue="$(printf '%s' "${verdict}" | jq -r '.issue')"
echo "team-pickup: action=${action} issue=${issue}" | tee -a "${TPLOG}"

# On resume, /team-pickup §4 flips the issue back to in-progress and continues.
[ "${action}" = "resume" ] && echo "team:in-progress" > "${STATE}/label-${issue}"
echo "resume complete for #${issue}"
exit 0
STUB

    # gh stub — stateful: label edits persist to gh-state so a pause is visible to
    # the next fire. Answers `issue list --label L` with the first issue holding L.
    cat > "${dir}/gh-stub" <<'STUB'
#!/usr/bin/env bash
D="$(cd "$(dirname "$0")" && pwd)"
STATE="${D}/gh-state"
echo "$*" >> "${D}/gh.log"

if [ "${1:-}" = "issue" ] && [ "${2:-}" = "list" ]; then
    label=""
    args=("$@")
    for ((i = 0; i < ${#args[@]}; i++)); do
        [ "${args[i]}" = "--label" ] && label="${args[i + 1]}"
    done
    for f in "${STATE}"/label-*; do
        [ -e "${f}" ] || continue
        if [ "$(cat "${f}")" = "${label}" ]; then
            echo "${f##*/label-}"
            break
        fi
    done
    exit 0
fi

if [ "${1:-}" = "issue" ] && [ "${2:-}" = "edit" ]; then
    num="${3}"
    add=""
    args=("$@")
    for ((i = 0; i < ${#args[@]}; i++)); do
        [ "${args[i]}" = "--add-label" ] && add="${args[i + 1]}"
    done
    [ -n "${add}" ] && echo "${add}" > "${STATE}/label-${num}"
    exit 0
fi

if [ "${1:-}" = "issue" ] && [ "${2:-}" = "comment" ]; then
    echo "x" >> "${STATE}/pauses-${3}"
    exit 0
fi
exit 0
STUB

    # git stub: log the call; report staged changes so the wip freeze commits.
    cat > "${dir}/git-stub" <<'STUB'
#!/usr/bin/env bash
D="$(cd "$(dirname "$0")" && pwd)"
echo "$*" >> "${D}/git.log"
if [ "${1:-}" = "diff" ]; then
    # `diff --cached --quiet` exits 1 when there are staged changes.
    exit 1
fi
exit 0
STUB

    cat > "${dir}/sleep-stub" <<'STUB'
#!/usr/bin/env bash
D="$(cd "$(dirname "$0")" && pwd)"
echo "slept $*" >> "${D}/calls.log"
exit 0
STUB

    chmod +x "${dir}/claude-stub" "${dir}/gh-stub" "${dir}/git-stub" "${dir}/sleep-stub"
    printf '%s' "${dir}"
}

# Drive the real daemon (and, through it, the real agent-run) with all boundaries
# stubbed. $1=dir, $2=max iters.
run_daemon() {
    local dir="$1" iters="$2"
    BUDGET_GATE_NOW="${NOW_EPOCH}" \
        AGENT_DAEMON_MAX_ITERS="${iters}" \
        SLEEP_POLL_MAX=1 \
        CCUSAGE_CMD="cat '${dir}/ccusage.json'" \
        AGENT_RUN_CMD="${AGENT_RUN}" \
        SLEEP_CMD="${dir}/sleep-stub" \
        REPO_DIR="${dir}/repo" \
        LOG_DIR="${dir}/logs" \
        CLAUDE_BIN="${dir}/claude-stub" \
        GH_BIN="${dir}/gh-stub" \
        GIT_BIN="${dir}/git-stub" \
        bash "${DAEMON}" >>"${dir}/daemon.out" 2>&1
}

#-------------------------------------------------------------------------------
# Test 1: fresh budget → the loop fires the real agent-run (which invokes the
# stubbed claude/team-pickup), then sleeps (AC 2, behavior 1).
#-------------------------------------------------------------------------------
test_fresh_budget_fires() {
    echo "TEST: fresh budget fires the loop end-to-end"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    fixture $((NOW_EPOCH - 60)) > "${dir}/ccusage.json"      # window just started

    run_daemon "${dir}" 1

    if [ ! -s "${dir}/claude-calls" ]; then
        fail "fresh budget must fire agent-run (claude invoked)" "team-pickup log:
$(cat "${dir}/team-pickup.log")"
        return
    fi
    if ! grep -q '^slept' "${dir}/calls.log" 2>/dev/null; then
        fail "fresh budget must still schedule the next window (sleep)" "calls:
$(cat "${dir}/calls.log" 2>/dev/null)"
        return
    fi

    pass "fresh budget fires the loop end-to-end"
}

#-------------------------------------------------------------------------------
# Test 2: spent budget → the loop sleeps and does NOT fire agent-run, so the
# claude/team-pickup boundary is never touched (AC 3, behavior 2).
#-------------------------------------------------------------------------------
test_spent_budget_sleeps() {
    echo "TEST: spent budget sleeps without firing"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    fixture $((NOW_EPOCH - 17000)) > "${dir}/ccusage.json"   # ~4.7h into window

    run_daemon "${dir}" 1

    if [ -s "${dir}/claude-calls" ]; then
        fail "spent budget must NOT fire agent-run" "team-pickup log:
$(cat "${dir}/team-pickup.log")"
        return
    fi
    if ! grep -q '^slept' "${dir}/calls.log" 2>/dev/null; then
        fail "spent budget must sleep until reset" "calls:
$(cat "${dir}/calls.log" 2>/dev/null)"
        return
    fi

    pass "spent budget sleeps without firing"
}

#-------------------------------------------------------------------------------
# Test 3 (CRITICAL): a simulated mid-run exhaustion pauses the in-flight issue,
# and the NEXT loop iteration resumes that SAME issue rather than restarting or
# picking a new one (AC 4, behavior 3). This is the whole-loop assertion that no
# single unit test covers: exhaustion (agent-run + Exhaustion Classifier) ->
# pause (team:in-progress -> team:paused) -> next window -> resume (the real
# pause-resume.sh, driven by the /team-pickup stub).
#-------------------------------------------------------------------------------
test_exhaustion_pauses_then_resumes_same_issue() {
    echo "TEST: mid-run exhaustion pauses, next iteration resumes the same issue"

    local dir gh tp
    dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    fixture $((NOW_EPOCH - 60)) > "${dir}/ccusage.json"      # fresh both iterations

    run_daemon "${dir}" 2

    gh="$(cat "${dir}/gh.log")"
    tp="$(cat "${dir}/team-pickup.log")"

    # The loop must have fired twice (paused window, then resume window).
    if [ "$(cat "${dir}/claude-calls" 2>/dev/null || echo 0)" != "2" ]; then
        fail "the loop must fire once to pause and once to resume" "team-pickup log:
${tp}"
        return
    fi
    # Iteration 1: the in-flight issue was paused (team:in-progress -> team:paused).
    if ! printf '%s' "${gh}" | grep -q "issue edit ${INFLIGHT_ISSUE}.*--remove-label team:in-progress.*--add-label team:paused"; then
        fail "mid-run exhaustion must pause the in-flight issue" "gh log:
${gh}"
        return
    fi
    # An out-of-gas event must never be surfaced as a failure.
    if printf '%s' "${gh}" | grep -q 'team:failed'; then
        fail "an out-of-gas event must NEVER apply team:failed" "gh log:
${gh}"
        return
    fi
    # Iteration 2: the next fire resumed the SAME issue that was paused.
    if ! printf '%s' "${tp}" | grep -q "action=resume issue=${INFLIGHT_ISSUE}"; then
        fail "the next iteration must resume the same paused issue" "team-pickup log:
${tp}"
        return
    fi

    pass "mid-run exhaustion pauses, next iteration resumes the same issue"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "agent-daemon integration tests"
echo "=========================================="

test_fresh_budget_fires
test_spent_budget_sleeps
test_exhaustion_pauses_then_resumes_same_issue

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
