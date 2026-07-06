#!/usr/bin/env bash
# Tests for scripts/claude-agent/lib/budget-gate.sh
#
# Run: bash scripts/claude-agent/lib/budget-gate.test.sh
#
# Strategy: budget_gate is a pure function of the ccusage `blocks --json` payload
# supplied on stdin plus a fixed "now" (BUDGET_GATE_NOW epoch, injected so the
# test is deterministic and never touches the clock or the network). Each test
# builds a ccusage-shaped fixture whose active block's window bounds are relative
# to a fixed NOW, then asserts the {remainPct, resetAt, shouldFire} decision.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="${SCRIPT_DIR}/budget-gate.sh"

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

if [ ! -f "${LIB}" ]; then
    echo "FATAL: ${LIB} not found"
    exit 2
fi

# shellcheck source=/dev/null
. "${LIB}"

# Fixed reference instant for all fixtures: 2026-07-05T20:00:00Z.
NOW_EPOCH=$(date -u -d '2026-07-05T20:00:00Z' +%s)

iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%S.000Z; }

# Emit a minimal ccusage blocks payload with a single active block whose window
# runs [start_epoch, end_epoch]. Extra inactive/gap blocks are included so the
# gate must actually select on isActive rather than taking blocks[0].
active_block_json() {
    local start_epoch="$1" end_epoch="$2"
    cat <<EOF
{
  "blocks": [
    { "id": "old", "isActive": false, "isGap": false,
      "startTime": "$(iso $((start_epoch - 18000)))",
      "endTime": "$(iso "${start_epoch}")" },
    { "id": "gap", "isActive": false, "isGap": true,
      "startTime": "$(iso "${start_epoch}")",
      "endTime": "$(iso "${end_epoch}")" },
    { "id": "active", "isActive": true, "isGap": false,
      "startTime": "$(iso "${start_epoch}")",
      "endTime": "$(iso "${end_epoch}")" }
  ]
}
EOF
}

#-------------------------------------------------------------------------------
# Test 1: fresh window (just reset) → shouldFire=true, remainPct ~100,
#         resetAt = active block endTime (AC 1, 3; behavior 1).
#-------------------------------------------------------------------------------
test_fresh_window_fires() {
    echo "TEST: fresh window fires"

    local start=$((NOW_EPOCH - 60))            # started 1 minute ago
    local end=$((start + 18000))               # 5-hour window
    local out
    out="$(active_block_json "${start}" "${end}" | BUDGET_GATE_NOW="${NOW_EPOCH}" budget_gate)"
    local rc=$?

    if [ "${rc}" -ne 0 ]; then
        fail "fresh window should exit 0" "rc=${rc} out=${out}"
        return
    fi

    local should remain reset
    should="$(printf '%s' "${out}" | jq -r '.shouldFire')"
    remain="$(printf '%s' "${out}" | jq -r '.remainPct')"
    reset="$(printf '%s' "${out}" | jq -r '.resetAt')"

    if [ "${should}" != "true" ]; then
        fail "fresh window must fire" "out=${out}"
        return
    fi
    # ~99% remaining; assert >= 90 (the freshness threshold).
    if ! awk "BEGIN{exit !(${remain} >= 90)}"; then
        fail "fresh window remainPct must be >= 90" "remainPct=${remain}"
        return
    fi
    if [ "${reset}" != "$(iso "${end}")" ]; then
        fail "resetAt must equal active block endTime" "got=${reset} want=$(iso "${end}")"
        return
    fi

    pass "fresh window fires"
}

#-------------------------------------------------------------------------------
# Test 2: mid / near-empty window → shouldFire=false (AC 2; behavior 2).
#-------------------------------------------------------------------------------
test_mid_window_waits() {
    echo "TEST: mid window waits"

    local start=$((NOW_EPOCH - 9000))          # 2.5h into a 5h window
    local end=$((start + 18000))
    local out should remain
    out="$(active_block_json "${start}" "${end}" | BUDGET_GATE_NOW="${NOW_EPOCH}" budget_gate)"
    should="$(printf '%s' "${out}" | jq -r '.shouldFire')"
    remain="$(printf '%s' "${out}" | jq -r '.remainPct')"

    if [ "${should}" != "false" ]; then
        fail "mid window must not fire" "out=${out}"
        return
    fi
    if ! awk "BEGIN{exit !(${remain} < 90 && ${remain} > 0)}"; then
        fail "mid window remainPct must be between 0 and 90" "remainPct=${remain}"
        return
    fi

    pass "mid window waits"
}

test_near_empty_window_waits() {
    echo "TEST: near-empty window waits"

    local start=$((NOW_EPOCH - 17640))         # ~4.9h into a 5h window
    local end=$((start + 18000))
    local out should
    out="$(active_block_json "${start}" "${end}" | BUDGET_GATE_NOW="${NOW_EPOCH}" budget_gate)"
    should="$(printf '%s' "${out}" | jq -r '.shouldFire')"

    if [ "${should}" != "false" ]; then
        fail "near-empty window must not fire" "out=${out}"
        return
    fi

    pass "near-empty window waits"
}

#-------------------------------------------------------------------------------
# Test 3: malformed / empty ccusage JSON → degraded, non-zero exit, no fire
#         (AC 4; behavior 3). The daemon uses the non-zero exit to switch to its
#         JSONL-mtime reset estimate; the gate itself must not crash.
#-------------------------------------------------------------------------------
test_malformed_json_degrades() {
    echo "TEST: malformed JSON degrades without crashing"

    local out rc
    out="$(printf 'not json at all' | BUDGET_GATE_NOW="${NOW_EPOCH}" budget_gate)"
    rc=$?

    if [ "${rc}" -eq 0 ]; then
        fail "malformed JSON must exit non-zero (degraded)" "out=${out}"
        return
    fi
    if [ "$(printf '%s' "${out}" | jq -r '.shouldFire' 2>/dev/null)" = "true" ]; then
        fail "malformed JSON must never fire" "out=${out}"
        return
    fi

    pass "malformed JSON degrades without crashing"
}

test_no_active_block_degrades() {
    echo "TEST: no active block degrades without firing"

    local out rc should
    out="$(printf '{"blocks":[{"id":"x","isActive":false,"isGap":false,"startTime":"'"$(iso "${NOW_EPOCH}")"'","endTime":"'"$(iso $((NOW_EPOCH + 18000)))"'"}]}' \
        | BUDGET_GATE_NOW="${NOW_EPOCH}" budget_gate)"
    rc=$?
    should="$(printf '%s' "${out}" | jq -r '.shouldFire' 2>/dev/null)"

    if [ "${rc}" -eq 0 ]; then
        fail "no active block must exit non-zero (degraded)" "out=${out}"
        return
    fi
    if [ "${should}" = "true" ]; then
        fail "no active block must not fire" "out=${out}"
        return
    fi

    pass "no active block degrades without firing"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "budget-gate.sh tests"
echo "=========================================="

test_fresh_window_fires
test_mid_window_waits
test_near_empty_window_waits
test_malformed_json_degrades
test_no_active_block_degrades

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
