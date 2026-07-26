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
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PROVISION="${SCRIPT_DIR}/provision-box.sh"
WRAPPER="${SCRIPT_DIR}/chrome-mcp-wrapper.sh"
ELECTRON_WRAPPER="${SCRIPT_DIR}/electron-cdp-mcp-wrapper.sh"

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
# Test 7: provisioning also registers the `playwright-electron` MCP server whose
#         command is the CDP wrapper, alongside the chrome entry — the second
#         interactive path for the smoker Electron app (issue #330 config entry).
#-------------------------------------------------------------------------------
test_registers_electron_cdp_entry() {
    echo "TEST: registers a playwright-electron MCP entry pointing at the CDP wrapper"

    local tmp mock_dir cfg
    tmp="$(mktemp -d)"
    cfg="${tmp}/.mcp.json"
    seed_config "${cfg}"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    PROVISION_CALL_LOG="${tmp}/calls.log" \
        MCP_CONFIG_FILE="${cfg}" CHROME_MCP_WRAPPER="${WRAPPER}" \
        ELECTRON_MCP_WRAPPER="${ELECTRON_WRAPPER}" \
        PATH="${mock_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>&1
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "provisioning should exit 0 when host is ready" "exit=${exit_code}"
        return
    fi

    local cmd
    cmd="$(jq -r '.mcpServers["playwright-electron"].command' "${cfg}")"
    if [ "${cmd}" != "${ELECTRON_WRAPPER}" ]; then
        fail "playwright-electron command must point at the CDP wrapper" \
            "got '${cmd}', want '${ELECTRON_WRAPPER}'"
        return
    fi
    # The chrome entry must still be present alongside it.
    if [ "$(jq -r '.mcpServers["playwright-chrome"].command' "${cfg}")" != "${WRAPPER}" ]; then
        fail "chrome entry must be preserved alongside the electron entry" "$(cat "${cfg}")"
        return
    fi

    pass "registers a playwright-electron MCP entry pointing at the CDP wrapper"
}

#-------------------------------------------------------------------------------
# Test 8: the COMMITTED repo config already carries both harness entries, each
#         resolving to its real wrapper script (issue #388 AC 1 / behavior 1).
#         These entries are what survives the daemon's `git reset --hard`
#         cleanup; provisioning only verifies them.
#
#         Shape matters: the MCP runtime spawns stdio servers with the SESSION's
#         cwd, which is not necessarily the checkout root (CLAUDE.md itself sends
#         developers into `apps/backend`). A bare `./scripts/...` command would
#         ENOENT there, and an absolute path is not portable across clones — so
#         each committed entry resolves the checkout root at launch time.
#-------------------------------------------------------------------------------
test_committed_config_has_both_entries() {
    echo "TEST: committed .mcp.json carries both harness entries"

    local cfg key rel script
    cfg="${REPO_ROOT}/.mcp.json"

    for key in playwright-chrome playwright-electron; do
        case "${key}" in
            playwright-chrome) rel="scripts/verify-pr/chrome-mcp-wrapper.sh" ;;
            *) rel="scripts/verify-pr/electron-cdp-mcp-wrapper.sh" ;;
        esac

        if [ "$(jq -r --arg k "${key}" '.mcpServers[$k].type // ""' "${cfg}")" != "stdio" ]; then
            fail "committed config must contain the '${key}' stdio entry" \
                "servers: $(jq -r '.mcpServers | keys | join(", ")' "${cfg}")"
            return
        fi
        if [ "$(jq -r --arg k "${key}" '.mcpServers[$k].command // ""' "${cfg}")" != "bash" ]; then
            fail "'${key}' must launch through a shell that resolves the checkout root" \
                "command: $(jq -r --arg k "${key}" '.mcpServers[$k].command' "${cfg}")"
            return
        fi
        if [ "$(jq -r --arg k "${key}" '.mcpServers[$k].args[0] // ""' "${cfg}")" != "-c" ]; then
            fail "'${key}' args must be a shell script (-c ...)" \
                "args: $(jq -c --arg k "${key}" '.mcpServers[$k].args' "${cfg}")"
            return
        fi

        script="$(jq -r --arg k "${key}" '.mcpServers[$k].args[1] // ""' "${cfg}")"
        if ! printf '%s' "${script}" | grep -qF 'git rev-parse --show-toplevel'; then
            fail "'${key}' must resolve the checkout root at launch (cwd is the session's, not the config's)" \
                "script: ${script}"
            return
        fi
        if ! printf '%s' "${script}" | grep -qF "/${rel}"; then
            fail "'${key}' must launch ${rel}" "script: ${script}"
            return
        fi
        if [ ! -x "${REPO_ROOT}/${rel}" ]; then
            fail "'${key}' must point at an executable wrapper" "not executable: ${REPO_ROOT}/${rel}"
            return
        fi
    done

    pass "committed .mcp.json carries both harness entries"
}

#-------------------------------------------------------------------------------
# Test 8b: the committed entries actually launch their wrapper when the session's
#          cwd is NOT the checkout root — the case a bare repo-relative command
#          fails silently (ENOENT, no diagnostic, no tools). Each wrapper's own
#          stderr prefix is the proof that it ran.
#-------------------------------------------------------------------------------
test_committed_entries_launch_from_any_cwd() {
    echo "TEST: committed entries launch their wrapper from a subdirectory cwd"

    local tmp mock_dir stderr script sub
    tmp="$(mktemp -d)"
    stderr="${tmp}/stderr.txt"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    sub="${REPO_ROOT}/apps/backend"
    if [ ! -d "${sub}" ]; then sub="${SCRIPT_DIR}"; fi

    # Chrome: no desktop session, so the wrapper's own precondition error is the
    # evidence it was found and executed at all.
    script="$(jq -r '.mcpServers["playwright-chrome"].args[1]' "${REPO_ROOT}/.mcp.json")"
    (cd "${sub}" && PROVISION_CALL_LOG="${tmp}/calls.log" \
        CHROME_MCP_XAUTH_GLOB="${tmp}/no-such-auth.*" PATH="${mock_dir}:${PATH}" \
        bash -c "${script}") >/dev/null 2>"${stderr}"
    if ! grep -q "chrome-mcp-wrapper" "${stderr}"; then
        fail "playwright-chrome entry must launch its wrapper from cwd ${sub}" \
            "stderr:
$(cat "${stderr}")"
        return
    fi

    # Electron: dead CDP endpoint + mocked npx — the wrapper logs, then hands off.
    script="$(jq -r '.mcpServers["playwright-electron"].args[1]' "${REPO_ROOT}/.mcp.json")"
    (cd "${sub}" && PROVISION_CALL_LOG="${tmp}/calls.log" \
        CDP_PROBE_CMD="false" CDP_WAIT_RETRIES=1 CDP_WAIT_INTERVAL=0 \
        PATH="${mock_dir}:${PATH}" \
        bash -c "${script}") >/dev/null 2>"${stderr}"
    if ! grep -q "electron-cdp-mcp-wrapper" "${stderr}"; then
        fail "playwright-electron entry must launch its wrapper from cwd ${sub}" \
            "stderr:
$(cat "${stderr}")"
        return
    fi

    pass "committed entries launch their wrapper from a subdirectory cwd"
}

#-------------------------------------------------------------------------------
# Test 9: the wipe scenario (issue #388 AC 3 / behavior 2). A fresh checkout of
#         the COMMITTED config — repo-relative wrapper commands — followed by a
#         provisioning run must find nothing to repair: the file stays
#         byte-identical and the run reports both entries as verified. If the
#         verify step rewrote the relative form to an absolute path it would
#         dirty the tracked file on every run — the exact bug this slice kills.
#-------------------------------------------------------------------------------
test_committed_config_verifies_without_repair() {
    echo "TEST: fresh checkout of the committed config verifies, no repair"

    local co mock_dir cfg stderr before after
    # Simulate a checkout: the committed config at the root of a tree that holds
    # the wrappers where the repo holds them, so the entries resolve exactly as
    # they do in a real clone.
    co="$(make_fake_checkout)"
    cfg="${co}/.mcp.json"
    stderr="${co}/stderr.txt"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${co}' '${mock_dir}'" RETURN

    before="$(cat "${cfg}")"
    PROVISION_CALL_LOG="${co}/calls.log" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${co}/scripts/verify-pr/chrome-mcp-wrapper.sh" \
        ELECTRON_MCP_WRAPPER="${co}/scripts/verify-pr/electron-cdp-mcp-wrapper.sh" \
        PATH="${mock_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>"${stderr}"
    local exit_code=$?
    after="$(cat "${cfg}")"

    if [ "${exit_code}" -ne 0 ]; then
        fail "provisioning over a committed config should exit 0" "exit=${exit_code}
$(cat "${stderr}")"
        return
    fi
    if [ "${before}" != "${after}" ]; then
        fail "committed config must be byte-identical after provisioning" "after:
${after}"
        return
    fi
    if ! grep -q "playwright-chrome.*verified" "${stderr}" \
        || ! grep -q "playwright-electron.*verified" "${stderr}"; then
        fail "run must report both entries as verified" "stderr:
$(cat "${stderr}")"
        return
    fi
    if grep -q "repaired" "${stderr}"; then
        fail "a correct committed config must repair nothing" "stderr:
$(cat "${stderr}")"
        return
    fi

    pass "fresh checkout of the committed config verifies, no repair"
}

# Build a checkout-shaped temp dir: the committed .mcp.json at its root plus a
# scripts/verify-pr/ tree holding stub wrappers, so the config's repo-relative
# commands resolve exactly as they do in a real clone. Echoes the dir.
make_fake_checkout() {
    local dir
    dir="$(mktemp -d)"
    mkdir -p "${dir}/scripts/verify-pr"
    local w
    for w in chrome-mcp-wrapper.sh electron-cdp-mcp-wrapper.sh; do
        printf '#!/usr/bin/env bash\nexit 0\n' > "${dir}/scripts/verify-pr/${w}"
        chmod +x "${dir}/scripts/verify-pr/${w}"
    done
    cp "${REPO_ROOT}/.mcp.json" "${dir}/.mcp.json"
    echo "${dir}"
}

#-------------------------------------------------------------------------------
# Test 10: repair semantics (issue #388 AC 2 / behavior 3). One entry deleted and
#          one pointed at a bogus command — both come back with the portable
#          repo-relative command, and the run says so ("repaired", not
#          "verified"). This is the hand-edit / partial-wipe recovery path.
#-------------------------------------------------------------------------------
test_repairs_missing_and_wrong_entries() {
    echo "TEST: missing / wrong entries are repaired and reported as repaired"

    local co mock_dir cfg stderr tmpf
    co="$(make_fake_checkout)"
    cfg="${co}/.mcp.json"
    stderr="${co}/stderr.txt"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${co}' '${mock_dir}'" RETURN

    # Damage: chrome entry gone entirely, electron entry pointing at nonsense.
    tmpf="${co}/tampered.json"
    jq 'del(.mcpServers["playwright-chrome"])
        | .mcpServers["playwright-electron"].command = "/nonexistent/wrong.sh"' \
        "${cfg}" > "${tmpf}" && mv "${tmpf}" "${cfg}"

    PROVISION_CALL_LOG="${co}/calls.log" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${co}/scripts/verify-pr/chrome-mcp-wrapper.sh" \
        ELECTRON_MCP_WRAPPER="${co}/scripts/verify-pr/electron-cdp-mcp-wrapper.sh" \
        PATH="${mock_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>"${stderr}"
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "repairing run should exit 0" "exit=${exit_code}
$(cat "${stderr}")"
        return
    fi

    local key rel script
    for key in playwright-chrome playwright-electron; do
        case "${key}" in
            playwright-chrome) rel="scripts/verify-pr/chrome-mcp-wrapper.sh" ;;
            *) rel="scripts/verify-pr/electron-cdp-mcp-wrapper.sh" ;;
        esac
        if [ "$(jq -r --arg k "${key}" '.mcpServers[$k].command' "${cfg}")" != "bash" ]; then
            fail "'${key}' must be repaired to the portable launch form" \
                "got '$(jq -c --arg k "${key}" '.mcpServers[$k]' "${cfg}")'"
            return
        fi
        script="$(jq -r --arg k "${key}" '.mcpServers[$k].args[1] // ""' "${cfg}")"
        if ! printf '%s' "${script}" | grep -qF 'git rev-parse --show-toplevel' \
            || ! printf '%s' "${script}" | grep -qF "/${rel}"; then
            fail "'${key}' must be repaired to launch ${rel} from the resolved checkout root" \
                "script: ${script}"
            return
        fi
        if ! grep -q "${key}.*repaired" "${stderr}"; then
            fail "run must report '${key}' as repaired" "stderr:
$(cat "${stderr}")"
            return
        fi
    done

    # Repaired == what the committed config ships: a repair must converge on the
    # tracked bytes, never leave the file permanently dirty.
    if [ "$(jq -S '.mcpServers | {chrome: .["playwright-chrome"], electron: .["playwright-electron"]}' "${cfg}")" \
        != "$(jq -S '.mcpServers | {chrome: .["playwright-chrome"], electron: .["playwright-electron"]}' "${REPO_ROOT}/.mcp.json")" ]; then
        fail "repaired entries must match the committed ones byte-for-byte" \
            "repaired: $(jq -c '.mcpServers | {c: .["playwright-chrome"], e: .["playwright-electron"]}' "${cfg}")"
        return
    fi

    pass "missing / wrong entries are repaired and reported as repaired"
}

#-------------------------------------------------------------------------------
# Test 10b: a bare repo-relative command (the form that looks right but ENOENTs
#           whenever the session's cwd is not the checkout root) must be REPAIRED,
#           not waved through — and the run must say why, so nobody "fixes" it
#           back. Verification judges an entry by what the MCP runtime can launch,
#           not by what resolves relative to the config file.
#-------------------------------------------------------------------------------
test_repairs_cwd_dependent_relative_command() {
    echo "TEST: a bare relative command is repaired, with a cwd diagnostic"

    local co mock_dir cfg stderr tmpf
    co="$(make_fake_checkout)"
    cfg="${co}/.mcp.json"
    stderr="${co}/stderr.txt"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${co}' '${mock_dir}'" RETURN

    tmpf="${co}/tampered.json"
    jq '.mcpServers["playwright-chrome"] = {
            type: "stdio",
            command: "./scripts/verify-pr/chrome-mcp-wrapper.sh",
            args: [],
            env: {}
        }' "${cfg}" > "${tmpf}" && mv "${tmpf}" "${cfg}"

    PROVISION_CALL_LOG="${co}/calls.log" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${co}/scripts/verify-pr/chrome-mcp-wrapper.sh" \
        ELECTRON_MCP_WRAPPER="${co}/scripts/verify-pr/electron-cdp-mcp-wrapper.sh" \
        PATH="${mock_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>"${stderr}"

    if grep -q "playwright-chrome.*verified" "${stderr}"; then
        fail "a cwd-dependent relative command must not be reported verified" \
            "stderr:
$(cat "${stderr}")"
        return
    fi
    if [ "$(jq -r '.mcpServers["playwright-chrome"].command' "${cfg}")" != "bash" ]; then
        fail "a cwd-dependent relative command must be repaired" \
            "$(jq -c '.mcpServers["playwright-chrome"]' "${cfg}")"
        return
    fi
    if ! grep -qi "cwd" "${stderr}"; then
        fail "the run must explain that relative commands resolve against the session cwd" \
            "stderr:
$(cat "${stderr}")"
        return
    fi

    pass "a bare relative command is repaired, with a cwd diagnostic"
}

#-------------------------------------------------------------------------------
# Test 10c: if the expected command cannot be computed (a broken/absent
#           `realpath`), the run must fail loudly. It must never let two empty
#           strings compare equal and report a wrong entry as verified — that is
#           silent success on a harness config the runtime cannot launch.
#-------------------------------------------------------------------------------
test_uncomputable_expectation_never_verifies() {
    echo "TEST: a broken realpath fails loudly instead of reporting verified"

    local co mock_dir cfg stderr tmpf
    co="$(make_fake_checkout)"
    cfg="${co}/.mcp.json"
    stderr="${co}/stderr.txt"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${co}' '${mock_dir}'" RETURN

    # `realpath` present but broken: prints nothing, exits non-zero.
    printf '#!/usr/bin/env bash\nexit 1\n' > "${mock_dir}/realpath"
    chmod +x "${mock_dir}/realpath"

    # Both entries point at nonsense, so "verified" would be a flat-out lie.
    tmpf="${co}/tampered.json"
    jq '.mcpServers["playwright-chrome"].command = "/nonexistent/wrong.sh"
        | .mcpServers["playwright-chrome"].args = []
        | .mcpServers["playwright-electron"].command = "/nonexistent/wrong.sh"
        | .mcpServers["playwright-electron"].args = []' \
        "${cfg}" > "${tmpf}" && mv "${tmpf}" "${cfg}"

    PROVISION_CALL_LOG="${co}/calls.log" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${co}/scripts/verify-pr/chrome-mcp-wrapper.sh" \
        ELECTRON_MCP_WRAPPER="${co}/scripts/verify-pr/electron-cdp-mcp-wrapper.sh" \
        PATH="${mock_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>"${stderr}"
    local exit_code=$?

    if grep -q "MCP entry .* verified" "${stderr}"; then
        fail "a wrong entry must never be reported verified" "stderr:
$(cat "${stderr}")"
        return
    fi
    if [ "${exit_code}" -eq 0 ]; then
        fail "an uncomputable expectation must exit non-zero" "got exit 0
$(cat "${stderr}")"
        return
    fi

    pass "a broken realpath fails loudly instead of reporting verified"
}

#-------------------------------------------------------------------------------
# Test 11: non-interference (issue #388 behavior 4). The six general-purpose MCP
#          servers (context7, playwright, terraform, docker, mongodb, github) are
#          identical before and after — on the verified pass AND on the repairing
#          pass, which is the one that rewrites the file.
#-------------------------------------------------------------------------------
test_leaves_other_servers_untouched() {
    echo "TEST: the other MCP servers are untouched in both states"

    local co mock_dir cfg tmpf others_before others_after
    co="$(make_fake_checkout)"
    cfg="${co}/.mcp.json"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${co}' '${mock_dir}'" RETURN

    local strip='.mcpServers | del(.["playwright-chrome"], .["playwright-electron"])'
    others_before="$(jq -S "${strip}" "${cfg}")"

    local key expected_keys
    expected_keys="context7 docker github mongodb playwright terraform"
    for key in ${expected_keys}; do
        if ! jq -e --arg k "${key}" '.mcpServers | has($k)' "${cfg}" >/dev/null; then
            fail "fixture must carry the '${key}' server" "$(cat "${cfg}")"
            return
        fi
    done

    # Pass 1: everything correct — verified, no write.
    PROVISION_CALL_LOG="${co}/calls.log" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${co}/scripts/verify-pr/chrome-mcp-wrapper.sh" \
        ELECTRON_MCP_WRAPPER="${co}/scripts/verify-pr/electron-cdp-mcp-wrapper.sh" \
        PATH="${mock_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>&1
    others_after="$(jq -S "${strip}" "${cfg}")"
    if [ "${others_before}" != "${others_after}" ]; then
        fail "verified pass must not touch the other servers" "after:
${others_after}"
        return
    fi

    # Pass 2: harness entries damaged — the rewrite must still leave the rest be.
    tmpf="${co}/tampered.json"
    jq 'del(.mcpServers["playwright-chrome"])
        | .mcpServers["playwright-electron"].command = "/nonexistent/wrong.sh"' \
        "${cfg}" > "${tmpf}" && mv "${tmpf}" "${cfg}"
    PROVISION_CALL_LOG="${co}/calls.log" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${co}/scripts/verify-pr/chrome-mcp-wrapper.sh" \
        ELECTRON_MCP_WRAPPER="${co}/scripts/verify-pr/electron-cdp-mcp-wrapper.sh" \
        PATH="${mock_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>&1
    others_after="$(jq -S "${strip}" "${cfg}")"
    if [ "${others_before}" != "${others_after}" ]; then
        fail "repairing pass must not touch the other servers" "before:
${others_before}
after:
${others_after}"
        return
    fi

    pass "the other MCP servers are untouched in both states"
}

#-------------------------------------------------------------------------------
# Test 12: graceful degradation (issue #388 AC 4). Neither committed entry may
#          fail at config-parse time; each degrades at its own boundary when a
#          precondition is missing.
#
#          The two boundaries differ on purpose. Chrome LAUNCHES a browser, so no
#          desktop session is fatal at startup (never fall back to headless).
#          Electron only ATTACHES over CDP, and the app is launched minutes after
#          the session's MCP servers are spawned — so a dead endpoint must NOT be
#          fatal: the server registers (tools exist) and warns, and the failure
#          lands on the tool call that comes too early.
#-------------------------------------------------------------------------------
test_committed_entries_fail_at_connect_time() {
    echo "TEST: committed entries degrade gracefully at connect time"

    local tmp mock_dir script stderr
    tmp="$(mktemp -d)"
    stderr="${tmp}/stderr.txt"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    # Chrome path: no desktop session (no X-authority file matches the glob).
    script="$(jq -r '.mcpServers["playwright-chrome"].args[1]' "${REPO_ROOT}/.mcp.json")"
    (cd "${REPO_ROOT}" && PROVISION_CALL_LOG="${tmp}/calls.log" \
        CHROME_MCP_XAUTH_GLOB="${tmp}/no-such-auth.*" PATH="${mock_dir}:${PATH}" \
        bash -c "${script}") >/dev/null 2>"${stderr}"
    local exit_code=$?
    if [ "${exit_code}" -eq 0 ]; then
        fail "chrome entry must fail without a desktop session" "got exit 0"
        return
    fi
    if ! grep -q "no active desktop session" "${stderr}"; then
        fail "chrome entry must name the missing precondition" "stderr:
$(cat "${stderr}")"
        return
    fi

    # Electron path: CDP endpoint never answers — bounded wait, warn, register.
    script="$(jq -r '.mcpServers["playwright-electron"].args[1]' "${REPO_ROOT}/.mcp.json")"
    : > "${tmp}/calls.log"
    (cd "${REPO_ROOT}" && PROVISION_CALL_LOG="${tmp}/calls.log" \
        CDP_PROBE_CMD="false" CDP_WAIT_RETRIES=2 CDP_WAIT_INTERVAL=0 \
        PATH="${mock_dir}:${PATH}" \
        bash -c "${script}") >/dev/null 2>"${stderr}"
    exit_code=$?
    if [ "${exit_code}" -ne 0 ]; then
        fail "electron entry must still register when no CDP endpoint answers" \
            "exit=${exit_code}
$(cat "${stderr}")"
        return
    fi
    if ! grep -qF -- "--cdp-endpoint" "${tmp}/calls.log"; then
        fail "electron entry must start the MCP server so its tools exist" \
            "calls:
$(cat "${tmp}/calls.log")"
        return
    fi
    if ! grep -q "CDP endpoint" "${stderr}"; then
        fail "electron entry must warn about the dead CDP endpoint" "stderr:
$(cat "${stderr}")"
        return
    fi

    pass "committed entries degrade gracefully at connect time"
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
test_registers_electron_cdp_entry
test_committed_config_has_both_entries
test_committed_entries_launch_from_any_cwd
test_committed_config_verifies_without_repair
test_repairs_missing_and_wrong_entries
test_repairs_cwd_dependent_relative_command
test_uncomputable_expectation_never_verifies
test_leaves_other_servers_untouched
test_committed_entries_fail_at_connect_time

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
