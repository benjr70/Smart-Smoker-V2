#!/usr/bin/env bash
# Tests for scripts/claude-agent/lib/exhaustion-classifier.sh
#
# Run: bash scripts/claude-agent/lib/exhaustion-classifier.test.sh
#
# Strategy: exhaustion_classify is a pure function of (exitCode, captured claude
# output). It never runs claude, git, or gh — it only looks at the exit code it
# is handed and the text piped on stdin and returns the {status, resetAt}
# verdict. Each test feeds a captured-output fixture plus an exit code and
# asserts the classification. The pause-vs-fail distinction (behaviors 2 and 4)
# is the core safety property, so those are covered first and most thoroughly.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="${SCRIPT_DIR}/exhaustion-classifier.sh"

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

#-------------------------------------------------------------------------------
# Test 1: clean success output + exit 0 → OK, no resetAt (behavior 1; AC 1).
#-------------------------------------------------------------------------------
test_clean_success_is_ok() {
    echo "TEST: clean success classifies as OK"

    local out status reset
    out="$(printf '%s\n' \
        "=== agent-run 20260706T000000Z ===" \
        "picking issue #290" \
        "opened PR https://github.com/benjr70/Smart-Smoker-V2/pull/300" \
        "pr-watch verdict: success" \
        | exhaustion_classify 0)"
    local rc=$?

    if [ "${rc}" -ne 0 ]; then
        fail "classifier should always exit 0" "rc=${rc} out=${out}"
        return
    fi

    status="$(printf '%s' "${out}" | jq -r '.status')"
    reset="$(printf '%s' "${out}" | jq -r '.resetAt')"

    if [ "${status}" != "OK" ]; then
        fail "clean success must classify as OK" "out=${out}"
        return
    fi
    if [ -n "${reset}" ] && [ "${reset}" != "null" ]; then
        fail "clean success must have no resetAt" "out=${out}"
        return
    fi

    pass "clean success classifies as OK"
}

#-------------------------------------------------------------------------------
# Test 2 (CRITICAL): a genuine non-usage failure + non-zero exit → FAILED, never
# EXHAUSTED. A real failure must never be swept under the "just out of gas" rug
# (behavior 4; AC 3).
#-------------------------------------------------------------------------------
test_genuine_failure_is_failed_not_exhausted() {
    echo "TEST: genuine failure classifies as FAILED, not EXHAUSTED"

    local out status
    out="$(printf '%s\n' \
        "=== agent-run 20260706T000000Z ===" \
        "FAIL apps/backend/src/temps/temps.service.spec.ts" \
        "  ● TempsService › should persist a reading" \
        "    Expected: 225 Received: undefined" \
        "Tests: 1 failed, 41 passed" \
        "Error: process exited with code 1" \
        | exhaustion_classify 1)"

    status="$(printf '%s' "${out}" | jq -r '.status')"

    if [ "${status}" = "EXHAUSTED" ]; then
        fail "a genuine failure must NEVER classify as EXHAUSTED" "out=${out}"
        return
    fi
    if [ "${status}" != "FAILED" ]; then
        fail "a genuine non-usage failure must classify as FAILED" "out=${out}"
        return
    fi

    pass "genuine failure classifies as FAILED, not EXHAUSTED"
}

#-------------------------------------------------------------------------------
# Test 3 (CRITICAL): usage-limit output carrying a "resets at" instant →
# EXHAUSTED, and the authoritative reset timestamp is scraped and normalized to
# ISO-8601 so the daemon can schedule the next wake off it (behavior 2; AC 1, 5).
#-------------------------------------------------------------------------------
test_usage_limit_with_reset_is_exhausted() {
    echo "TEST: usage limit with reset scrapes resetAt and classifies EXHAUSTED"

    # Claude's own limit notice is a pipe-delimited epoch: "…reached|<epoch>".
    local reset_epoch want_iso out status reset
    reset_epoch=$(date -u -d '2026-07-06T01:00:00Z' +%s)
    want_iso="$(date -u -d "@${reset_epoch}" +%Y-%m-%dT%H:%M:%S.000Z)"

    out="$(printf '%s\n' \
        "=== agent-run 20260706T000000Z ===" \
        "implementing issue #290" \
        "Claude AI usage limit reached|${reset_epoch}" \
        | exhaustion_classify 1)"

    status="$(printf '%s' "${out}" | jq -r '.status')"
    reset="$(printf '%s' "${out}" | jq -r '.resetAt')"

    if [ "${status}" != "EXHAUSTED" ]; then
        fail "usage-limit output must classify as EXHAUSTED" "out=${out}"
        return
    fi
    if [ "${reset}" != "${want_iso}" ]; then
        fail "resetAt must be the scraped reset normalized to ISO-8601" "got=${reset} want=${want_iso}"
        return
    fi

    pass "usage limit with reset scrapes resetAt and classifies EXHAUSTED"
}

#-------------------------------------------------------------------------------
# Test 4: usage-limit output with NO reset instant → still EXHAUSTED (so the run
# pauses, not fails), but resetAt is absent — the daemon falls back to its own
# ccusage estimate for scheduling (behavior 3; AC 1).
#-------------------------------------------------------------------------------
test_usage_limit_without_reset_is_exhausted_no_resetat() {
    echo "TEST: usage limit without a reset line is EXHAUSTED with empty resetAt"

    local out status reset
    out="$(printf '%s\n' \
        "=== agent-run 20260706T000000Z ===" \
        "implementing issue #290" \
        "Error: Claude AI usage limit reached" \
        | exhaustion_classify 1)"

    status="$(printf '%s' "${out}" | jq -r '.status')"
    reset="$(printf '%s' "${out}" | jq -r '.resetAt')"

    if [ "${status}" != "EXHAUSTED" ]; then
        fail "usage-limit output must classify as EXHAUSTED even without a reset" "out=${out}"
        return
    fi
    if [ -n "${reset}" ] && [ "${reset}" != "null" ]; then
        fail "missing reset line must yield an empty resetAt" "out=${out}"
        return
    fi

    pass "usage limit without a reset line is EXHAUSTED with empty resetAt"
}

#-------------------------------------------------------------------------------
# Test 5 (REGRESSION): the live "session limit" notice must classify EXHAUSTED,
# not FAILED. Observed 2026-07-08 — a fire that hit the session cap exited 1 with
# only this line; the old regex missed it, so the daemon rapid-refired ~1271×.
#-------------------------------------------------------------------------------
test_session_limit_is_exhausted() {
    echo "TEST: session limit classifies as EXHAUSTED"

    local out status
    out="$(printf '%s\n' \
        "=== agent-run 20260708T223300Z ===" \
        "prompt: /team-pickup" \
        "You've hit your session limit · resets 10:50pm (America/New_York)" \
        | exhaustion_classify 1)"

    status="$(printf '%s' "${out}" | jq -r '.status')"

    if [ "${status}" = "FAILED" ]; then
        fail "session limit must NOT classify as FAILED (rapid-refire bug)" "out=${out}"
        return
    fi
    if [ "${status}" != "EXHAUSTED" ]; then
        fail "session limit must classify as EXHAUSTED" "out=${out}"
        return
    fi

    pass "session limit classifies as EXHAUSTED"
}

#-------------------------------------------------------------------------------
# Test 6: a wall-clock "resets 10:50pm (America/New_York)" notice scrapes a
# future ISO-8601 UTC reset. With EC_NOW fixed to 2026-07-08T22:00:00-04:00
# (02:00Z next day), 10:50pm EDT is the same evening → 2026-07-09T02:50:00Z.
#-------------------------------------------------------------------------------
test_clock_reset_scrapes_future_iso() {
    echo "TEST: wall-clock reset scrapes a future ISO-8601 instant"

    local now out reset
    now=$(date -u -d '2026-07-09T02:00:00Z' +%s)   # 22:00 EDT Jul 8
    out="$(printf '%s\n' \
        "You've hit your session limit · resets 10:50pm (America/New_York)" \
        | EC_NOW="${now}" exhaustion_classify 1)"

    reset="$(printf '%s' "${out}" | jq -r '.resetAt')"

    if [ "${reset}" != "2026-07-09T02:50:00.000Z" ]; then
        fail "10:50pm EDT after 22:00 EDT must resolve to 02:50Z same night" "got=${reset}"
        return
    fi

    pass "wall-clock reset scrapes a future ISO-8601 instant"
}

#-------------------------------------------------------------------------------
# Test 7: a wall-clock reset time already past "now" rolls to the next day (the
# notice always names a future instant). EC_NOW = 11:00pm EDT, reset 10:50pm →
# tomorrow's 10:50pm EDT = 2026-07-10T02:50:00Z.
#-------------------------------------------------------------------------------
test_clock_reset_rolls_to_next_day() {
    echo "TEST: past wall-clock reset rolls to the next day"

    local now out reset
    now=$(date -u -d '2026-07-09T03:00:00Z' +%s)   # 23:00 EDT Jul 8
    out="$(printf '%s\n' \
        "You've hit your session limit · resets 10:50pm (America/New_York)" \
        | EC_NOW="${now}" exhaustion_classify 1)"

    reset="$(printf '%s' "${out}" | jq -r '.resetAt')"

    if [ "${reset}" != "2026-07-10T02:50:00.000Z" ]; then
        fail "10:50pm EDT after 23:00 EDT must roll to next day 02:50Z" "got=${reset}"
        return
    fi

    pass "past wall-clock reset rolls to the next day"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "exhaustion-classifier.sh tests"
echo "=========================================="

test_clean_success_is_ok
test_genuine_failure_is_failed_not_exhausted
test_usage_limit_with_reset_is_exhausted
test_usage_limit_without_reset_is_exhausted_no_resetat
test_session_limit_is_exhausted
test_clock_reset_scrapes_future_iso
test_clock_reset_rolls_to_next_day

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
