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
# Test 2: the CDP endpoint being down must NOT stop the MCP server from starting.
#
#         MCP stdio servers are spawned once, when the session starts — minutes
#         before /verify-pr checks the PR out, boots the stack and launches
#         Electron (SKILL.md step 5). A wrapper that exits because nothing is
#         listening yet is dropped for the WHOLE session, leaving the verifier
#         with zero Electron tools. @playwright/mcp dials --cdp-endpoint lazily
#         (first tool call), so the wrapper hands off anyway and the failure
#         surfaces per tool call instead of killing the registration.
#-------------------------------------------------------------------------------
test_still_registers_when_endpoint_down() {
    echo "TEST: endpoint down at startup still launches MCP (registers), with a warning"

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

    if [ "${exit_code}" -ne 0 ]; then
        fail "wrapper must still hand off to the MCP server (exit 0)" "exit=${exit_code}
$(cat "${stderr}")"
        return
    fi
    if ! grep -qF -- "--cdp-endpoint http://127.0.0.1:9222" "${log}"; then
        fail "MCP server must be launched anyway so its tools register" \
            "npx log:
$(cat "${log}")"
        return
    fi
    if ! grep -qi "CDP endpoint" "${stderr}" \
        || ! grep -qi "electron-launcher.sh" "${stderr}"; then
        fail "warning must name the dead endpoint and how to bring it up" \
            "stderr:
$(cat "${stderr}")"
        return
    fi

    pass "endpoint down at startup still launches MCP (registers), with a warning"
}

#-------------------------------------------------------------------------------
# Test 3: the startup probe stays BOUNDED and short. The MCP runtime drops a
#         server that has not spoken within its startup timeout (30s in Claude
#         Code), so the wait must give up well inside that budget — it is a
#         courtesy for the launcher race, not a gate.
#-------------------------------------------------------------------------------
test_startup_wait_is_bounded_and_short() {
    echo "TEST: startup wait is bounded and well under the MCP startup timeout"

    local tmp mock_dir log probe_log started ended budget
    tmp="$(mktemp -d)"
    log="${tmp}/npx.log"
    probe_log="${tmp}/probe.log"
    : > "${log}"
    : > "${probe_log}"
    mock_dir="$(make_mock_bin)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    # Defaults only (no CDP_WAIT_* overrides): this asserts the SHIPPED budget.
    started="$(date +%s)"
    NPX_CALL_LOG="${log}" CDP_PROBE_CMD="echo probe >> ${probe_log}; false" \
        PATH="${mock_dir}:${PATH}" \
        bash "${WRAPPER}" >/dev/null 2>&1
    ended="$(date +%s)"
    budget=$((ended - started))

    if [ "${budget}" -ge 25 ]; then
        fail "default startup wait must finish well under the 30s MCP timeout" \
            "took ${budget}s"
        return
    fi
    if [ ! -s "${probe_log}" ]; then
        fail "wrapper must still probe the endpoint at startup" "probe never ran"
        return
    fi
    if [ ! -s "${log}" ]; then
        fail "wrapper must hand off to the MCP server after the bounded wait" \
            "npx never called"
        return
    fi

    pass "startup wait is bounded and well under the MCP startup timeout"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "electron-cdp-mcp-wrapper.sh tests"
echo "=========================================="

test_connects_once_endpoint_up
test_still_registers_when_endpoint_down
test_startup_wait_is_bounded_and_short

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
