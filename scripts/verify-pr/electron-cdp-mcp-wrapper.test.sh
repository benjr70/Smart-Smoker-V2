#!/usr/bin/env bash
# Tests for scripts/verify-pr/electron-cdp-mcp-wrapper.sh
#
# Run: bash scripts/verify-pr/electron-cdp-mcp-wrapper.test.sh
#
# Strategy: the wrapper's two system boundaries are (a) the CDP readiness probe
# it polls for the Electron app's remote-debugging endpoint and (b) the `npx`
# invocation that launches the Playwright MCP server (it `exec`s it once the
# endpoint is up). We inject the probe via CDP_PROBE_CMD and mock `npx` with a
# PATH-prepended stub that records its argv to ${NPX_CALL_LOG}. No real Electron,
# CDP endpoint, or MCP server is required.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WRAPPER="${SCRIPT_DIR}/electron-cdp-mcp-wrapper.sh"

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

if [ ! -f "${WRAPPER}" ]; then
    echo "FATAL: ${WRAPPER} not found"
    exit 2
fi

# Mock bin with an `npx` stub that records its argv to ${NPX_CALL_LOG} and exits
# 0 (standing in for the long-running stdio MCP server).
make_mock_bin() {
    local mock_dir
    mock_dir="$(mktemp -d)"
    cat > "${mock_dir}/npx" <<'EOF'
#!/usr/bin/env bash
echo "npx $*" >> "${NPX_CALL_LOG}"
exit 0
EOF
    chmod +x "${mock_dir}/npx"
    echo "${mock_dir}"
}

# A probe stub that fails the first N calls (counting via a state file) then
# succeeds — models a CDP endpoint that comes up after a short delay.
make_probe_after() {
    local n="$1" probe statefile
    probe="$(mktemp)"
    statefile="$(mktemp)"
    echo "0" > "${statefile}"
    cat > "${probe}" <<EOF
#!/usr/bin/env bash
c=\$(cat "${statefile}")
c=\$((c + 1))
echo "\${c}" > "${statefile}"
[ "\${c}" -ge "${n}" ]
EOF
    chmod +x "${probe}"
    echo "${probe}"
}

#-------------------------------------------------------------------------------
# Test 1: the wrapper waits for the CDP endpoint (retrying) and, once it answers,
#         launches the MCP server against that exact fixed endpoint (AC 4).
#-------------------------------------------------------------------------------
test_connects_once_endpoint_up() {
    echo "TEST: retries until CDP is up, then launches MCP against the fixed endpoint"

    local tmp mock_dir log probe
    tmp="$(mktemp -d)"
    log="${tmp}/npx.log"
    : > "${log}"
    mock_dir="$(make_mock_bin)"
    probe="$(make_probe_after 3)" # up on the 3rd attempt
    trap "rm -rf '${tmp}' '${mock_dir}' '${probe}'" RETURN

    NPX_CALL_LOG="${log}" CDP_PORT="9222" CDP_PROBE_CMD="${probe}" \
        CDP_WAIT_RETRIES="10" CDP_WAIT_INTERVAL="0" \
        PATH="${mock_dir}:${PATH}" \
        bash "${WRAPPER}" >/dev/null 2>&1
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "wrapper should exit 0 once the endpoint is up" "exit=${exit_code}"
        return
    fi
    if ! grep -qF -- "--cdp-endpoint http://127.0.0.1:9222" "${log}"; then
        fail "MCP server must be launched against the fixed CDP endpoint" \
            "npx log:
$(cat "${log}")"
        return
    fi

    pass "retries until CDP is up, then launches MCP against the fixed endpoint"
}

#-------------------------------------------------------------------------------
# Test 2: when the CDP endpoint never comes up, the wrapper gives up after the
#         bounded retries with a non-zero exit + a clear error naming the
#         endpoint, and NEVER launches the MCP server (AC 4).
#-------------------------------------------------------------------------------
test_gives_up_when_endpoint_never_up() {
    echo "TEST: bounded retries then clear error; MCP never launched"

    local tmp mock_dir log stderr
    tmp="$(mktemp -d)"
    log="${tmp}/npx.log"
    stderr="${tmp}/stderr.txt"
    : > "${log}"
    mock_dir="$(make_mock_bin)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    # CDP_PROBE_CMD=false → endpoint never answers.
    NPX_CALL_LOG="${log}" CDP_PORT="9222" CDP_PROBE_CMD="false" \
        CDP_WAIT_RETRIES="3" CDP_WAIT_INTERVAL="0" \
        PATH="${mock_dir}:${PATH}" \
        bash "${WRAPPER}" >/dev/null 2>"${stderr}"
    local exit_code=$?

    if [ "${exit_code}" -eq 0 ]; then
        fail "wrapper must exit non-zero when the endpoint never comes up" "got exit 0"
        return
    fi
    if [ -s "${log}" ]; then
        fail "MCP server must NOT be launched when the CDP endpoint never answers" \
            "npx log:
$(cat "${log}")"
        return
    fi
    if ! grep -qi "CDP endpoint" "${stderr}"; then
        fail "error must name the CDP endpoint as the failed precondition" \
            "stderr:
$(cat "${stderr}")"
        return
    fi

    pass "bounded retries then clear error; MCP never launched"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "electron-cdp-mcp-wrapper.sh tests"
echo "=========================================="

test_connects_once_endpoint_up
test_gives_up_when_endpoint_never_up

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
