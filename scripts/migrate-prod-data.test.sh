#!/usr/bin/env bash
# Tests for scripts/migrate-prod-data.sh
#
# Run: bash scripts/migrate-prod-data.test.sh
#
# Strategy: migrate-prod-data.sh performs all remote work over `ssh root@<host>`.
# We mock `ssh` by prepending a temp dir to PATH. The mock `ssh` appends each
# invocation to a call log so tests can assert on ordering and content.
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

#-------------------------------------------------------------------------------
# Test 1: first run (guard absent) invokes ssh twice (mongodump source +
#         mongorestore target) and creates the guard file afterward (AC 1).
#-------------------------------------------------------------------------------
test_first_run_success() {
    echo "TEST: first run dumps then restores and creates guard"

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
        bash "${iso_script}" oldprod newprod --db smart-smoker >/dev/null 2>&1
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "first run should exit 0" "got exit code ${exit_code}; calls:
$(cat "${call_log}")"
        return
    fi

    local calls
    calls="$(cat "${call_log}")"

    # Exactly two ssh calls: dump from old, restore into new.
    local ssh_count
    ssh_count="$(grep -c '^ssh ' "${call_log}")"
    if [ "${ssh_count}" -ne 2 ]; then
        fail "first run must issue exactly 2 ssh calls" "got ${ssh_count}; calls:
${calls}"
        return
    fi

    # Dump targets old host with mongodump; restore targets new host with mongorestore.
    if ! grep -qF "root@oldprod" "${call_log}" || ! grep -qF "mongodump" "${call_log}"; then
        fail "must mongodump from root@oldprod" "calls:
${calls}"
        return
    fi
    if ! grep -qF "root@newprod" "${call_log}" || ! grep -qF "mongorestore" "${call_log}"; then
        fail "must mongorestore into root@newprod" "calls:
${calls}"
        return
    fi

    # Database name must appear in the remote commands.
    if ! grep -qF "smart-smoker" "${call_log}"; then
        fail "remote commands must reference the db name" "calls:
${calls}"
        return
    fi

    # Guard file must exist after a successful run.
    if [ ! -f "${iso_dir}/.migrate-prod-data.done" ]; then
        fail "guard file must be created after a successful migration" "calls:
${calls}"
        return
    fi

    pass "first run dumps then restores and creates guard"
}

#-------------------------------------------------------------------------------
# Test 2: second run (guard present) exits 0 and issues NO ssh calls (AC 2).
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
        bash "${iso_script}" oldprod newprod --db smart-smoker >/dev/null 2>&1
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
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "migrate-prod-data.sh tests"
echo "=========================================="

test_first_run_success
test_guard_blocks_second_run

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
