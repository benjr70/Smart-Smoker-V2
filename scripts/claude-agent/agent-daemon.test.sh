#!/usr/bin/env bash
# Tests for scripts/claude-agent/agent-daemon
#
# Run: bash scripts/claude-agent/agent-daemon.test.sh
#
# Strategy: agent-daemon is the thin loop wiring Budget Gate -> agent-run ->
# Sleep Planner. We drive it with stubs injected via env so nothing real runs:
#   CCUSAGE_CMD   — prints a ccusage-shaped fixture (fresh / spent / broken)
#   AGENT_RUN_CMD — logs "fired" instead of invoking claude
#   SLEEP_CMD     — logs the requested sleep and returns immediately (no waiting)
# BUDGET_GATE_NOW pins "now" so the fixture windows are deterministic, and
# AGENT_DAEMON_MAX_ITERS caps the otherwise-infinite loop at one pass.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAEMON="${SCRIPT_DIR}/agent-daemon"

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

if [ ! -f "${DAEMON}" ]; then
    echo "FATAL: ${DAEMON} not found"
    exit 2
fi

NOW_EPOCH=$(date -u -d '2026-07-05T20:00:00Z' +%s)
iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%S.000Z; }

# Build a fixture whose active window is [start, start+5h].
fixture() {
    local start="$1" end=$(( $1 + 18000 ))
    printf '{"blocks":[{"id":"active","isActive":true,"isGap":false,"startTime":"%s","endTime":"%s"}]}\n' \
        "$(iso "${start}")" "$(iso "${end}")"
}

# Create a temp workspace with a fixture file and logging stubs. Echoes the dir.
make_env() {
    local dir; dir="$(mktemp -d)"
    : > "${dir}/calls.log"
    cat > "${dir}/agent-run-stub" <<EOF
#!/usr/bin/env bash
echo "fired \$*" >> "${dir}/calls.log"
exit 0
EOF
    cat > "${dir}/sleep-stub" <<EOF
#!/usr/bin/env bash
echo "slept \$*" >> "${dir}/calls.log"
exit 0
EOF
    chmod +x "${dir}/agent-run-stub" "${dir}/sleep-stub"
    printf '%s' "${dir}"
}

#-------------------------------------------------------------------------------
# Test 1: fresh budget → the daemon fires agent-run, then sleeps (AC 1).
#-------------------------------------------------------------------------------
test_fresh_budget_fires() {
    echo "TEST: fresh budget fires agent-run"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    fixture $((NOW_EPOCH - 60)) > "${dir}/ccusage.json"      # window just started

    BUDGET_GATE_NOW="${NOW_EPOCH}" AGENT_DAEMON_MAX_ITERS=1 \
        CCUSAGE_CMD="cat '${dir}/ccusage.json'" \
        AGENT_RUN_CMD="${dir}/agent-run-stub" \
        SLEEP_CMD="${dir}/sleep-stub" \
        bash "${DAEMON}" >/dev/null 2>&1

    if ! grep -q '^fired' "${dir}/calls.log"; then
        fail "fresh budget must fire agent-run" "calls:
$(cat "${dir}/calls.log")"
        return
    fi

    pass "fresh budget fires agent-run"
}

#-------------------------------------------------------------------------------
# Test 2: spent budget → the daemon sleeps and does NOT fire agent-run (AC 2).
#-------------------------------------------------------------------------------
test_spent_budget_sleeps() {
    echo "TEST: spent budget sleeps without firing"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    fixture $((NOW_EPOCH - 17000)) > "${dir}/ccusage.json"   # ~4.7h into window

    BUDGET_GATE_NOW="${NOW_EPOCH}" AGENT_DAEMON_MAX_ITERS=1 \
        CCUSAGE_CMD="cat '${dir}/ccusage.json'" \
        AGENT_RUN_CMD="${dir}/agent-run-stub" \
        SLEEP_CMD="${dir}/sleep-stub" \
        bash "${DAEMON}" >/dev/null 2>&1

    if grep -q '^fired' "${dir}/calls.log"; then
        fail "spent budget must NOT fire agent-run" "calls:
$(cat "${dir}/calls.log")"
        return
    fi
    if ! grep -q '^slept' "${dir}/calls.log"; then
        fail "spent budget must sleep until reset" "calls:
$(cat "${dir}/calls.log")"
        return
    fi

    pass "spent budget sleeps without firing"
}

#-------------------------------------------------------------------------------
# Test 3: ccusage unavailable → the daemon stays alive (degraded), sleeps, and
#         does not fire or crash (AC 4).
#-------------------------------------------------------------------------------
test_ccusage_unavailable_stays_alive() {
    echo "TEST: ccusage unavailable degrades without crashing"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN

    BUDGET_GATE_NOW="${NOW_EPOCH}" AGENT_DAEMON_MAX_ITERS=1 \
        CCUSAGE_CMD="false" \
        AGENT_RUN_CMD="${dir}/agent-run-stub" \
        SLEEP_CMD="${dir}/sleep-stub" \
        CLAUDE_JSONL_DIR="${dir}/nonexistent" \
        bash "${DAEMON}" >/dev/null 2>&1
    local rc=$?

    if [ "${rc}" -ne 0 ]; then
        fail "daemon must exit cleanly after a degraded pass" "rc=${rc}"
        return
    fi
    if grep -q '^fired' "${dir}/calls.log"; then
        fail "degraded pass must NOT fire agent-run" "calls:
$(cat "${dir}/calls.log")"
        return
    fi
    if ! grep -q '^slept' "${dir}/calls.log"; then
        fail "degraded pass must still sleep (stay alive)" "calls:
$(cat "${dir}/calls.log")"
        return
    fi

    pass "ccusage unavailable degrades without crashing"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "agent-daemon tests"
echo "=========================================="

test_fresh_budget_fires
test_spent_budget_sleeps
test_ccusage_unavailable_stays_alive

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
