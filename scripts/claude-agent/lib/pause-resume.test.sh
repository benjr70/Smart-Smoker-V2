#!/usr/bin/env bash
# Tests for scripts/claude-agent/lib/pause-resume.sh
#
# Run: bash scripts/claude-agent/lib/pause-resume.test.sh
#
# Strategy: pause_resume_action is a pure function of the current label/count
# state — is there a `team:paused` issue, and how many times has it paused. It
# never touches gh, git, or the network; the caller reads the label state and
# the issue's pause count and hands them in. The function decides the single
# thing the pacing loop needs: resume the paused issue, pick a new one, or give
# up on an issue that has paused too many times. The resume-vs-fail cap is the
# core safety property (a too-big issue must not loop forever), so it is covered
# most thoroughly.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="${SCRIPT_DIR}/pause-resume.sh"

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
# Test 1: one team:paused issue below the cap → resume it (behavior 1; AC 1).
#         The action names the paused issue so the picker resumes THAT branch.
#-------------------------------------------------------------------------------
test_paused_issue_resumes() {
    echo "TEST: a paused issue below the cap resumes"

    local out action issue rc
    out="$(pause_resume_action 290 1)"
    rc=$?

    if [ "${rc}" -ne 0 ]; then
        fail "resume decision should exit 0" "rc=${rc} out=${out}"
        return
    fi

    action="$(printf '%s' "${out}" | jq -r '.action')"
    issue="$(printf '%s' "${out}" | jq -r '.issue')"

    if [ "${action}" != "resume" ]; then
        fail "one paused issue must resume" "got action=${action} out=${out}"
        return
    fi
    if [ "${issue}" != "290" ]; then
        fail "resume must name the paused issue" "got issue=${issue} out=${out}"
        return
    fi

    pass "a paused issue below the cap resumes"
}

#-------------------------------------------------------------------------------
# Test 2: no team:paused issue → pick a new issue (behavior 2; AC 1). With no
#         in-flight work to finish, the picker proceeds to its normal fresh pick.
#-------------------------------------------------------------------------------
test_no_paused_picks_new() {
    echo "TEST: no paused issue picks new"

    local out action issue
    out="$(pause_resume_action "" "")"
    action="$(printf '%s' "${out}" | jq -r '.action')"
    issue="$(printf '%s' "${out}" | jq -r '.issue')"

    if [ "${action}" != "pick-new" ]; then
        fail "no paused issue must pick-new" "got action=${action} out=${out}"
        return
    fi
    if [ "${issue}" != "null" ]; then
        fail "pick-new names no issue" "got issue=${issue} out=${out}"
        return
    fi

    pass "no paused issue picks new"
}

#-------------------------------------------------------------------------------
# Test 3: a paused issue that has reached the cap → fail, not resume
#         (behavior 3; AC 4). A too-big issue is handed to a human instead of
#         bouncing across windows forever.
#-------------------------------------------------------------------------------
test_cap_reached_fails() {
    echo "TEST: reaching the resume cap fails the issue"

    local out action issue
    out="$(pause_resume_action 290 3)"      # default cap is 3
    action="$(printf '%s' "${out}" | jq -r '.action')"
    issue="$(printf '%s' "${out}" | jq -r '.issue')"

    if [ "${action}" != "fail" ]; then
        fail "issue at the cap must fail, not resume" "got action=${action} out=${out}"
        return
    fi
    if [ "${issue}" != "290" ]; then
        fail "fail must name the capped issue" "got issue=${issue} out=${out}"
        return
    fi

    pass "reaching the resume cap fails the issue"
}

#-------------------------------------------------------------------------------
# Test 4: one pause below the cap boundary still resumes (behavior 1; AC 4).
#         Guards the off-by-one: the 2nd pause (count 2, cap 3) resumes; only the
#         3rd fails.
#-------------------------------------------------------------------------------
test_below_cap_boundary_resumes() {
    echo "TEST: just below the cap still resumes"

    local out action
    out="$(pause_resume_action 290 2)"
    action="$(printf '%s' "${out}" | jq -r '.action')"

    if [ "${action}" != "resume" ]; then
        fail "count below cap must resume" "got action=${action} out=${out}"
        return
    fi

    pass "just below the cap still resumes"
}

#-------------------------------------------------------------------------------
# Test 5: the cap is tunable via PAUSE_RESUME_CAP (AC 4). Lowering it to 2 makes
#         the 2nd pause fail; raising it above the count keeps it resuming.
#-------------------------------------------------------------------------------
test_cap_is_configurable() {
    echo "TEST: the resume cap is configurable"

    local out action
    out="$(PAUSE_RESUME_CAP=2 pause_resume_action 290 2)"
    action="$(printf '%s' "${out}" | jq -r '.action')"
    if [ "${action}" != "fail" ]; then
        fail "cap=2 must fail at count 2" "got action=${action} out=${out}"
        return
    fi

    out="$(PAUSE_RESUME_CAP=5 pause_resume_action 290 3)"
    action="$(printf '%s' "${out}" | jq -r '.action')"
    if [ "${action}" != "resume" ]; then
        fail "cap=5 must still resume at count 3" "got action=${action} out=${out}"
        return
    fi

    pass "the resume cap is configurable"
}

#-------------------------------------------------------------------------------
# Test 6: a paused issue with an unreadable pause count still resumes — a read
#         glitch must not fail the work (fail-safe toward finishing). AC 1/AC 4.
#-------------------------------------------------------------------------------
test_unreadable_count_resumes() {
    echo "TEST: unreadable pause count resumes fail-safe"

    local out action
    out="$(pause_resume_action 290 "")"
    action="$(printf '%s' "${out}" | jq -r '.action')"
    if [ "${action}" != "resume" ]; then
        fail "empty count with a paused issue must resume" "got action=${action} out=${out}"
        return
    fi

    out="$(pause_resume_action 290 "not-a-number")"
    action="$(printf '%s' "${out}" | jq -r '.action')"
    if [ "${action}" != "resume" ]; then
        fail "non-numeric count with a paused issue must resume" "got action=${action} out=${out}"
        return
    fi

    pass "unreadable pause count resumes fail-safe"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "pause-resume.sh tests"
echo "=========================================="

test_paused_issue_resumes
test_no_paused_picks_new
test_cap_reached_fails
test_below_cap_boundary_resumes
test_cap_is_configurable
test_unreadable_count_resumes

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
