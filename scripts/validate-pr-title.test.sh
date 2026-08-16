#!/usr/bin/env bash
# Tests for scripts/validate-pr-title.sh
#
# Run: bash scripts/validate-pr-title.test.sh
#
# Strategy: validate-pr-title.sh is a pure function of its input — a title
# string in (argument or PR_TITLE env), exit code + reason on stderr out, no
# side effects. Tests therefore invoke it directly and assert on exit code and
# stderr content; no mocks are needed.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATE_SCRIPT="${SCRIPT_DIR}/validate-pr-title.sh"

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

if [ ! -f "${VALIDATE_SCRIPT}" ]; then
    echo "FATAL: ${VALIDATE_SCRIPT} not found"
    exit 2
fi

# Run the validator with a title, capturing stderr into a file.
# Sets RUN_STATUS and RUN_STDERR globals.
run_validator() {
    local title="$1"
    local err_file
    err_file="$(mktemp)"
    env -u PR_TITLE bash "${VALIDATE_SCRIPT}" "${title}" >/dev/null 2>"${err_file}"
    RUN_STATUS=$?
    RUN_STDERR="$(cat "${err_file}")"
    rm -f "${err_file}"
}

#-------------------------------------------------------------------------------
# Test 1: valid conventional titles exit 0
#-------------------------------------------------------------------------------
test_valid_titles_pass() {
    echo "TEST: valid conventional titles exit 0"

    local valid_titles=(
        "feat: x"
        "fix(scope): y"
        "feat!: z"
        "chore(deps): bump"
        "refactor(device-service)!: drop legacy serial path"
        "docs: update readme"
        "ci: add release workflow"
        "test: cover edge case"
        "perf: speed up chart render"
        "build: bump webpack"
        "style: reformat"
        "revert: feat: bad idea"
    )

    local title
    for title in "${valid_titles[@]}"; do
        run_validator "${title}"
        if [ "${RUN_STATUS}" -ne 0 ]; then
            fail "valid titles should exit 0" "rejected '${title}': ${RUN_STDERR}"
            return
        fi
    done

    pass "valid titles exit 0"
}

#-------------------------------------------------------------------------------
# Test 2: invalid titles exit non-zero with a reason on stderr
#-------------------------------------------------------------------------------
test_invalid_titles_fail_with_reason() {
    echo "TEST: invalid titles exit non-zero with a reason"

    local invalid_titles=(
        ""
        "Feature: x"
        "feat:no-space"
        "wibble: unknown type"
        "feat: "
        "just a plain sentence"
        "FEAT: shouting"
        "feat(): empty scope"
        "feat( scope): leading space in scope"
        "feat(scope ): trailing space in scope"
        "feat(my scope): inner space in scope"
    )

    local title
    for title in "${invalid_titles[@]}"; do
        run_validator "${title}"
        if [ "${RUN_STATUS}" -eq 0 ]; then
            fail "invalid titles should exit non-zero" "accepted '${title}'"
            return
        fi
        if [ -z "${RUN_STDERR}" ]; then
            fail "invalid titles should print a reason" "no stderr for '${title}'"
            return
        fi
    done

    pass "invalid titles exit non-zero with a reason"
}

#-------------------------------------------------------------------------------
# Test 3: legacy "Closes #N: ..." shape gets a targeted message
#-------------------------------------------------------------------------------
test_legacy_closes_shape_gets_targeted_message() {
    echo "TEST: legacy 'Closes #N: ...' title points at the conventional format"

    # Spacing between "Closes" and "#N" varies in the wild; every shape should
    # get the same targeted guidance rather than a generic type/scope error.
    local legacy_titles=(
        "Closes #484: UI parity slice 10"
        "Closes#499: add thing"
        "closes  #12: lowercase, double space"
    )

    local title
    for title in "${legacy_titles[@]}"; do
        run_validator "${title}"
        if [ "${RUN_STATUS}" -eq 0 ]; then
            fail "legacy Closes title should be rejected" "accepted '${title}'"
            return
        fi
        if ! grep -qi "closes #" <<<"${RUN_STDERR}"; then
            fail "legacy Closes title should be named in the reason" "'${title}' stderr: ${RUN_STDERR}"
            return
        fi
        if ! grep -qi "body" <<<"${RUN_STDERR}"; then
            fail "legacy Closes reason should say to move it to the PR body" "'${title}' stderr: ${RUN_STDERR}"
            return
        fi
        if ! grep -q "feat(scope)" <<<"${RUN_STDERR}"; then
            fail "legacy Closes reason should show the conventional format" "'${title}' stderr: ${RUN_STDERR}"
            return
        fi
    done

    pass "legacy Closes title rejected with a targeted message"
}

#-------------------------------------------------------------------------------
# Test 4: unknown type reason lists the accepted types
#-------------------------------------------------------------------------------
test_unknown_type_reason_lists_accepted_types() {
    echo "TEST: unknown type reason lists the accepted types"

    run_validator "wibble(scope): do a thing"
    if [ "${RUN_STATUS}" -eq 0 ]; then
        fail "unknown type should be rejected" "exit 0"
        return
    fi
    if ! grep -q "wibble" <<<"${RUN_STDERR}"; then
        fail "reason should echo the offending type" "stderr: ${RUN_STDERR}"
        return
    fi
    local t
    for t in feat fix chore docs ci refactor test perf build style revert; do
        if ! grep -q "${t}" <<<"${RUN_STDERR}"; then
            fail "reason should list accepted type '${t}'" "stderr: ${RUN_STDERR}"
            return
        fi
    done

    if ! grep -q "feat, fix, chore" <<<"${RUN_STDERR}"; then
        fail "accepted types should be a comma-space list" "stderr: ${RUN_STDERR}"
        return
    fi

    pass "unknown type reason lists accepted types"
}

#-------------------------------------------------------------------------------
# Test 5: title read from PR_TITLE env when no argument is given
#-------------------------------------------------------------------------------
test_reads_title_from_env() {
    echo "TEST: reads title from PR_TITLE when no argument is given"

    local err_file status
    err_file="$(mktemp)"
    PR_TITLE="feat(backend): add release endpoint" bash "${VALIDATE_SCRIPT}" >/dev/null 2>"${err_file}"
    status=$?
    if [ "${status}" -ne 0 ]; then
        fail "valid PR_TITLE should exit 0" "stderr: $(cat "${err_file}")"
        rm -f "${err_file}"
        return
    fi

    PR_TITLE="Closes #1: nope" bash "${VALIDATE_SCRIPT}" >/dev/null 2>"${err_file}"
    status=$?
    rm -f "${err_file}"
    if [ "${status}" -eq 0 ]; then
        fail "invalid PR_TITLE should exit non-zero" "exit 0"
        return
    fi

    pass "reads title from PR_TITLE env"
}

#-------------------------------------------------------------------------------
# Test 6: no argument and no PR_TITLE exits non-zero with usage
#-------------------------------------------------------------------------------
test_missing_input_exits_nonzero() {
    echo "TEST: missing input exits non-zero with usage"

    local err_file status
    err_file="$(mktemp)"
    env -u PR_TITLE bash "${VALIDATE_SCRIPT}" >/dev/null 2>"${err_file}"
    status=$?
    local err
    err="$(cat "${err_file}")"
    rm -f "${err_file}"

    if [ "${status}" -eq 0 ]; then
        fail "missing input should exit non-zero" "exit 0"
        return
    fi
    if ! grep -qi "usage" <<<"${err}"; then
        fail "missing input should print usage" "stderr: ${err}"
        return
    fi

    pass "missing input exits non-zero with usage"
}

#-------------------------------------------------------------------------------
# Test 7: validator has no side effects on the working tree
#-------------------------------------------------------------------------------
test_no_side_effects() {
    echo "TEST: validator writes nothing to the working directory"

    local tmpdir before after
    tmpdir="$(mktemp -d)"
    before="$(ls -A "${tmpdir}" | wc -l)"
    (cd "${tmpdir}" && env -u PR_TITLE bash "${VALIDATE_SCRIPT}" "feat: x" >/dev/null 2>&1)
    (cd "${tmpdir}" && env -u PR_TITLE bash "${VALIDATE_SCRIPT}" "bogus" >/dev/null 2>&1)
    after="$(ls -A "${tmpdir}" | wc -l)"
    rm -rf "${tmpdir}"

    if [ "${before}" -ne "${after}" ]; then
        fail "validator should not write files" "before=${before} after=${after}"
        return
    fi

    pass "validator writes nothing to the working directory"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "validate-pr-title.sh tests"
echo "=========================================="

test_valid_titles_pass
test_invalid_titles_fail_with_reason
test_legacy_closes_shape_gets_targeted_message
test_unknown_type_reason_lists_accepted_types
test_reads_title_from_env
test_missing_input_exits_nonzero
test_no_side_effects

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
