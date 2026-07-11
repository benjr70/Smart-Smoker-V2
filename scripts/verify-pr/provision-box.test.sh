#!/usr/bin/env bash
# Tests for scripts/verify-pr/provision-box.sh
#
# Run: bash scripts/verify-pr/provision-box.test.sh
#
# Strategy: provisioning touches the host through a handful of external tools —
# `google-chrome-stable` (presence check), `docker` (daemon reachability),
# `npx`/`playwright` (browser install), `apt-get` + `usermod` (mutations). We
# mock all of them by PATH-prepending stubs that log their invocation to
# ${PROVISION_CALL_LOG}. Presence/absence of a tool in the mock bin drives the
# verify-then-act branches. The MCP config file the script edits is redirected
# to a temp copy via MCP_CONFIG_FILE, and the wrapper it registers via
# CHROME_MCP_WRAPPER. `jq` is used for real (the config merge must actually
# produce valid JSON).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROVISION="${SCRIPT_DIR}/provision-box.sh"
WRAPPER="${SCRIPT_DIR}/chrome-mcp-wrapper.sh"

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

if [ ! -f "${PROVISION}" ]; then
    echo "FATAL: ${PROVISION} not found"
    exit 2
fi

# Build a mock bin. Args select which tools are "present" and healthy:
#   $2 = with_chrome  (yes|no)   → provide google-chrome-stable stub
#   $3 = docker_ok    (yes|no)   → `docker info` exits 0 (else 1)
#   $4 = playwright_ok(yes|no)   → `npx playwright --version` exits 0 (else 1)
# Every stub logs `<tool> $*` to ${PROVISION_CALL_LOG}. apt-get, usermod, sudo
# are always mutation-loggers.
make_mock_bin() {
    local mock_dir with_chrome docker_ok playwright_ok
    with_chrome="$1"; docker_ok="$2"; playwright_ok="$3"
    mock_dir="$(mktemp -d)"

    if [ "${with_chrome}" = "yes" ]; then
        cat > "${mock_dir}/google-chrome-stable" <<'EOF'
#!/usr/bin/env bash
echo "google-chrome-stable $*" >> "${PROVISION_CALL_LOG}"
echo "Google Chrome 130.0"
exit 0
EOF
        chmod +x "${mock_dir}/google-chrome-stable"
    fi

    cat > "${mock_dir}/docker" <<EOF
#!/usr/bin/env bash
echo "docker \$*" >> "\${PROVISION_CALL_LOG}"
if [ "\$1" = "info" ] && [ "${docker_ok}" != "yes" ]; then
    exit 1
fi
exit 0
EOF
    chmod +x "${mock_dir}/docker"

    cat > "${mock_dir}/npx" <<EOF
#!/usr/bin/env bash
echo "npx \$*" >> "\${PROVISION_CALL_LOG}"
# The version probe used as the playwright presence check.
if printf '%s' "\$*" | grep -q 'playwright --version'; then
    if [ "${playwright_ok}" = "yes" ]; then echo "1.48.0"; exit 0; else exit 1; fi
fi
exit 0
EOF
    chmod +x "${mock_dir}/npx"

    for tool in apt-get usermod sudo curl gpg tee install; do
        cat > "${mock_dir}/${tool}" <<'EOF'
#!/usr/bin/env bash
echo "TOOL $*" >> "${PROVISION_CALL_LOG}"
exit 0
EOF
        sed -i "s/TOOL/${tool}/" "${mock_dir}/${tool}"
        chmod +x "${mock_dir}/${tool}"
    done

    echo "${mock_dir}"
}

# A minimal valid .mcp.json without the chrome wrapper entry.
seed_config() {
    cat > "$1" <<'EOF'
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"],
      "env": {}
    }
  }
}
EOF
}

#-------------------------------------------------------------------------------
# Test 1: on a fresh config, provisioning registers a `playwright-chrome` MCP
#         server whose command is the wrapper script (AC 1 — config written).
#-------------------------------------------------------------------------------
test_registers_wrapper_entry() {
    echo "TEST: registers a playwright-chrome MCP entry pointing at the wrapper"

    local tmp mock_dir cfg
    tmp="$(mktemp -d)"
    cfg="${tmp}/.mcp.json"
    seed_config "${cfg}"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    PROVISION_CALL_LOG="${tmp}/calls.log" \
        MCP_CONFIG_FILE="${cfg}" CHROME_MCP_WRAPPER="${WRAPPER}" \
        PATH="${mock_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>&1
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "provisioning should exit 0 when host is ready" "exit=${exit_code}"
        return
    fi

    local cmd
    cmd="$(jq -r '.mcpServers["playwright-chrome"].command' "${cfg}")"
    if [ "${cmd}" != "${WRAPPER}" ]; then
        fail "playwright-chrome command must point at the wrapper" \
            "got '${cmd}', want '${WRAPPER}'"
        return
    fi

    # The pre-existing entry must be preserved.
    if [ "$(jq -r '.mcpServers.playwright.command' "${cfg}")" != "npx" ]; then
        fail "existing MCP entries must be preserved" "$(cat "${cfg}")"
        return
    fi

    pass "registers a playwright-chrome MCP entry pointing at the wrapper"
}

#-------------------------------------------------------------------------------
# Test 2: running twice is a no-op — after the first run the second run leaves
#         the config byte-identical and issues no mutating commands (AC 1
#         idempotency: "Running it twice changes nothing the second time").
#-------------------------------------------------------------------------------
test_second_run_is_noop() {
    echo "TEST: second run changes nothing (idempotent)"

    local tmp mock_dir cfg log after1 after2
    tmp="$(mktemp -d)"
    cfg="${tmp}/.mcp.json"
    log="${tmp}/calls.log"
    seed_config "${cfg}"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    # First run: brings config to provisioned state.
    PROVISION_CALL_LOG="${log}" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${WRAPPER}" PATH="${mock_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>&1
    after1="$(cat "${cfg}")"

    # Second run: must change nothing. Fresh call log to inspect mutations.
    : > "${log}"
    PROVISION_CALL_LOG="${log}" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${WRAPPER}" PATH="${mock_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>&1
    local exit_code=$?
    after2="$(cat "${cfg}")"

    if [ "${exit_code}" -ne 0 ]; then
        fail "second run should exit 0" "exit=${exit_code}"
        return
    fi
    if [ "${after1}" != "${after2}" ]; then
        fail "second run must leave the config byte-identical" \
            "after1:
${after1}
after2:
${after2}"
        return
    fi
    # No mutating command may run on the already-provisioned second pass.
    if grep -Eq 'apt-get (install|update)|usermod|playwright install' "${log}"; then
        fail "second run must issue no install/mutation commands" "log:
$(cat "${log}")"
        return
    fi

    pass "second run changes nothing (idempotent)"
}

#-------------------------------------------------------------------------------
# Test 3: verify-then-act — when real Chrome is absent, provisioning installs it
#         (AC 1 verifies "real Chrome present"). Chrome present => no install
#         (covered by test 2's no-op).
#-------------------------------------------------------------------------------
test_installs_chrome_when_absent() {
    echo "TEST: installs Chrome when it is absent"

    local tmp mock_dir cfg log
    tmp="$(mktemp -d)"
    cfg="${tmp}/.mcp.json"
    log="${tmp}/calls.log"
    seed_config "${cfg}"
    # with_chrome=no → no google-chrome-stable stub in the mock bin.
    mock_dir="$(make_mock_bin no yes yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    # CHROME_BINARIES points at a name that exists nowhere, so the presence
    # check fails regardless of the host's real Chrome — driving the install
    # branch. curl/gpg/apt-get/sudo are all mocked, keeping the run hermetic.
    PROVISION_CALL_LOG="${log}" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${WRAPPER}" CHROME_BINARIES="google-chrome-absent-xyz" \
        PATH="${mock_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>&1

    if ! grep -Eq 'apt-get install.*google-chrome' "${log}"; then
        fail "absent Chrome must trigger an apt-get install of google-chrome" \
            "log:
$(cat "${log}")"
        return
    fi

    pass "installs Chrome when it is absent"
}

#-------------------------------------------------------------------------------
# Test 4: verify-then-act — when the agent user cannot reach the docker daemon
#         (`docker info` fails), provisioning adds the user to the docker group
#         (AC 1 verifies "docker usable by the agent user").
#-------------------------------------------------------------------------------
test_adds_docker_group_when_unusable() {
    echo "TEST: adds agent user to docker group when docker is unusable"

    local tmp mock_dir cfg log
    tmp="$(mktemp -d)"
    cfg="${tmp}/.mcp.json"
    log="${tmp}/calls.log"
    seed_config "${cfg}"
    # docker_ok=no → `docker info` exits 1.
    mock_dir="$(make_mock_bin yes no yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    PROVISION_CALL_LOG="${log}" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${WRAPPER}" PATH="${mock_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>&1

    if ! grep -Eq 'usermod .*-aG docker' "${log}"; then
        fail "unusable docker must add the agent user to the docker group" \
            "log:
$(cat "${log}")"
        return
    fi

    pass "adds agent user to docker group when docker is unusable"
}

#-------------------------------------------------------------------------------
# Test 5: verify-then-act — when the Playwright CLI probe fails, provisioning
#         installs Playwright + the Chrome channel system deps (AC 1 verifies
#         "Playwright deps present").
#-------------------------------------------------------------------------------
test_installs_playwright_when_absent() {
    echo "TEST: installs Playwright + deps when absent"

    local tmp mock_dir cfg log
    tmp="$(mktemp -d)"
    cfg="${tmp}/.mcp.json"
    log="${tmp}/calls.log"
    seed_config "${cfg}"
    # playwright_ok=no → the version probe exits 1.
    mock_dir="$(make_mock_bin yes yes no)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    PROVISION_CALL_LOG="${log}" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${WRAPPER}" PATH="${mock_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>&1

    if ! grep -Eq 'playwright install --with-deps chrome' "${log}"; then
        fail "absent Playwright must trigger 'playwright install --with-deps chrome'" \
            "log:
$(cat "${log}")"
        return
    fi

    pass "installs Playwright + deps when absent"
}

#-------------------------------------------------------------------------------
# Test 6: guard — a missing/non-executable wrapper is a hard error (non-zero
#         exit naming the wrapper), so the MCP config is never pointed at a
#         launcher that does not exist.
#-------------------------------------------------------------------------------
test_missing_wrapper_errors() {
    echo "TEST: missing wrapper => clear non-zero error"

    local tmp mock_dir cfg stderr
    tmp="$(mktemp -d)"
    cfg="${tmp}/.mcp.json"
    stderr="${tmp}/stderr.txt"
    seed_config "${cfg}"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    PROVISION_CALL_LOG="${tmp}/calls.log" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${tmp}/does-not-exist.sh" PATH="${mock_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>"${stderr}"
    local exit_code=$?

    if [ "${exit_code}" -eq 0 ]; then
        fail "missing wrapper must exit non-zero" "got exit 0"
        return
    fi
    if ! grep -qF "does-not-exist.sh" "${stderr}"; then
        fail "error must name the missing wrapper path" "stderr:
$(cat "${stderr}")"
        return
    fi

    pass "missing wrapper => clear non-zero error"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "provision-box.sh tests"
echo "=========================================="

test_registers_wrapper_entry
test_second_run_is_noop
test_installs_chrome_when_absent
test_adds_docker_group_when_unusable
test_installs_playwright_when_absent
test_missing_wrapper_errors

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
