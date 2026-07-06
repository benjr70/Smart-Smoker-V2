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
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "exhaustion-classifier.sh tests"
echo "=========================================="

test_clean_success_is_ok
test_genuine_failure_is_failed_not_exhausted
test_usage_limit_with_reset_is_exhausted
test_usage_limit_without_reset_is_exhausted_no_resetat

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
