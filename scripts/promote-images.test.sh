#!/usr/bin/env bash
# Tests for scripts/promote-images.sh
#
# Run: bash scripts/promote-images.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMOTE_SCRIPT="${SCRIPT_DIR}/promote-images.sh"

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

if [ ! -f "${PROMOTE_SCRIPT}" ]; then
    echo "FATAL: ${PROMOTE_SCRIPT} not found"
    exit 2
fi

# Create a mock docker that records its invocations
make_mock_docker() {
    local log_file="$1"
    local mock_dir
    mock_dir="$(mktemp -d)"
    cat > "${mock_dir}/docker" <<'EOF'
#!/usr/bin/env bash
echo "$@" >> "${DOCKER_CALL_LOG}"
exit 0
EOF
    chmod +x "${mock_dir}/docker"
    echo "${mock_dir}"
}

#-------------------------------------------------------------------------------
# Test 1: valid versioned tag → correct imagetools create calls for both services
#-------------------------------------------------------------------------------
test_valid_version_emits_correct_imagetools_calls() {
    echo "TEST: valid version emits correct imagetools create calls"

    local tmpdir call_log mock_dir
    tmpdir="$(mktemp -d)"
    call_log="${tmpdir}/docker-calls.log"
    touch "${call_log}"
    mock_dir="$(make_mock_docker "${call_log}")"
    trap "rm -rf '${tmpdir}' '${mock_dir}'" RETURN

    export DOCKER_CALL_LOG="${call_log}"
    PATH="${mock_dir}:${PATH}" bash "${PROMOTE_SCRIPT}" v1.2.3
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "valid version should exit 0" "got exit code ${exit_code}"
        return
    fi

    local calls
    calls="$(cat "${call_log}")"

    # Backend: both vX.Y.Z and :latest from :nightly
    if ! echo "${calls}" | grep -qF "buildx imagetools create --tag benjr70/smart-smoker-backend:v1.2.3 --tag benjr70/smart-smoker-backend:latest benjr70/smart-smoker-backend:nightly"; then
        fail "backend imagetools call not found" "calls were: ${calls}"
        return
    fi

    # Frontend: both vX.Y.Z and :latest from :nightly
    if ! echo "${calls}" | grep -qF "buildx imagetools create --tag benjr70/smart-smoker-frontend:v1.2.3 --tag benjr70/smart-smoker-frontend:latest benjr70/smart-smoker-frontend:nightly"; then
        fail "frontend imagetools call not found" "calls were: ${calls}"
        return
    fi

    pass "valid version emits correct imagetools create calls"
}

#-------------------------------------------------------------------------------
# Test 2: empty version → non-zero exit, no docker calls
#-------------------------------------------------------------------------------
test_empty_version_exits_nonzero_no_docker() {
    echo "TEST: empty version exits non-zero without calling docker"

    local tmpdir call_log mock_dir
    tmpdir="$(mktemp -d)"
    call_log="${tmpdir}/docker-calls.log"
    touch "${call_log}"
    mock_dir="$(make_mock_docker "${call_log}")"
    trap "rm -rf '${tmpdir}' '${mock_dir}'" RETURN

    export DOCKER_CALL_LOG="${call_log}"
    PATH="${mock_dir}:${PATH}" bash "${PROMOTE_SCRIPT}" "" 2>/dev/null
    local exit_code=$?

    if [ "${exit_code}" -eq 0 ]; then
        fail "empty version must exit non-zero" "got exit code 0"
        return
    fi

    if [ -s "${call_log}" ]; then
        fail "docker must not be called for empty version" "got calls: $(cat "${call_log}")"
        return
    fi

    pass "empty version exits non-zero without calling docker"
}

#-------------------------------------------------------------------------------
# Test 3: no-args → non-zero exit, no docker calls
#-------------------------------------------------------------------------------
test_no_args_exits_nonzero_no_docker() {
    echo "TEST: no args exits non-zero without calling docker"

    local tmpdir call_log mock_dir
    tmpdir="$(mktemp -d)"
    call_log="${tmpdir}/docker-calls.log"
    touch "${call_log}"
    mock_dir="$(make_mock_docker "${call_log}")"
    trap "rm -rf '${tmpdir}' '${mock_dir}'" RETURN

    export DOCKER_CALL_LOG="${call_log}"
    PATH="${mock_dir}:${PATH}" bash "${PROMOTE_SCRIPT}" 2>/dev/null
    local exit_code=$?

    if [ "${exit_code}" -eq 0 ]; then
        fail "no args must exit non-zero" "got exit code 0"
        return
    fi

    if [ -s "${call_log}" ]; then
        fail "docker must not be called when no args given" "got calls: $(cat "${call_log}")"
        return
    fi

    pass "no args exits non-zero without calling docker"
}

#-------------------------------------------------------------------------------
# Test 4: garbage version → non-zero exit, no docker calls
#-------------------------------------------------------------------------------
test_garbage_version_exits_nonzero_no_docker() {
    echo "TEST: garbage version exits non-zero without calling docker"

    local tmpdir call_log mock_dir
    tmpdir="$(mktemp -d)"
    call_log="${tmpdir}/docker-calls.log"
    touch "${call_log}"
    mock_dir="$(make_mock_docker "${call_log}")"
    trap "rm -rf '${tmpdir}' '${mock_dir}'" RETURN

    export DOCKER_CALL_LOG="${call_log}"
    PATH="${mock_dir}:${PATH}" bash "${PROMOTE_SCRIPT}" "not-a-version" 2>/dev/null
    local exit_code=$?

    if [ "${exit_code}" -eq 0 ]; then
        fail "garbage version must exit non-zero" "got exit code 0"
        return
    fi

    if [ -s "${call_log}" ]; then
        fail "docker must not be called for garbage version" "got calls: $(cat "${call_log}")"
        return
    fi

    pass "garbage version exits non-zero without calling docker"
}

#-------------------------------------------------------------------------------
# Test 5: version normalization — bare numeric and capital V prefix
#-------------------------------------------------------------------------------
test_version_normalization() {
    echo "TEST: version normalization (1.2.3 and V1.2.3 → v1.2.3)"

    local tmpdir call_log mock_dir
    tmpdir="$(mktemp -d)"
    call_log="${tmpdir}/docker-calls.log"
    touch "${call_log}"
    mock_dir="$(make_mock_docker "${call_log}")"
    trap "rm -rf '${tmpdir}' '${mock_dir}'" RETURN

    export DOCKER_CALL_LOG="${call_log}"
    PATH="${mock_dir}:${PATH}" bash "${PROMOTE_SCRIPT}" 1.2.3
    if ! grep -qF "benjr70/smart-smoker-backend:v1.2.3" "${call_log}"; then
        fail "bare 1.2.3 should normalize to v1.2.3" "calls: $(cat "${call_log}")"
        return
    fi

    # Reset log for capital-V test
    : > "${call_log}"
    PATH="${mock_dir}:${PATH}" bash "${PROMOTE_SCRIPT}" V1.2.3
    if ! grep -qF "benjr70/smart-smoker-backend:v1.2.3" "${call_log}"; then
        fail "V1.2.3 should normalize to v1.2.3" "calls: $(cat "${call_log}")"
        return
    fi

    pass "version normalization works for bare and capital-V input"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "promote-images.sh tests"
echo "=========================================="

test_valid_version_emits_correct_imagetools_calls
test_empty_version_exits_nonzero_no_docker
test_no_args_exits_nonzero_no_docker
test_garbage_version_exits_nonzero_no_docker
test_version_normalization

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
