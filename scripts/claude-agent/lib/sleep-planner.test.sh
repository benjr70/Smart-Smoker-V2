#!/usr/bin/env bash
# Tests for scripts/claude-agent/lib/sleep-planner.sh
#
# Run: bash scripts/claude-agent/lib/sleep-planner.test.sh
#
# Strategy: sleep_planner is a pure function of (resetAt, now). It never sleeps
# or reads the clock — it only computes how long the daemon *should* sleep and
# how it should poll after waking. Tests pass an explicit `now` and assert the
# {sleepSecs, pollIntervalSecs, pollMaxAttempts, degraded} plan.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="${SCRIPT_DIR}/sleep-planner.sh"

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

NOW_ISO="2026-07-05T20:00:00.000Z"
NOW_EPOCH=$(date -u -d "${NOW_ISO}" +%s)
iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%S.000Z; }

#-------------------------------------------------------------------------------
# Test 1: reset in the future → sleep until reset; a poll plan is present
#         (AC 2; behavior 4). Poll cadence/cap come from env defaults.
#-------------------------------------------------------------------------------
test_reset_in_future() {
    echo "TEST: reset in the future sleeps until reset"

    local reset out sleep_secs degraded interval attempts
    reset="$(iso $((NOW_EPOCH + 7200)))"       # resets in 2 hours
    out="$(sleep_planner "${reset}" "${NOW_ISO}")"
    local rc=$?

    if [ "${rc}" -ne 0 ]; then
        fail "future reset should exit 0" "rc=${rc} out=${out}"
        return
    fi

    sleep_secs="$(printf '%s' "${out}" | jq -r '.sleepSecs')"
    degraded="$(printf '%s' "${out}" | jq -r '.degraded')"
    interval="$(printf '%s' "${out}" | jq -r '.pollIntervalSecs')"
    attempts="$(printf '%s' "${out}" | jq -r '.pollMaxAttempts')"

    if [ "${sleep_secs}" != "7200" ]; then
        fail "sleepSecs must equal seconds until reset" "got=${sleep_secs} want=7200"
        return
    fi
    if [ "${degraded}" != "false" ]; then
        fail "known future reset must not be degraded" "out=${out}"
        return
    fi
    if ! [ "${interval}" -gt 0 ] 2>/dev/null || ! [ "${attempts}" -gt 0 ] 2>/dev/null; then
        fail "a positive poll plan must be present" "out=${out}"
        return
    fi

    pass "reset in the future sleeps until reset"
}

#-------------------------------------------------------------------------------
# Test 2: reset already passed → sleepSecs=0, poll immediately (behavior 4).
#-------------------------------------------------------------------------------
test_reset_already_passed() {
    echo "TEST: reset already passed polls immediately"

    local reset out sleep_secs degraded
    reset="$(iso $((NOW_EPOCH - 3600)))"       # reset was an hour ago
    out="$(sleep_planner "${reset}" "${NOW_ISO}")"
    sleep_secs="$(printf '%s' "${out}" | jq -r '.sleepSecs')"
    degraded="$(printf '%s' "${out}" | jq -r '.degraded')"

    if [ "${sleep_secs}" != "0" ]; then
        fail "passed reset must sleep 0" "got=${sleep_secs}"
        return
    fi
    if [ "${degraded}" != "false" ]; then
        fail "passed reset is known, not degraded" "out=${out}"
        return
    fi

    pass "reset already passed polls immediately"
}

#-------------------------------------------------------------------------------
# Test 3: reset missing/empty → degraded fallback: a positive default sleep so
#         the daemon stays alive rather than busy-looping (AC 4; behavior 4).
#-------------------------------------------------------------------------------
test_reset_missing_degrades() {
    echo "TEST: missing reset uses degraded default sleep"

    local out sleep_secs degraded
    out="$(SLEEP_DEGRADED_SECS=18000 sleep_planner "" "${NOW_ISO}")"
    sleep_secs="$(printf '%s' "${out}" | jq -r '.sleepSecs')"
    degraded="$(printf '%s' "${out}" | jq -r '.degraded')"

    if [ "${degraded}" != "true" ]; then
        fail "missing reset must be flagged degraded" "out=${out}"
        return
    fi
    if [ "${sleep_secs}" != "18000" ]; then
        fail "degraded sleep must use SLEEP_DEGRADED_SECS" "got=${sleep_secs} want=18000"
        return
    fi

    pass "missing reset uses degraded default sleep"
}

test_reset_unparseable_degrades() {
    echo "TEST: unparseable reset uses degraded default sleep"

    local out degraded
    out="$(SLEEP_DEGRADED_SECS=18000 sleep_planner "not-a-timestamp" "${NOW_ISO}")"
    degraded="$(printf '%s' "${out}" | jq -r '.degraded')"

    if [ "${degraded}" != "true" ]; then
        fail "unparseable reset must be flagged degraded" "out=${out}"
        return
    fi

    pass "unparseable reset uses degraded default sleep"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "sleep-planner.sh tests"
echo "=========================================="

test_reset_in_future
test_reset_already_passed
test_reset_missing_degrades
test_reset_unparseable_degrades

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
