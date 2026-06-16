#!/usr/bin/env bash
# Tests for scripts/migrate-prod-data.sh
#
# Run: bash scripts/migrate-prod-data.test.sh
#
# Strategy: migrate-prod-data.sh performs all remote work over `ssh <user>@<host>`.
# We mock `ssh` by prepending a temp dir to PATH. The mock `ssh` appends each
# invocation to a call log so tests can assert on ordering and content (the
# remote command is passed as a single ssh argument, so it lands in the log
# verbatim — docker-exec, auth flags, namespace rename and all).
#
# The run-once guard is a sentinel file at ${SCRIPT_DIR}/.migrate-prod-data.done.
# To keep tests hermetic we point the script at an isolated SCRIPT_DIR by copying
# the script under test into a temp dir, so the guard file is created there and
# never pollutes the real repo.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATE_SCRIPT="${SCRIPT_DIR}/migrate-prod-data.sh"

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

if [ ! -f "${MIGRATE_SCRIPT}" ]; then
    echo "FATAL: ${MIGRATE_SCRIPT} not found"
    exit 2
fi

# Create a mock bin dir containing an `ssh` stub that records its invocations to
# ${SSH_CALL_LOG}. Each ssh invocation is logged as a single line: the full
# argument vector. The stub also consumes stdin so a piped dump→restore does not
# hang or fail on a broken pipe.
make_mock_bin() {
    local mock_dir
    mock_dir="$(mktemp -d)"

    cat > "${mock_dir}/ssh" <<'EOF'
#!/usr/bin/env bash
# Record the full invocation (one line per call).
echo "ssh $*" >> "${SSH_CALL_LOG}"
# Drain stdin so a piped mongodump | mongorestore does not break.
cat >/dev/null 2>&1 || true
exit 0
EOF
    chmod +x "${mock_dir}/ssh"

    echo "${mock_dir}"
}

# Copy the script under test into an isolated dir so the guard sentinel is
# written there (hermetic — never touches the real repo).
make_isolated_script() {
    local iso_dir
    iso_dir="$(mktemp -d)"
    cp "${MIGRATE_SCRIPT}" "${iso_dir}/migrate-prod-data.sh"
    chmod +x "${iso_dir}/migrate-prod-data.sh"
    echo "${iso_dir}"
}

# Assert the call log contains a literal substring; fail the named test if not.
assert_contains() {
    local log="$1" needle="$2" name="$3"
    if ! grep -qF -e "${needle}" "${log}"; then
        fail "${name}" "expected to find: ${needle}
calls:
$(cat "${log}")"
        return 1
    fi
    return 0
}

#-------------------------------------------------------------------------------
# Test 1: first run (guard absent) dumps from old via docker-exec mongodump,
#         restores into new via docker-exec mongorestore WITH AUTH, --drop, and
#         a namespace cross-rename, sourcing creds from the new box env file —
#         then creates the guard. Defaults: src-db=test, dst-db=smartsmoker.
#-------------------------------------------------------------------------------
test_first_run_success() {
    echo "TEST: first run docker-exec dump|restore (auth + cross-rename) + guard"

    local tmpdir call_log mock_dir iso_dir iso_script
    tmpdir="$(mktemp -d)"
    call_log="${tmpdir}/ssh-calls.log"
    touch "${call_log}"
    mock_dir="$(make_mock_bin)"
    iso_dir="$(make_isolated_script)"
    iso_script="${iso_dir}/migrate-prod-data.sh"
    trap "rm -rf '${tmpdir}' '${mock_dir}' '${iso_dir}'" RETURN

    export SSH_CALL_LOG="${call_log}"
    PATH="${mock_dir}:${PATH}" \
        bash "${iso_script}" oldprod newprod >/dev/null 2>&1
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "first run should exit 0" "got exit code ${exit_code}; calls:
$(cat "${call_log}")"
        return
    fi

    # Exactly two ssh calls: dump from old, restore into new.
    local ssh_count
    ssh_count="$(grep -c '^ssh ' "${call_log}")"
    if [ "${ssh_count}" -ne 2 ]; then
        fail "first run must issue exactly 2 ssh calls" "got ${ssh_count}; calls:
$(cat "${call_log}")"
        return
    fi

    local n="first run mechanic"
    # Source: ssh to old host, mongodump INSIDE the container, default src-db.
    assert_contains "${call_log}" "ssh root@oldprod" "${n}" || return
    assert_contains "${call_log}" "docker exec mongo mongodump --db 'test' --archive --gzip" "${n}" || return

    # Target: ssh to new host, sources the box env file, mongorestore via
    # docker exec -i with auth, --drop, and the namespace cross-rename.
    assert_contains "${call_log}" "ssh root@newprod" "${n}" || return
    assert_contains "${call_log}" ". '/opt/smart-smoker-prod/.env'" "${n}" || return
    assert_contains "${call_log}" "docker exec -i mongo mongorestore" "${n}" || return
    assert_contains "${call_log}" "--username 'admin'" "${n}" || return
    assert_contains "${call_log}" "MONGO_ROOT_PASSWORD" "${n}" || return
    assert_contains "${call_log}" "--authenticationDatabase admin" "${n}" || return
    assert_contains "${call_log}" "--drop" "${n}" || return
    assert_contains "${call_log}" "--nsFrom 'test.*' --nsTo 'smartsmoker.*'" "${n}" || return

    # Guard file must exist after a successful run.
    if [ ! -f "${iso_dir}/.migrate-prod-data.done" ]; then
        fail "guard file must be created after a successful migration"
        return
    fi

    pass "first run docker-exec dump|restore (auth + cross-rename) + guard"
}

#-------------------------------------------------------------------------------
# Test 2: second run (guard present) exits 0 and issues NO ssh calls.
#-------------------------------------------------------------------------------
test_guard_blocks_second_run() {
    echo "TEST: existing guard blocks a second run"

    local tmpdir call_log mock_dir iso_dir iso_script
    tmpdir="$(mktemp -d)"
    call_log="${tmpdir}/ssh-calls.log"
    touch "${call_log}"
    mock_dir="$(make_mock_bin)"
    iso_dir="$(make_isolated_script)"
    iso_script="${iso_dir}/migrate-prod-data.sh"
    trap "rm -rf '${tmpdir}' '${mock_dir}' '${iso_dir}'" RETURN

    # Pre-create the guard sentinel to simulate an already-completed migration.
    touch "${iso_dir}/.migrate-prod-data.done"

    export SSH_CALL_LOG="${call_log}"
    PATH="${mock_dir}:${PATH}" \
        bash "${iso_script}" oldprod newprod >/dev/null 2>&1
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "guarded second run must exit 0" "got exit code ${exit_code}"
        return
    fi

    if [ -s "${call_log}" ]; then
        fail "guarded second run must issue NO ssh calls" "got calls:
$(cat "${call_log}")"
        return
    fi

    pass "existing guard blocks a second run"
}

#-------------------------------------------------------------------------------
# Test 3: custom options (--old-user, --src-db, --dst-db, --new-container) are
#         threaded into the remote commands.
#-------------------------------------------------------------------------------
test_custom_options() {
    echo "TEST: custom user/db/container options reflected in remote commands"

    local tmpdir call_log mock_dir iso_dir iso_script
    tmpdir="$(mktemp -d)"
    call_log="${tmpdir}/ssh-calls.log"
    touch "${call_log}"
    mock_dir="$(make_mock_bin)"
    iso_dir="$(make_isolated_script)"
    iso_script="${iso_dir}/migrate-prod-data.sh"
    trap "rm -rf '${tmpdir}' '${mock_dir}' '${iso_dir}'" RETURN

    export SSH_CALL_LOG="${call_log}"
    PATH="${mock_dir}:${PATH}" \
        bash "${iso_script}" smokecloud-legacy smokecloud \
            --old-user ubuntu --src-db olddb --dst-db newdb \
            --new-container mongo7 >/dev/null 2>&1
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "custom-options run should exit 0" "got exit code ${exit_code}"
        return
    fi

    local n="custom options"
    assert_contains "${call_log}" "ssh ubuntu@smokecloud-legacy" "${n}" || return
    assert_contains "${call_log}" "mongodump --db 'olddb'" "${n}" || return
    assert_contains "${call_log}" "ssh root@smokecloud" "${n}" || return
    assert_contains "${call_log}" "docker exec -i mongo7 mongorestore" "${n}" || return
    assert_contains "${call_log}" "--nsFrom 'olddb.*' --nsTo 'newdb.*'" "${n}" || return

    pass "custom user/db/container options reflected in remote commands"
}

#-------------------------------------------------------------------------------
# Test 4: missing required hosts → usage error, exit 1, no ssh calls.
#-------------------------------------------------------------------------------
test_missing_args() {
    echo "TEST: missing hosts exits 1 with no ssh calls"

    local tmpdir call_log mock_dir iso_dir iso_script
    tmpdir="$(mktemp -d)"
    call_log="${tmpdir}/ssh-calls.log"
    touch "${call_log}"
    mock_dir="$(make_mock_bin)"
    iso_dir="$(make_isolated_script)"
    iso_script="${iso_dir}/migrate-prod-data.sh"
    trap "rm -rf '${tmpdir}' '${mock_dir}' '${iso_dir}'" RETURN

    export SSH_CALL_LOG="${call_log}"
    PATH="${mock_dir}:${PATH}" \
        bash "${iso_script}" oldprod >/dev/null 2>&1
    local exit_code=$?

    if [ "${exit_code}" -ne 1 ]; then
        fail "missing new-host must exit 1" "got exit code ${exit_code}"
        return
    fi
    if [ -s "${call_log}" ]; then
        fail "missing-arg run must issue NO ssh calls" "got calls:
$(cat "${call_log}")"
        return
    fi

    pass "missing hosts exits 1 with no ssh calls"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "migrate-prod-data.sh tests"
echo "=========================================="

test_first_run_success
test_guard_blocks_second_run
test_custom_options
test_missing_args

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
