#!/usr/bin/env bash
# Tests for scripts/deploy-cloud.sh
#
# Run: bash scripts/deploy-cloud.test.sh
#
# Strategy: deploy-cloud.sh performs all remote work over `ssh root@<host>`.
# We mock `ssh` (and `docker`, for completeness) by prepending a temp dir to
# PATH. The mock `ssh` appends each invocation to a call log so tests can
# assert on ordering and content. A sentinel env var lets a test force the
# remote health-check to "fail" so we can assert rollback is invoked.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SCRIPT="${SCRIPT_DIR}/deploy-cloud.sh"

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

if [ ! -f "${DEPLOY_SCRIPT}" ]; then
    echo "FATAL: ${DEPLOY_SCRIPT} not found"
    exit 2
fi

# Create a mock bin dir containing `ssh` and `docker` stubs that record their
# invocations to ${SSH_CALL_LOG}. The ssh stub also honors two sentinels:
#   FAIL_ON_MATCH  — if the joined ssh command contains this substring, exit 1
#                    (used to simulate a failing remote health-check)
# Each ssh invocation is logged as a single line: the full argument vector.
make_mock_bin() {
    local mock_dir
    mock_dir="$(mktemp -d)"

    cat > "${mock_dir}/ssh" <<'EOF'
#!/usr/bin/env bash
# Record the full invocation (one line per call).
echo "ssh $*" >> "${SSH_CALL_LOG}"
# Simulate a remote command failure when requested.
if [ -n "${FAIL_ON_MATCH:-}" ] && printf '%s' "$*" | grep -qF "${FAIL_ON_MATCH}"; then
    exit 1
fi
exit 0
EOF
    chmod +x "${mock_dir}/ssh"

    cat > "${mock_dir}/docker" <<'EOF'
#!/usr/bin/env bash
echo "docker $*" >> "${SSH_CALL_LOG}"
exit 0
EOF
    chmod +x "${mock_dir}/docker"

    echo "${mock_dir}"
}

# Return the 1-based line number of the first log line containing the pattern,
# or empty string if not found.
line_of() {
    local pattern="$1" log="$2"
    grep -nF "${pattern}" "${log}" 2>/dev/null | head -1 | cut -d: -f1
}

#-------------------------------------------------------------------------------
# Test 1: happy path issues remote commands in the correct order with the
#         correct host / deploy dir / compose file / version (AC 1, 2)
#-------------------------------------------------------------------------------
test_happy_path_ordering_and_params() {
    echo "TEST: happy path orchestration order + params"

    local tmpdir call_log mock_dir
    tmpdir="$(mktemp -d)"
    call_log="${tmpdir}/ssh-calls.log"
    touch "${call_log}"
    mock_dir="$(make_mock_bin)"
    trap "rm -rf '${tmpdir}' '${mock_dir}'" RETURN

    export SSH_CALL_LOG="${call_log}"
    unset FAIL_ON_MATCH
    # DEPLOY_WAIT_SECONDS=0 keeps the test fast (no real 60s sleep).
    DEPLOY_WAIT_SECONDS=0 PATH="${mock_dir}:${PATH}" \
        bash "${DEPLOY_SCRIPT}" smokecloud /opt/app cloud.docker-compose.yml v1.2.3 serve
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "happy path should exit 0" "got exit code ${exit_code}; calls:
$(cat "${call_log}")"
        return
    fi

    local calls
    calls="$(cat "${call_log}")"

    # Targets the right host on every ssh call.
    if grep -q '^ssh ' "${call_log}" && grep -vq 'root@smokecloud' <(grep '^ssh ' "${call_log}"); then
        fail "every ssh call must target root@smokecloud" "calls:
${calls}"
        return
    fi

    # Deploy dir, compose file, and version must appear in the remote commands.
    for needle in "/opt/app" "cloud.docker-compose.yml" "v1.2.3"; do
        if ! grep -qF "${needle}" "${call_log}"; then
            fail "remote commands must reference ${needle}" "calls:
${calls}"
            return
        fi
    done

    # Ordering: backup → pull → down → up → health-check.
    local l_backup l_pull l_down l_up l_health
    l_backup="$(line_of "deployment-backup.sh" "${call_log}")"
    l_pull="$(line_of "docker compose -f 'cloud.docker-compose.yml' pull" "${call_log}")"
    l_down="$(line_of "docker compose -f 'cloud.docker-compose.yml' down" "${call_log}")"
    l_up="$(line_of "docker compose -f 'cloud.docker-compose.yml' up" "${call_log}")"
    l_health="$(line_of "deployment-health-check.sh" "${call_log}")"

    for pair in "backup:${l_backup}" "pull:${l_pull}" "down:${l_down}" "up:${l_up}" "health:${l_health}"; do
        if [ -z "${pair#*:}" ]; then
            fail "missing orchestration step: ${pair%%:*}" "calls:
${calls}"
            return
        fi
    done

    if ! { [ "${l_backup}" -lt "${l_pull}" ] && [ "${l_pull}" -lt "${l_down}" ] \
        && [ "${l_down}" -lt "${l_up}" ] && [ "${l_up}" -lt "${l_health}" ]; }; then
        fail "orchestration out of order" \
            "backup=${l_backup} pull=${l_pull} down=${l_down} up=${l_up} health=${l_health}
${calls}"
        return
    fi

    pass "happy path orchestration order + params"
}

#-------------------------------------------------------------------------------
# Test 2: health-check failure → rollback is invoked, and the deploy exits
#         non-zero (AC 3). The remote health-check is forced to fail.
#-------------------------------------------------------------------------------
test_health_failure_triggers_rollback() {
    echo "TEST: health-check failure triggers rollback"

    local tmpdir call_log mock_dir
    tmpdir="$(mktemp -d)"
    call_log="${tmpdir}/ssh-calls.log"
    touch "${call_log}"
    mock_dir="$(make_mock_bin)"
    trap "rm -rf '${tmpdir}' '${mock_dir}'" RETURN

    export SSH_CALL_LOG="${call_log}"
    # Force the remote health-check command to fail.
    export FAIL_ON_MATCH="deployment-health-check.sh"
    DEPLOY_WAIT_SECONDS=0 PATH="${mock_dir}:${PATH}" \
        bash "${DEPLOY_SCRIPT}" smokecloud /opt/app cloud.docker-compose.yml v9.9.9 serve >/dev/null 2>&1
    local exit_code=$?
    unset FAIL_ON_MATCH

    local calls
    calls="$(cat "${call_log}")"

    # Rollback must have been invoked.
    local l_health l_rollback
    l_health="$(line_of "deployment-health-check.sh" "${call_log}")"
    l_rollback="$(line_of "rollback.sh" "${call_log}")"

    if [ -z "${l_rollback}" ]; then
        fail "rollback.sh must be invoked when health-check fails" "calls:
${calls}"
        return
    fi

    # Rollback must come AFTER the failed health-check.
    if [ -z "${l_health}" ] || [ "${l_rollback}" -lt "${l_health}" ]; then
        fail "rollback must run after the failed health-check" \
            "health=${l_health} rollback=${l_rollback}
${calls}"
        return
    fi

    # The deploy must report failure (non-zero) when health-check fails.
    if [ "${exit_code}" -eq 0 ]; then
        fail "deploy must exit non-zero on health-check failure" "got exit code 0"
        return
    fi

    pass "health-check failure triggers rollback"
}

#-------------------------------------------------------------------------------
# Test 3: happy path does NOT invoke rollback (rollback only on failure).
#-------------------------------------------------------------------------------
test_happy_path_no_rollback() {
    echo "TEST: happy path does not invoke rollback"

    local tmpdir call_log mock_dir
    tmpdir="$(mktemp -d)"
    call_log="${tmpdir}/ssh-calls.log"
    touch "${call_log}"
    mock_dir="$(make_mock_bin)"
    trap "rm -rf '${tmpdir}' '${mock_dir}'" RETURN

    export SSH_CALL_LOG="${call_log}"
    unset FAIL_ON_MATCH
    DEPLOY_WAIT_SECONDS=0 PATH="${mock_dir}:${PATH}" \
        bash "${DEPLOY_SCRIPT}" smokecloud /opt/app cloud.docker-compose.yml v1.2.3 serve >/dev/null 2>&1
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "happy path should exit 0" "got exit code ${exit_code}"
        return
    fi

    if grep -qF "rollback.sh" "${call_log}"; then
        fail "rollback must NOT run on a successful deploy" "calls:
$(cat "${call_log}")"
        return
    fi

    pass "happy path does not invoke rollback"
}

#-------------------------------------------------------------------------------
# Test 4: expose_mode=serve configures `tailscale serve` (not funnel) (AC 4).
#-------------------------------------------------------------------------------
test_expose_mode_serve() {
    echo "TEST: expose_mode=serve uses tailscale serve"

    local tmpdir call_log mock_dir
    tmpdir="$(mktemp -d)"
    call_log="${tmpdir}/ssh-calls.log"
    touch "${call_log}"
    mock_dir="$(make_mock_bin)"
    trap "rm -rf '${tmpdir}' '${mock_dir}'" RETURN

    export SSH_CALL_LOG="${call_log}"
    unset FAIL_ON_MATCH
    DEPLOY_WAIT_SECONDS=0 PATH="${mock_dir}:${PATH}" \
        bash "${DEPLOY_SCRIPT}" smokecloud /opt/app cloud.docker-compose.yml v1.2.3 serve >/dev/null 2>&1
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "serve mode happy path should exit 0" "got exit code ${exit_code}"
        return
    fi

    local calls
    calls="$(cat "${call_log}")"

    if ! grep -qF "tailscale serve --bg 80" "${call_log}"; then
        fail "serve mode must configure 'tailscale serve --bg 80'" "calls:
${calls}"
        return
    fi
    if ! grep -qF "tailscale serve --bg --https=8443 3001" "${call_log}"; then
        fail "serve mode must configure backend 'tailscale serve --bg --https=8443 3001'" "calls:
${calls}"
        return
    fi
    if grep -qF "tailscale funnel" "${call_log}"; then
        fail "serve mode must NOT use 'tailscale funnel'" "calls:
${calls}"
        return
    fi

    pass "expose_mode=serve uses tailscale serve"
}

#-------------------------------------------------------------------------------
# Test 5: expose_mode=funnel configures `tailscale funnel` (not serve-only) (AC 4).
#-------------------------------------------------------------------------------
test_expose_mode_funnel() {
    echo "TEST: expose_mode=funnel uses tailscale funnel"

    local tmpdir call_log mock_dir
    tmpdir="$(mktemp -d)"
    call_log="${tmpdir}/ssh-calls.log"
    touch "${call_log}"
    mock_dir="$(make_mock_bin)"
    trap "rm -rf '${tmpdir}' '${mock_dir}'" RETURN

    export SSH_CALL_LOG="${call_log}"
    unset FAIL_ON_MATCH
    DEPLOY_WAIT_SECONDS=0 PATH="${mock_dir}:${PATH}" \
        bash "${DEPLOY_SCRIPT}" smokecloud /opt/app cloud.docker-compose.yml v1.2.3 funnel >/dev/null 2>&1
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "funnel mode happy path should exit 0" "got exit code ${exit_code}"
        return
    fi

    local calls
    calls="$(cat "${call_log}")"

    if ! grep -qF "tailscale funnel --bg 80" "${call_log}"; then
        fail "funnel mode must configure 'tailscale funnel --bg 80'" "calls:
${calls}"
        return
    fi
    if ! grep -qF "tailscale funnel --bg --https=8443 3001" "${call_log}"; then
        fail "funnel mode must configure backend 'tailscale funnel --bg --https=8443 3001'" "calls:
${calls}"
        return
    fi
    # Reset must use `tailscale serve reset` (clears both); `tailscale funnel
    # reset` is not a valid Tailscale subcommand.
    if ! grep -qF "tailscale serve reset" "${call_log}"; then
        fail "funnel mode must reset via 'tailscale serve reset'" "calls:
${calls}"
        return
    fi
    if grep -qF "tailscale funnel reset" "${call_log}"; then
        fail "must NOT call invalid 'tailscale funnel reset'" "calls:
${calls}"
        return
    fi

    pass "expose_mode=funnel uses tailscale funnel"
}

#-------------------------------------------------------------------------------
# Test 6: invalid expose_mode → non-zero exit, no ssh calls (input validation).
#-------------------------------------------------------------------------------
test_invalid_expose_mode_rejected() {
    echo "TEST: invalid expose_mode is rejected before any ssh call"

    local tmpdir call_log mock_dir
    tmpdir="$(mktemp -d)"
    call_log="${tmpdir}/ssh-calls.log"
    touch "${call_log}"
    mock_dir="$(make_mock_bin)"
    trap "rm -rf '${tmpdir}' '${mock_dir}'" RETURN

    export SSH_CALL_LOG="${call_log}"
    unset FAIL_ON_MATCH
    DEPLOY_WAIT_SECONDS=0 PATH="${mock_dir}:${PATH}" \
        bash "${DEPLOY_SCRIPT}" smokecloud /opt/app cloud.docker-compose.yml v1.2.3 bogus >/dev/null 2>&1
    local exit_code=$?

    if [ "${exit_code}" -eq 0 ]; then
        fail "invalid expose_mode must exit non-zero" "got exit code 0"
        return
    fi
    if [ -s "${call_log}" ]; then
        fail "no ssh call must happen for invalid expose_mode" "got calls:
$(cat "${call_log}")"
        return
    fi

    pass "invalid expose_mode is rejected before any ssh call"
}

#-------------------------------------------------------------------------------
# Test 7: missing required args → non-zero exit, no ssh calls (input validation).
#-------------------------------------------------------------------------------
test_missing_args_rejected() {
    echo "TEST: missing required args is rejected before any ssh call"

    local tmpdir call_log mock_dir
    tmpdir="$(mktemp -d)"
    call_log="${tmpdir}/ssh-calls.log"
    touch "${call_log}"
    mock_dir="$(make_mock_bin)"
    trap "rm -rf '${tmpdir}' '${mock_dir}'" RETURN

    export SSH_CALL_LOG="${call_log}"
    unset FAIL_ON_MATCH
    # Only two args supplied — the rest are missing.
    DEPLOY_WAIT_SECONDS=0 PATH="${mock_dir}:${PATH}" \
        bash "${DEPLOY_SCRIPT}" smokecloud /opt/app >/dev/null 2>&1
    local exit_code=$?

    if [ "${exit_code}" -eq 0 ]; then
        fail "missing args must exit non-zero" "got exit code 0"
        return
    fi
    if [ -s "${call_log}" ]; then
        fail "no ssh call must happen when args are missing" "got calls:
$(cat "${call_log}")"
        return
    fi

    pass "missing required args is rejected before any ssh call"
}

#-------------------------------------------------------------------------------
# Test 8: a failed backup must fail-fast — non-zero exit AND no `compose down`
#         / `compose up` is issued (ordering + rollback-safety guarantee).
#-------------------------------------------------------------------------------
test_backup_failure_aborts_before_down() {
    echo "TEST: failed backup aborts before compose down/up"

    local tmpdir call_log mock_dir
    tmpdir="$(mktemp -d)"
    call_log="${tmpdir}/ssh-calls.log"
    touch "${call_log}"
    mock_dir="$(make_mock_bin)"
    trap "rm -rf '${tmpdir}' '${mock_dir}'" RETURN

    export SSH_CALL_LOG="${call_log}"
    # Force the remote backup command to fail.
    export FAIL_ON_MATCH="deployment-backup.sh"
    DEPLOY_WAIT_SECONDS=0 PATH="${mock_dir}:${PATH}" \
        bash "${DEPLOY_SCRIPT}" smokecloud /opt/app cloud.docker-compose.yml v1.2.3 serve >/dev/null 2>&1
    local exit_code=$?
    unset FAIL_ON_MATCH

    local calls
    calls="$(cat "${call_log}")"

    if [ "${exit_code}" -eq 0 ]; then
        fail "failed backup must exit non-zero" "got exit code 0; calls:
${calls}"
        return
    fi

    if grep -qF "docker compose -f 'cloud.docker-compose.yml' down" "${call_log}"; then
        fail "must NOT run compose down after a failed backup" "calls:
${calls}"
        return
    fi
    if grep -qF "docker compose -f 'cloud.docker-compose.yml' up" "${call_log}"; then
        fail "must NOT run compose up after a failed backup" "calls:
${calls}"
        return
    fi

    pass "failed backup aborts before compose down/up"
}

#-------------------------------------------------------------------------------
# Test 9: a failed pull must fail-fast — non-zero exit AND no `compose down`
#         / `compose up` is issued.
#-------------------------------------------------------------------------------
test_pull_failure_aborts_before_down() {
    echo "TEST: failed pull aborts before compose down/up"

    local tmpdir call_log mock_dir
    tmpdir="$(mktemp -d)"
    call_log="${tmpdir}/ssh-calls.log"
    touch "${call_log}"
    mock_dir="$(make_mock_bin)"
    trap "rm -rf '${tmpdir}' '${mock_dir}'" RETURN

    export SSH_CALL_LOG="${call_log}"
    # Force the remote pull command to fail (backup succeeds first).
    export FAIL_ON_MATCH="pull"
    DEPLOY_WAIT_SECONDS=0 PATH="${mock_dir}:${PATH}" \
        bash "${DEPLOY_SCRIPT}" smokecloud /opt/app cloud.docker-compose.yml v1.2.3 serve >/dev/null 2>&1
    local exit_code=$?
    unset FAIL_ON_MATCH

    local calls
    calls="$(cat "${call_log}")"

    if [ "${exit_code}" -eq 0 ]; then
        fail "failed pull must exit non-zero" "got exit code 0; calls:
${calls}"
        return
    fi

    # Backup should have happened (it precedes pull); down/up must not.
    if ! grep -qF "deployment-backup.sh" "${call_log}"; then
        fail "backup should run before the failing pull" "calls:
${calls}"
        return
    fi
    if grep -qF "docker compose -f 'cloud.docker-compose.yml' down" "${call_log}"; then
        fail "must NOT run compose down after a failed pull" "calls:
${calls}"
        return
    fi
    if grep -qF "docker compose -f 'cloud.docker-compose.yml' up" "${call_log}"; then
        fail "must NOT run compose up after a failed pull" "calls:
${calls}"
        return
    fi

    pass "failed pull aborts before compose down/up"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "deploy-cloud.sh tests"
echo "=========================================="

test_happy_path_ordering_and_params
test_health_failure_triggers_rollback
test_happy_path_no_rollback
test_expose_mode_serve
test_expose_mode_funnel
test_invalid_expose_mode_rejected
test_missing_args_rejected
test_backup_failure_aborts_before_down
test_pull_failure_aborts_before_down

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
