#!/usr/bin/env bash
# Tests for scripts/claude-agent/run-tests.sh
#
# Run: bash scripts/claude-agent/run-tests.test.sh
#
# Strategy: run-tests.sh is the aggregate suite runner wired into CI (#304). It
# discovers every *.test.sh under a root directory and runs each one, and its
# exit code must reflect whether ANY suite failed. These tests point the runner
# at throwaway temp dirs of fake suites so we can drive pass/fail permutations
# deterministically without depending on the real daemon suites. The critical
# property (AC3) is that a failure in the MIDDLE of the discovered list is not
# masked by later-passing suites: the aggregate exit must still be non-zero.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER="${SCRIPT_DIR}/run-tests.sh"

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

if [ ! -f "${RUNNER}" ]; then
    echo "FATAL: ${RUNNER} not found"
    exit 2
fi

# Write an executable fake *.test.sh into $1 named $2 that exits with code $3.
# It also appends its own basename to ${RAN_LOG} so a test can assert which
# suites actually executed (proves the runner did not abort early).
make_suite() {
    local dir="$1" name="$2" exit_code="$3"
    cat >"${dir}/${name}" <<EOF
#!/usr/bin/env bash
echo "\$(basename "\${BASH_SOURCE[0]}")" >>"${RAN_LOG}"
exit ${exit_code}
EOF
    chmod +x "${dir}/${name}"
}

#-------------------------------------------------------------------------------
# Test 1: all suites pass -> aggregate exit 0.
#-------------------------------------------------------------------------------
test_all_pass_exits_zero() {
    echo "TEST: all-passing suites yield exit 0"

    local dir rc
    dir="$(mktemp -d)"
    RAN_LOG="$(mktemp)"
    make_suite "${dir}" "a_ok.test.sh" 0
    make_suite "${dir}" "b_ok.test.sh" 0

    bash "${RUNNER}" "${dir}" >/dev/null 2>&1
    rc=$?

    if [ "${rc}" -ne 0 ]; then
        fail "all-passing suites must exit 0" "rc=${rc}"
    else
        pass "all-passing suites yield exit 0"
    fi

    rm -rf "${dir}" "${RAN_LOG}"
}

#-------------------------------------------------------------------------------
# Test 2 (AC3): a failure in the MIDDLE of the discovered list must yield a
# non-zero aggregate exit, and later suites must still run (not masked, not
# short-circuited). Suites are named so sorted discovery order is a, b, c with
# the failure at b.
#-------------------------------------------------------------------------------
test_mid_list_failure_not_masked() {
    echo "TEST: a mid-list suite failure fails the aggregate and later suites still run"

    local dir rc
    dir="$(mktemp -d)"
    RAN_LOG="$(mktemp)"
    make_suite "${dir}" "a_ok.test.sh" 0
    make_suite "${dir}" "b_fail.test.sh" 1
    make_suite "${dir}" "c_ok.test.sh" 0

    bash "${RUNNER}" "${dir}" >/dev/null 2>&1
    rc=$?

    if [ "${rc}" -eq 0 ]; then
        fail "mid-list failure must not be masked" "aggregate exit was 0"
    elif ! grep -q "c_ok.test.sh" "${RAN_LOG}"; then
        fail "later suites must still run after a mid-list failure" \
            "c_ok.test.sh did not execute; ran=$(tr '\n' ',' <"${RAN_LOG}")"
    else
        pass "mid-list failure fails aggregate and later suites still run"
    fi

    rm -rf "${dir}" "${RAN_LOG}"
}

#-------------------------------------------------------------------------------
# Test 3 (AC2): discovery is recursive and dynamic — a suite in a nested
# subdirectory is picked up with no configuration, mirroring lib/*.test.sh.
# Non-*.test.sh files (libraries, the runner itself) are NOT executed, so a
# plain *.sh that exits non-zero must not fail the aggregate.
#-------------------------------------------------------------------------------
test_recursive_discovery_and_name_filter() {
    echo "TEST: nested *.test.sh is discovered; non-test *.sh is ignored"

    local dir rc
    dir="$(mktemp -d)"
    RAN_LOG="$(mktemp)"
    mkdir -p "${dir}/nested"
    make_suite "${dir}/nested" "deep.test.sh" 0
    # A non-suite script that would fail if it were (wrongly) executed.
    cat >"${dir}/helper.sh" <<EOF
#!/usr/bin/env bash
echo "helper.sh" >>"${RAN_LOG}"
exit 1
EOF
    chmod +x "${dir}/helper.sh"

    bash "${RUNNER}" "${dir}" >/dev/null 2>&1
    rc=$?

    if [ "${rc}" -ne 0 ]; then
        fail "non-test helper.sh must not be run as a suite" "rc=${rc}"
    elif ! grep -q "deep.test.sh" "${RAN_LOG}"; then
        fail "nested *.test.sh must be discovered recursively" \
            "ran=$(tr '\n' ',' <"${RAN_LOG}")"
    elif grep -q "helper.sh" "${RAN_LOG}"; then
        fail "helper.sh (non-*.test.sh) must not be executed" \
            "ran=$(tr '\n' ',' <"${RAN_LOG}")"
    else
        pass "nested suite discovered; non-test script ignored"
    fi

    rm -rf "${dir}" "${RAN_LOG}"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "run-tests.sh tests"
echo "=========================================="

test_all_pass_exits_zero
test_mid_list_failure_not_masked
test_recursive_discovery_and_name_filter

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
