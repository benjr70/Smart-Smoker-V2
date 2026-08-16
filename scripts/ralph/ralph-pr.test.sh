#!/usr/bin/env bash
# Tests for scripts/ralph/ralph-pr.sh
#
# Run: bash scripts/ralph/ralph-pr.test.sh
#
# Strategy: ralph-pr.sh's observable behavior is the `gh pr create` invocation
# it produces (title + body) and whether it opens a PR at all. The tests run the
# real script end-to-end with `gh` and `git` mocked on PATH — the same pattern
# promote-images.test.sh uses for `docker` — then assert on the recorded
# arguments. The generated title is fed to the *real* validator
# (scripts/validate-pr-title.sh) rather than to a regex copy of its rules, so
# this suite cannot drift from the check that gates PRs.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RALPH_PR_SCRIPT="${SCRIPT_DIR}/ralph-pr.sh"
VALIDATE_SCRIPT="${SCRIPT_DIR}/../validate-pr-title.sh"

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

for required in "${RALPH_PR_SCRIPT}" "${VALIDATE_SCRIPT}"; do
    if [ ! -f "${required}" ]; then
        echo "FATAL: ${required} not found"
        exit 2
    fi
done

# Builds a mock bin dir containing `gh` and `git`. The mocks answer only the
# handful of subcommands ralph-pr.sh uses and record `gh pr create` arguments,
# one per line, into ${MOCK_DIR}/pr-create-args.
make_mocks() {
    local mock_dir
    mock_dir="$(mktemp -d)"

    cat > "${mock_dir}/gh" <<'EOF'
#!/usr/bin/env bash
case "$1 $2" in
  "issue view")
    echo "${MOCK_PRD_TITLE}"
    ;;
  "issue list")
    echo "${MOCK_DONE_ISSUES_JSON}"
    ;;
  "pr create")
    shift 2
    printf '%s\n' "$@" > "${MOCK_PR_CREATE_ARGS}"
    echo "https://github.com/benjr70/Smart-Smoker-V2/pull/999"
    ;;
  *)
    echo "unexpected gh call: $*" >&2
    exit 1
    ;;
esac
EOF

    cat > "${mock_dir}/git" <<'EOF'
#!/usr/bin/env bash
case "$1 $2" in
  "branch --show-current")
    echo "${MOCK_BRANCH}"
    ;;
  "ls-remote --exit-code")
    # Branch already on the remote: no push needed.
    exit 0
    ;;
  "push -u")
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
EOF

    chmod +x "${mock_dir}/gh" "${mock_dir}/git"
    echo "${mock_dir}"
}

# Runs ralph-pr.sh with mocks in place.
# Args: <prd-number> [extra env assignments...]
# Sets RUN_STATUS, RUN_STDERR, PR_CREATE_ARGS_FILE (may be absent if no PR).
run_ralph_pr() {
    local prd_number="$1"
    shift

    MOCK_DIR="$(make_mocks)"
    PR_CREATE_ARGS_FILE="${MOCK_DIR}/pr-create-args"
    local err_file="${MOCK_DIR}/stderr"

    env PATH="${MOCK_DIR}:${PATH}" \
        MOCK_PRD_TITLE="${MOCK_PRD_TITLE}" \
        MOCK_DONE_ISSUES_JSON="${MOCK_DONE_ISSUES_JSON}" \
        MOCK_BRANCH="${MOCK_BRANCH:-feat/ralph-run}" \
        MOCK_PR_CREATE_ARGS="${PR_CREATE_ARGS_FILE}" \
        "$@" \
        bash "${RALPH_PR_SCRIPT}" "${prd_number}" >/dev/null 2>"${err_file}"
    RUN_STATUS=$?
    RUN_STDERR="$(cat "${err_file}")"
}

cleanup_run() {
    rm -rf "${MOCK_DIR}"
}

# Pulls the value that followed a flag in the recorded `gh pr create` args.
recorded_flag_value() {
    local flag="$1"
    awk -v flag="${flag}" '
        found { print; exit }
        $0 == flag { found = 1; next }
    ' "${PR_CREATE_ARGS_FILE}"
}

# Multi-line values (the body) need the whole remainder, not just one line.
recorded_body() {
    awk '
        found { print }
        $0 == "--body" { found = 1 }
    ' "${PR_CREATE_ARGS_FILE}"
}

DEFAULT_DONE_ISSUES_JSON='[{"number":501,"title":"prod-deploy builds images from release tag"},{"number":500,"title":"release-please config and manifest bootstrap"}]'

#-------------------------------------------------------------------------------
# Test 1: the generated title passes the real PR-title validator
#-------------------------------------------------------------------------------
test_generated_title_passes_validator() {
    echo "TEST: generated PR title passes scripts/validate-pr-title.sh"

    MOCK_PRD_TITLE="PRD: Release Please — merge release PR = auto prod deploy"
    MOCK_DONE_ISSUES_JSON="${DEFAULT_DONE_ISSUES_JSON}"
    run_ralph_pr 498

    if [ "${RUN_STATUS}" -ne 0 ]; then
        fail "script should exit 0" "exit=${RUN_STATUS} stderr: ${RUN_STDERR}"
        cleanup_run
        return
    fi

    if [ ! -f "${PR_CREATE_ARGS_FILE}" ]; then
        fail "script should call gh pr create" "no recorded args"
        cleanup_run
        return
    fi

    local title
    title="$(recorded_flag_value "--title")"

    local validator_err
    validator_err="$(env -u PR_TITLE bash "${VALIDATE_SCRIPT}" "${title}" 2>&1 >/dev/null)"
    local validator_status=$?

    cleanup_run

    if [ "${validator_status}" -ne 0 ]; then
        fail "generated title must satisfy the validator" "title: '${title}' -> ${validator_err}"
        return
    fi

    pass "generated PR title passes the validator (title: '${title}')"
}

#-------------------------------------------------------------------------------
# Test 2: assorted PRD titles all yield validator-clean titles
#-------------------------------------------------------------------------------
test_varied_prd_titles_pass_validator() {
    echo "TEST: varied PRD titles all yield validator-clean PR titles"

    local prd_titles=(
        "PRD: Notifications overhaul"
        "PRD - UI 1:1 parity with the mock"
        "Backend data-integrity hardening"
        "PRD: Closes #123 regression sweep"
    )

    local prd_title title validator_err validator_status
    for prd_title in "${prd_titles[@]}"; do
        MOCK_PRD_TITLE="${prd_title}"
        MOCK_DONE_ISSUES_JSON="${DEFAULT_DONE_ISSUES_JSON}"
        run_ralph_pr 498

        if [ "${RUN_STATUS}" -ne 0 ] || [ ! -f "${PR_CREATE_ARGS_FILE}" ]; then
            fail "PR should be opened for PRD title '${prd_title}'" "exit=${RUN_STATUS} stderr: ${RUN_STDERR}"
            cleanup_run
            return
        fi

        title="$(recorded_flag_value "--title")"
        validator_err="$(env -u PR_TITLE bash "${VALIDATE_SCRIPT}" "${title}" 2>&1 >/dev/null)"
        validator_status=$?
        cleanup_run

        if [ "${validator_status}" -ne 0 ]; then
            fail "title from PRD '${prd_title}' must satisfy the validator" "title: '${title}' -> ${validator_err}"
            return
        fi
    done

    pass "varied PRD titles all yield validator-clean PR titles"
}

#-------------------------------------------------------------------------------
# Test 3: the PRD name survives into the title (not just a generic subject)
#-------------------------------------------------------------------------------
test_title_carries_prd_description() {
    echo "TEST: PR title carries the PRD description without the 'PRD:' prefix"

    MOCK_PRD_TITLE="PRD: Release Please — merge release PR = auto prod deploy"
    MOCK_DONE_ISSUES_JSON="${DEFAULT_DONE_ISSUES_JSON}"
    run_ralph_pr 498

    local title
    title="$(recorded_flag_value "--title")"
    cleanup_run

    if ! grep -qF "Release Please" <<<"${title}"; then
        fail "title should describe the PRD" "title: '${title}'"
        return
    fi

    # 'feat: PRD: ...' is technically valid but reads badly in a changelog.
    if grep -qiE '^[a-z]+(\([^)]*\))?!?: *PRD *[:-]' <<<"${title}"; then
        fail "title should drop the redundant 'PRD:' prefix" "title: '${title}'"
        return
    fi

    pass "PR title carries the PRD description without the 'PRD:' prefix"
}

#-------------------------------------------------------------------------------
# Test 4: body keeps a Closes #N line per completed issue (auto-close)
#-------------------------------------------------------------------------------
test_body_contains_closes_lines() {
    echo "TEST: PR body contains a Closes #N line for every completed issue"

    MOCK_PRD_TITLE="PRD: Release Please — merge release PR = auto prod deploy"
    MOCK_DONE_ISSUES_JSON="${DEFAULT_DONE_ISSUES_JSON}"
    run_ralph_pr 498

    local body
    body="$(recorded_body)"
    cleanup_run

    local n
    for n in 501 500; do
        if ! grep -qE "Closes #${n}\b" <<<"${body}"; then
            fail "body should close issue #${n}" "body: ${body}"
            return
        fi
    done

    pass "PR body contains a Closes #N line for every completed issue"
}

#-------------------------------------------------------------------------------
# Test 5: the issue reference must NOT live in the title
#-------------------------------------------------------------------------------
test_title_has_no_issue_reference() {
    echo "TEST: PR title carries no 'Closes #N' issue reference"

    MOCK_PRD_TITLE="PRD: Release Please — merge release PR = auto prod deploy"
    MOCK_DONE_ISSUES_JSON="${DEFAULT_DONE_ISSUES_JSON}"
    run_ralph_pr 498

    local title
    title="$(recorded_flag_value "--title")"
    cleanup_run

    if grep -qiE "closes *#[0-9]+" <<<"${title}"; then
        fail "issue reference belongs in the body, not the title" "title: '${title}'"
        return
    fi

    pass "PR title carries no 'Closes #N' issue reference"
}

#-------------------------------------------------------------------------------
# Test 6: a bad title override fails loudly and opens no PR
#-------------------------------------------------------------------------------
test_invalid_title_override_refuses_to_open_pr() {
    echo "TEST: an invalid title override aborts before gh pr create"

    MOCK_PRD_TITLE="PRD: Release Please — merge release PR = auto prod deploy"
    MOCK_DONE_ISSUES_JSON="${DEFAULT_DONE_ISSUES_JSON}"
    run_ralph_pr 498 RALPH_PR_TITLE="Closes #498: Release Please"

    local status="${RUN_STATUS}" stderr="${RUN_STDERR}"
    local pr_created="no"
    [ -f "${PR_CREATE_ARGS_FILE}" ] && pr_created="yes"
    cleanup_run

    if [ "${status}" -eq 0 ]; then
        fail "invalid title should exit non-zero" "exit=${status}"
        return
    fi

    if [ "${pr_created}" = "yes" ]; then
        fail "invalid title must not open a PR" "gh pr create was called"
        return
    fi

    # The validator's own reason must reach the operator, not be swallowed.
    if ! grep -qF "Invalid PR title" <<<"${stderr}"; then
        fail "validator reason should be surfaced" "stderr: ${stderr}"
        return
    fi

    pass "an invalid title override aborts before gh pr create"
}

#-------------------------------------------------------------------------------
# Test 7: type/scope overrides shape the title
#-------------------------------------------------------------------------------
test_type_and_scope_overrides() {
    echo "TEST: RALPH_PR_TYPE / RALPH_PR_SCOPE shape the generated title"

    MOCK_PRD_TITLE="PRD: Probe offset drift"
    MOCK_DONE_ISSUES_JSON="${DEFAULT_DONE_ISSUES_JSON}"
    run_ralph_pr 498 RALPH_PR_TYPE=fix RALPH_PR_SCOPE=backend

    local title status
    status="${RUN_STATUS}"
    title="$(recorded_flag_value "--title")"
    cleanup_run

    if [ "${status}" -ne 0 ]; then
        fail "overrides should still open a PR" "exit=${status}"
        return
    fi

    if [[ "${title}" != "fix(backend): "* ]]; then
        fail "title should use the overridden type and scope" "title: '${title}'"
        return
    fi

    pass "RALPH_PR_TYPE / RALPH_PR_SCOPE shape the generated title"
}

#-------------------------------------------------------------------------------
# Test 8: an empty derived subject aborts rather than opening 'feat: '
#-------------------------------------------------------------------------------
test_empty_subject_aborts() {
    echo "TEST: a PRD title that derives an empty subject aborts"

    MOCK_PRD_TITLE="PRD:"
    MOCK_DONE_ISSUES_JSON="${DEFAULT_DONE_ISSUES_JSON}"
    run_ralph_pr 498

    local status="${RUN_STATUS}" stderr="${RUN_STDERR}"
    local pr_created="no"
    [ -f "${PR_CREATE_ARGS_FILE}" ] && pr_created="yes"
    cleanup_run

    if [ "${status}" -eq 0 ] || [ "${pr_created}" = "yes" ]; then
        fail "empty subject must not open a PR" "exit=${status} pr_created=${pr_created}"
        return
    fi

    if ! grep -qF "Invalid PR title" <<<"${stderr}"; then
        fail "validator reason should be surfaced" "stderr: ${stderr}"
        return
    fi

    pass "a PRD title that derives an empty subject aborts"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "ralph-pr.sh tests"
echo "=========================================="

test_generated_title_passes_validator
test_varied_prd_titles_pass_validator
test_title_carries_prd_description
test_body_contains_closes_lines
test_title_has_no_issue_reference
test_invalid_title_override_refuses_to_open_pr
test_type_and_scope_overrides
test_empty_subject_aborts

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
