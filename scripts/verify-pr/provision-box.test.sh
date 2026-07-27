#!/usr/bin/env bash
# Tests for scripts/verify-pr/provision-box.sh
#
# Run: bash scripts/verify-pr/provision-box.test.sh
#
# Strategy: provisioning touches the host through a handful of external tools —
# `google-chrome-stable` (presence check), `docker` (daemon reachability),
# `npx`/`playwright` (browser install), `npm` (smoker workspace install),
# `apt-get` + `usermod` (mutations). We
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

# A stand-in Electron binary. It records every invocation in ${PROVISION_CALL_LOG}
# (so a test can prove provisioning's launch PROBE really ran it), and reports
# the binary that executed and the PID it executed under — which is what the
# assertions are about, since the shim is a wrapper script and its own realpath
# says nothing about what it dispatches to.
make_fake_electron() {
    cat > "$1" <<'EOF'
#!/usr/bin/env bash
if [ -n "${PROVISION_CALL_LOG:-}" ]; then
    echo "electron-probe $*" >> "${PROVISION_CALL_LOG}"
fi
printf 'bin=%s\n' "$0"
printf 'pid=%s\n' "$$"
exit 0
EOF
    chmod +x "$1"
}

# An Electron that RESOLVES but cannot START — the real failure mode of an
# npm-installed chrome-sandbox that is not root:root 4755 on a box whose
# unprivileged user namespaces are restricted.
make_unstartable_electron() {
    cat > "$1" <<'EOF'
#!/usr/bin/env bash
echo "FATAL:setuid_sandbox_host.cc(158) The SUID sandbox helper binary was found, but is not configured correctly." >&2
exit 133
EOF
    chmod +x "$1"
}

# The binary a command actually RUNS, through a given PATH: the `bin=` line the
# fake Electron prints. Stronger than realpath on the shim — this is what the
# launcher would execute when it invokes the name.
#   $1 = PATH to run under   $2 = command line
dispatched_binary() {
    PATH="$1" bash -c "$2" 2>/dev/null | sed -n 's/^bin=//p'
}

# A fake provisioned smoker workspace: an Electron binary and a shell bundle
# built after its sources. Exported for every invocation below so "already
# provisioned" is the hermetic default — no test depends on whether this host
# happens to have Electron installed or the app built — and the tests that
# exercise the install/build branches point the variables elsewhere. The default
# build command only logs, so an unintended build shows up as a failure rather
# than as a silently satisfied step.
FAKE_SMOKER_DIR="$(mktemp -d)"
FAKE_ELECTRON_BIN="${FAKE_SMOKER_DIR}/electron"
make_fake_electron "${FAKE_ELECTRON_BIN}"
mkdir -p "${FAKE_SMOKER_DIR}/electron-app" "${FAKE_SMOKER_DIR}/.webpack/main"
touch "${FAKE_SMOKER_DIR}/electron-app/index.ts"
touch "${FAKE_SMOKER_DIR}/.webpack/main/index.js"
export SMOKER_ELECTRON_BINARIES="${FAKE_ELECTRON_BIN}"
# The launcher's command name and the PATH dir provisioning shims it into are
# redirected into the same fake workspace — the real ~/.local/bin is never
# touched by a test run — and a stand-in Electron is seeded under the launcher's
# command name there, ahead of anything this host has installed, so no test can
# reach (or be judged by) a real Electron on the box.
FAKE_SHIM_DIR="${FAKE_SMOKER_DIR}/bin"
mkdir -p "${FAKE_SHIM_DIR}"
make_fake_electron "${FAKE_SHIM_DIR}/electron"
export SMOKER_ELECTRON_SHIM_DIR="${FAKE_SHIM_DIR}"
export PATH="${FAKE_SHIM_DIR}:${PATH}"
export SMOKER_SHELL_BUNDLE="${FAKE_SMOKER_DIR}/.webpack/main/index.js"
export SMOKER_SHELL_SOURCES="${FAKE_SMOKER_DIR}/electron-app"
export SMOKER_SHELL_BUILD_CMD='printf "shell-build\n" >> "${PROVISION_CALL_LOG}"'
trap 'rm -rf "${FAKE_SMOKER_DIR}"' EXIT

# Build a mock bin. Args select which tools are "present" and healthy:
#   $2 = with_chrome  (yes|no)   → provide google-chrome-stable stub
#   $3 = docker_ok    (yes|no)   → `docker info` exits 0 (else 1)
#   $4 = playwright_ok(yes|no)   → `npx playwright --version` exits 0 (else 1)
# Every stub logs `<tool> $*` to ${PROVISION_CALL_LOG}. apt-get, usermod, sudo
# are always mutation-loggers. `npm` additionally simulates a successful
# workspace install by creating the file ${MOCK_NPM_CREATES} names, when set.
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

    cat > "${mock_dir}/npm" <<'EOF'
#!/usr/bin/env bash
echo "npm $*" >> "${PROVISION_CALL_LOG}"
# Stand in for the install actually landing the Electron binary on disk.
if [ -n "${MOCK_NPM_CREATES:-}" ]; then
    mkdir -p "$(dirname "${MOCK_NPM_CREATES}")"
    printf '#!/usr/bin/env bash\nexit 0\n' > "${MOCK_NPM_CREATES}"
    chmod +x "${MOCK_NPM_CREATES}"
fi
exit 0
EOF
    chmod +x "${mock_dir}/npm"

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
# Test 13: smoker workspace deps absent (no Electron binary on disk) => the
#          workspace install runs, and the binary is verifiably there afterwards
#          (issue #390 AC 3 / behavior 4). Without it the harness launcher has
#          nothing to run in the daemon checkout.
#-------------------------------------------------------------------------------
test_installs_smoker_deps_when_absent() {
    echo "TEST: installs smoker workspace deps when the Electron binary is absent"

    local tmp mock_dir cfg log stderr missing_bin
    tmp="$(mktemp -d)"
    cfg="${tmp}/.mcp.json"
    log="${tmp}/calls.log"
    stderr="${tmp}/stderr.txt"
    missing_bin="${tmp}/node_modules/electron/dist/electron"
    seed_config "${cfg}"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    # The binary is absent; the mocked npm creates it, standing in for the real
    # install landing it on disk.
    PROVISION_CALL_LOG="${log}" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${WRAPPER}" \
        SMOKER_ELECTRON_BINARIES="${missing_bin}" MOCK_NPM_CREATES="${missing_bin}" \
        PATH="${mock_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>"${stderr}"
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "provisioning should exit 0 after installing the smoker deps" \
            "exit=${exit_code}
$(cat "${stderr}")"
        return
    fi
    if ! grep -Eq 'npm install .*(--workspace|-w) ?=?smoker' "${log}"; then
        fail "absent smoker deps must trigger the workspace install" "log:
$(cat "${log}")"
        return
    fi
    if ! grep -q 'legacy-peer-deps' "${log}"; then
        fail "the workspace install must use --legacy-peer-deps (repo-wide rule)" "log:
$(cat "${log}")"
        return
    fi
    if [ ! -x "${missing_bin}" ]; then
        fail "the Electron binary must be on disk after provisioning" "missing: ${missing_bin}"
        return
    fi
    if ! grep -qi "installed" "${stderr}"; then
        fail "the run must report the deps as installed" "stderr:
$(cat "${stderr}")"
        return
    fi

    pass "installs smoker workspace deps when the Electron binary is absent"
}

#-------------------------------------------------------------------------------
# Test 14: smoker workspace deps already present => no install at all, exit 0,
#          reported as a no-op (issue #390 AC 3 / behavior 3). This is the state
#          of a provisioned box, which is every run after the first: a round must
#          never pay for an npm install it does not need.
#-------------------------------------------------------------------------------
test_smoker_deps_present_is_noop() {
    echo "TEST: smoker deps present => no install (no-op)"

    local tmp mock_dir cfg log stderr present_bin
    tmp="$(mktemp -d)"
    cfg="${tmp}/.mcp.json"
    log="${tmp}/calls.log"
    stderr="${tmp}/stderr.txt"
    present_bin="${tmp}/node_modules/electron/dist/electron"
    seed_config "${cfg}"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    mkdir -p "$(dirname "${present_bin}")"
    printf '#!/usr/bin/env bash\nexit 0\n' > "${present_bin}"
    chmod +x "${present_bin}"

    PROVISION_CALL_LOG="${log}" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${WRAPPER}" \
        SMOKER_ELECTRON_BINARIES="${present_bin}" \
        PATH="${mock_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>"${stderr}"
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "provisioning should exit 0 when the smoker deps are present" \
            "exit=${exit_code}
$(cat "${stderr}")"
        return
    fi
    if grep -q 'npm install' "${log}"; then
        fail "present smoker deps must not trigger an install" "log:
$(cat "${log}")"
        return
    fi
    if ! grep -q "smoker workspace deps present" "${stderr}"; then
        fail "the run must report the deps as already present" "stderr:
$(cat "${stderr}")"
        return
    fi

    pass "smoker deps present => no install (no-op)"
}

#-------------------------------------------------------------------------------
# Test 15: the binary check is what "provisioned" means (issue #390 AC 3). An
#          install that exits 0 but leaves no Electron binary on disk must fail
#          loudly here, not silently hand the launcher a box it cannot run on.
#-------------------------------------------------------------------------------
test_install_without_binary_fails_loudly() {
    echo "TEST: install that leaves no Electron binary fails loudly"

    local tmp mock_dir cfg stderr missing_bin
    tmp="$(mktemp -d)"
    cfg="${tmp}/.mcp.json"
    stderr="${tmp}/stderr.txt"
    missing_bin="${tmp}/node_modules/electron/dist/electron"
    seed_config "${cfg}"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    # npm "succeeds" but creates nothing (MOCK_NPM_CREATES unset).
    PROVISION_CALL_LOG="${tmp}/calls.log" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${WRAPPER}" \
        SMOKER_ELECTRON_BINARIES="${missing_bin}" \
        PATH="${mock_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>"${stderr}"
    local exit_code=$?

    if [ "${exit_code}" -eq 0 ]; then
        fail "a missing Electron binary after install must exit non-zero" "got exit 0
$(cat "${stderr}")"
        return
    fi
    if ! grep -qF "${missing_bin}" "${stderr}"; then
        fail "the error must name where the Electron binary was expected" "stderr:
$(cat "${stderr}")"
        return
    fi

    pass "install that leaves no Electron binary fails loudly"
}

#-------------------------------------------------------------------------------
# Test 16: the launcher runs `electron` from PATH by default (its unchanged
#          ELECTRON_BIN default), but a workspace install puts the binary in
#          node_modules — off PATH. Provisioning must MAKE that name resolve, or
#          the bare `electron-launcher.sh start` documented in the skill dies
#          with "command not found" on a box just called provisioned and only
#          surfaces 60s later as a CDP timeout (issue #390 AC 4).
#
#          A per-test command name + shim dir keep the assertion independent of
#          whatever Electron this host happens to have installed.
#-------------------------------------------------------------------------------
test_links_launcher_electron_when_off_path() {
    echo "TEST: links the launcher's electron command when it is off PATH"

    local tmp mock_dir cfg stderr present_bin shim_dir
    tmp="$(mktemp -d)"
    cfg="${tmp}/.mcp.json"
    stderr="${tmp}/stderr.txt"
    present_bin="${tmp}/node_modules/electron/dist/electron"
    shim_dir="${tmp}/shimbin"
    seed_config "${cfg}"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    mkdir -p "$(dirname "${present_bin}")" "${shim_dir}"
    make_fake_electron "${present_bin}"

    PROVISION_CALL_LOG="${tmp}/calls.log" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${WRAPPER}" \
        SMOKER_ELECTRON_BINARIES="${present_bin}" \
        SMOKER_LAUNCHER_ELECTRON_CMD="electron-shimtest-xyz" \
        SMOKER_ELECTRON_SHIM_DIR="${shim_dir}" \
        PATH="${mock_dir}:${shim_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>"${stderr}"
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "provisioning should exit 0 after linking the launcher's electron command" \
            "exit=${exit_code}
$(cat "${stderr}")"
        return
    fi

    # The launcher's bare default must now resolve, and to the workspace binary.
    local resolved dispatched
    resolved="$(PATH="${mock_dir}:${shim_dir}:${PATH}" bash -c \
        'command -v electron-shimtest-xyz' 2>/dev/null)"
    if [ -z "${resolved}" ]; then
        fail "the launcher's electron command must resolve on PATH after provisioning" \
            "stderr:
$(cat "${stderr}")"
        return
    fi
    # Resolving is not running: assert on the binary the name actually executes.
    dispatched="$(dispatched_binary "${mock_dir}:${shim_dir}:${PATH}" electron-shimtest-xyz)"
    if [ "${dispatched}" != "${present_bin}" ]; then
        fail "the launcher's electron command must run the workspace binary" \
            "resolved: ${resolved}
ran:      ${dispatched:-nothing}
wanted:   ${present_bin}"
        return
    fi

    pass "links the launcher's electron command when it is off PATH"
}

#-------------------------------------------------------------------------------
# Test 17: the shim step is verify-then-act like every other one: the shim a
#          previous run installed is a no-op on the next run (issue #390 AC 3),
#          while one left pointing at a stale target is rewritten — a box
#          provisioned before a reinstall must not keep launching a binary that
#          is gone. The stale fixture is the pre-#402 bare symlink, which is
#          exactly what a box provisioned by the earlier round carries.
#-------------------------------------------------------------------------------
test_launcher_electron_shim_is_idempotent() {
    echo "TEST: correct electron shim is a no-op, stale shim is repointed"

    local tmp mock_dir cfg stderr present_bin stale_bin shim_dir shim
    tmp="$(mktemp -d)"
    cfg="${tmp}/.mcp.json"
    stderr="${tmp}/stderr.txt"
    present_bin="${tmp}/node_modules/electron/dist/electron"
    stale_bin="${tmp}/old/electron"
    shim_dir="${tmp}/shimbin"
    shim="${shim_dir}/electron-shimtest-xyz"
    seed_config "${cfg}"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    mkdir -p "$(dirname "${present_bin}")" "$(dirname "${stale_bin}")" "${shim_dir}"
    make_fake_electron "${present_bin}"
    make_fake_electron "${stale_bin}"

    run_shim_provision() {
        PROVISION_CALL_LOG="${tmp}/calls.log" MCP_CONFIG_FILE="${cfg}" \
            CHROME_MCP_WRAPPER="${WRAPPER}" \
            SMOKER_ELECTRON_BINARIES="${present_bin}" \
            SMOKER_LAUNCHER_ELECTRON_CMD="electron-shimtest-xyz" \
            SMOKER_ELECTRON_SHIM_DIR="${shim_dir}" \
            PATH="${mock_dir}:${shim_dir}:${PATH}" \
            bash "${PROVISION}" >/dev/null 2>"${stderr}"
    }

    # First run installs the shim; the SECOND run over it must change nothing.
    run_shim_provision
    local exit_code=$? installed
    if [ "${exit_code}" -ne 0 ]; then
        fail "provisioning should exit 0 when installing the electron shim" \
            "exit=${exit_code}
$(cat "${stderr}")"
        return
    fi
    installed="$(cat "${shim}")"

    run_shim_provision
    exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "provisioning should exit 0 when the electron shim is already correct" \
            "exit=${exit_code}
$(cat "${stderr}")"
        return
    fi
    if grep -Eq "linking|installing shim" "${stderr}"; then
        fail "a correct electron shim must not be rewritten" "stderr:
$(cat "${stderr}")"
        return
    fi
    if ! grep -q "shim current" "${stderr}"; then
        fail "a correct electron shim must be reported as no change" "stderr:
$(cat "${stderr}")"
        return
    fi
    if [ "$(cat "${shim}")" != "${installed}" ]; then
        fail "a second run must leave the shim byte-identical" "now:
$(cat "${shim}")"
        return
    fi

    # Pointing at a stale target => rewritten to run the binary on disk now.
    ln -sfn "${stale_bin}" "${shim}"
    run_shim_provision
    exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "provisioning should exit 0 after repointing a stale electron shim" \
            "exit=${exit_code}
$(cat "${stderr}")"
        return
    fi
    local dispatched
    dispatched="$(dispatched_binary "${mock_dir}:${shim_dir}:${PATH}" electron-shimtest-xyz)"
    if [ "${dispatched}" != "${present_bin}" ]; then
        fail "a stale electron shim must be repointed at the workspace binary" \
            "ran:    ${dispatched:-nothing}
wanted: ${present_bin}"
        return
    fi

    pass "correct electron shim is a no-op, stale shim is repointed"
}

#-------------------------------------------------------------------------------
# Test 18: the shim is VERIFIED after it is written, and a name that still does
#          not resolve fails the run (issue #390 AC 3/4). Writing a link into a
#          directory that is not on PATH leaves the launcher exactly as broken as
#          before, so provisioning must not report such a box as provisioned.
#-------------------------------------------------------------------------------
test_unresolvable_electron_shim_fails() {
    echo "TEST: an electron shim that still does not resolve fails the run"

    local tmp mock_dir cfg stderr present_bin shim_dir
    tmp="$(mktemp -d)"
    cfg="${tmp}/.mcp.json"
    stderr="${tmp}/stderr.txt"
    present_bin="${tmp}/node_modules/electron/dist/electron"
    shim_dir="${tmp}/not-on-path"
    seed_config "${cfg}"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    mkdir -p "$(dirname "${present_bin}")"
    make_fake_electron "${present_bin}"

    # shim_dir is deliberately absent from PATH.
    PROVISION_CALL_LOG="${tmp}/calls.log" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${WRAPPER}" \
        SMOKER_ELECTRON_BINARIES="${present_bin}" \
        SMOKER_LAUNCHER_ELECTRON_CMD="electron-shimtest-xyz" \
        SMOKER_ELECTRON_SHIM_DIR="${shim_dir}" \
        PATH="${mock_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>"${stderr}"
    local exit_code=$?

    if [ "${exit_code}" -eq 0 ]; then
        fail "an unresolvable launcher electron command must exit non-zero" "got exit 0
$(cat "${stderr}")"
        return
    fi
    if ! grep -qF "${shim_dir}" "${stderr}"; then
        fail "the error must name the shim directory that is not on PATH" "stderr:
$(cat "${stderr}")"
        return
    fi
    # A failed step must stop the run: the later steps never happen.
    if grep -q "provisioning complete" "${stderr}"; then
        fail "a failed shim step must abort provisioning" "stderr:
$(cat "${stderr}")"
        return
    fi

    pass "an electron shim that still does not resolve fails the run"
}

#-------------------------------------------------------------------------------
# Test 19: a real Electron already on PATH satisfies the launcher's default, so
#          provisioning leaves the host's PATH alone — no shim is written
#          (issue #390 AC 3, "present is a no-op").
#-------------------------------------------------------------------------------
test_existing_path_electron_is_left_alone() {
    echo "TEST: an electron already on PATH is left alone (no shim written)"

    local tmp mock_dir cfg stderr present_bin shim_dir
    tmp="$(mktemp -d)"
    cfg="${tmp}/.mcp.json"
    stderr="${tmp}/stderr.txt"
    present_bin="${tmp}/node_modules/electron/dist/electron"
    shim_dir="${tmp}/shimbin"
    seed_config "${cfg}"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    mkdir -p "$(dirname "${present_bin}")" "${shim_dir}"
    make_fake_electron "${present_bin}"

    # A "system" Electron under the launcher's command name, already on PATH.
    make_fake_electron "${mock_dir}/electron-shimtest-xyz"

    PROVISION_CALL_LOG="${tmp}/calls.log" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${WRAPPER}" \
        SMOKER_ELECTRON_BINARIES="${present_bin}" \
        SMOKER_LAUNCHER_ELECTRON_CMD="electron-shimtest-xyz" \
        SMOKER_ELECTRON_SHIM_DIR="${shim_dir}" \
        PATH="${mock_dir}:${shim_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>"${stderr}"
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "provisioning should exit 0 when electron already resolves on PATH" \
            "exit=${exit_code}
$(cat "${stderr}")"
        return
    fi
    if [ -e "${shim_dir}/electron-shimtest-xyz" ]; then
        fail "no shim should be written when electron already resolves on PATH" \
            "unexpected: ${shim_dir}/electron-shimtest-xyz"
        return
    fi

    pass "an electron already on PATH is left alone (no shim written)"
}

#-------------------------------------------------------------------------------
# Test 19b: an Electron whose SUID sandbox helper IS root-owned mode 4755 can
#           sandbox itself, so provisioning must not weaken it: the shim carries
#           no sandbox-disabling knob, and no privilege escalation is attempted.
#           (issue #390 AC 4 — prefer the correct configuration when it holds.)
#
#           `stat` is stubbed for the helper only, since a test cannot create a
#           root-owned setuid file; every other stat call falls through to the
#           real one.
#-------------------------------------------------------------------------------
test_correct_sandbox_is_left_enabled() {
    echo "TEST: a root-owned 4755 sandbox helper is left enabled (no disabling, no sudo)"

    local tmp mock_dir cfg log stderr present_bin helper shim_dir shim
    tmp="$(mktemp -d)"
    cfg="${tmp}/.mcp.json"
    log="${tmp}/calls.log"
    stderr="${tmp}/stderr.txt"
    present_bin="${tmp}/node_modules/electron/dist/electron"
    helper="${tmp}/node_modules/electron/dist/chrome-sandbox"
    shim_dir="${tmp}/shimbin"
    shim="${shim_dir}/electron-shimtest-xyz"
    seed_config "${cfg}"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    mkdir -p "$(dirname "${present_bin}")" "${shim_dir}"
    make_fake_electron "${present_bin}"
    printf 'not-a-real-sandbox\n' > "${helper}"

    cat > "${mock_dir}/stat" <<EOF
#!/usr/bin/env bash
# Only the helper is faked — pretend it is the root-owned setuid binary
# Chromium demands. Anything else falls through to the real stat.
if [ "\$3" = "${helper}" ]; then
    case "\$2" in
        '%u') echo 0; exit 0 ;;
        '%a') echo 4755; exit 0 ;;
    esac
fi
exec /usr/bin/stat "\$@"
EOF
    chmod +x "${mock_dir}/stat"

    PROVISION_CALL_LOG="${log}" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${WRAPPER}" \
        SMOKER_ELECTRON_BINARIES="${present_bin}" \
        SMOKER_LAUNCHER_ELECTRON_CMD="electron-shimtest-xyz" \
        SMOKER_ELECTRON_SHIM_DIR="${shim_dir}" \
        PATH="${mock_dir}:${shim_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>"${stderr}"
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "provisioning should exit 0 when the sandbox helper is already correct" \
            "exit=${exit_code}
$(cat "${stderr}")"
        return
    fi
    if [ ! -x "${shim}" ]; then
        fail "provisioning must install the launcher shim" "missing: ${shim}"
        return
    fi
    if grep -q "ELECTRON_DISABLE_SANDBOX" "${shim}"; then
        fail "a working SUID sandbox must not be disabled in the shim" "shim:
$(cat "${shim}")"
        return
    fi
    if ! grep -q "sandbox stays on" "${stderr}"; then
        fail "the run must report that the sandbox stays on" "stderr:
$(cat "${stderr}")"
        return
    fi
    if grep -q '^sudo ' "${log}"; then
        fail "no privilege escalation may be attempted when the helper is already correct" \
            "log:
$(cat "${log}")"
        return
    fi
    # The step must have actually LAUNCHED Electron through the shim, not merely
    # resolved the name — the whole point of the probe.
    if ! grep -q 'electron-probe' "${log}"; then
        fail "provisioning must launch Electron through the shim as a probe" "log:
$(cat "${log}")"
        return
    fi

    pass "a root-owned 4755 sandbox helper is left enabled (no disabling, no sudo)"
}

#-------------------------------------------------------------------------------
# Test 19c: the box the harness actually runs on — an npm-unpacked chrome-sandbox
#           owned by the agent user, and no passwordless sudo to fix it. Chromium
#           aborts at startup in that state, so provisioning degrades DELIBERATELY:
#           the shim disables the sandbox for the harness process, loudly, and the
#           run still succeeds (issue #390 AC 4).
#
#           It must probe privilege with `sudo -n` and never a bare `sudo`: an
#           unattended round has nobody to type a password, and a prompt would
#           hang provisioning forever.
#-------------------------------------------------------------------------------
test_unfixable_sandbox_is_disabled_in_shim() {
    echo "TEST: an unfixable SUID sandbox is disabled in the shim, loudly"

    local tmp mock_dir cfg log stderr present_bin helper shim_dir shim
    tmp="$(mktemp -d)"
    cfg="${tmp}/.mcp.json"
    log="${tmp}/calls.log"
    stderr="${tmp}/stderr.txt"
    present_bin="${tmp}/node_modules/electron/dist/electron"
    helper="${tmp}/node_modules/electron/dist/chrome-sandbox"
    shim_dir="${tmp}/shimbin"
    shim="${shim_dir}/electron-shimtest-xyz"
    seed_config "${cfg}"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    mkdir -p "$(dirname "${present_bin}")" "${shim_dir}"
    make_fake_electron "${present_bin}"
    # Owned by the test user, no setuid bit — exactly what `npm install` unpacks.
    printf 'not-a-real-sandbox\n' > "${helper}"
    chmod 755 "${helper}"

    # A sudo that behaves like this box's: non-interactive attempts are refused,
    # and a bare (prompting) sudo is recorded so the test can prove none happened.
    cat > "${mock_dir}/sudo" <<'EOF'
#!/usr/bin/env bash
if [ "$1" = "-n" ]; then
    echo "sudo -n $*" >> "${PROVISION_CALL_LOG}"
    echo "sudo: a password is required" >&2
    exit 1
fi
echo "sudo-BARE $*" >> "${PROVISION_CALL_LOG}"
exit 0
EOF
    chmod +x "${mock_dir}/sudo"

    PROVISION_CALL_LOG="${log}" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${WRAPPER}" \
        SMOKER_ELECTRON_BINARIES="${present_bin}" \
        SMOKER_LAUNCHER_ELECTRON_CMD="electron-shimtest-xyz" \
        SMOKER_ELECTRON_SHIM_DIR="${shim_dir}" \
        PATH="${mock_dir}:${shim_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>"${stderr}"
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "provisioning should still exit 0 when it degrades the sandbox" \
            "exit=${exit_code}
$(cat "${stderr}")"
        return
    fi
    if [ ! -x "${shim}" ]; then
        fail "provisioning must install the launcher shim" "missing: ${shim}"
        return
    fi
    if ! grep -q "ELECTRON_DISABLE_SANDBOX=1" "${shim}"; then
        fail "an unfixable SUID sandbox must be disabled in the shim" "shim:
$(cat "${shim}")"
        return
    fi
    if ! grep -q "DEGRADED" "${stderr}"; then
        fail "the run must say loudly that it degraded the sandbox" "stderr:
$(cat "${stderr}")"
        return
    fi
    if grep -q 'sudo-BARE' "${log}"; then
        fail "provisioning must never run a bare sudo (it would hang on a password prompt)" \
            "log:
$(cat "${log}")"
        return
    fi
    if ! grep -q 'electron-probe' "${log}"; then
        fail "provisioning must launch Electron through the degraded shim as a probe" \
            "log:
$(cat "${log}")"
        return
    fi

    pass "an unfixable SUID sandbox is disabled in the shim, loudly"
}

#-------------------------------------------------------------------------------
# Test 19d: the launch probe is the new meaning of "provisioned". An Electron
#           whose NAME resolves perfectly but which dies on exec (the box's real
#           sandbox abort) must fail the step and stop the run — the exact case a
#           resolve-only check waved through, leaving the launcher to die 60s
#           later on a box that had just reported itself ready (issue #390 AC 4).
#-------------------------------------------------------------------------------
test_unstartable_electron_fails_the_run() {
    echo "TEST: an Electron that resolves but cannot start fails the run"

    local tmp mock_dir cfg stderr broken_bin shim_dir
    tmp="$(mktemp -d)"
    cfg="${tmp}/.mcp.json"
    stderr="${tmp}/stderr.txt"
    broken_bin="${tmp}/node_modules/electron/dist/electron"
    shim_dir="${tmp}/shimbin"
    seed_config "${cfg}"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    mkdir -p "$(dirname "${broken_bin}")" "${shim_dir}"
    make_unstartable_electron "${broken_bin}"

    PROVISION_CALL_LOG="${tmp}/calls.log" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${WRAPPER}" \
        SMOKER_ELECTRON_BINARIES="${broken_bin}" \
        SMOKER_LAUNCHER_ELECTRON_CMD="electron-shimtest-xyz" \
        SMOKER_ELECTRON_SHIM_DIR="${shim_dir}" \
        PATH="${mock_dir}:${shim_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>"${stderr}"
    local exit_code=$?

    if [ "${exit_code}" -eq 0 ]; then
        fail "an Electron that cannot start must exit non-zero" "got exit 0
$(cat "${stderr}")"
        return
    fi
    if ! grep -q "does not START Electron" "${stderr}"; then
        fail "the error must say the command does not start Electron" "stderr:
$(cat "${stderr}")"
        return
    fi
    if ! grep -q "SUID sandbox helper" "${stderr}"; then
        fail "the error must carry the probe's own output for diagnosis" "stderr:
$(cat "${stderr}")"
        return
    fi
    # A box the launcher cannot start the shell on must never report as ready.
    if grep -q "provisioning complete" "${stderr}"; then
        fail "a failed launch probe must abort provisioning" "stderr:
$(cat "${stderr}")"
        return
    fi

    pass "an Electron that resolves but cannot start fails the run"
}

#-------------------------------------------------------------------------------
# Test 19e: the shim must EXEC the binary, not parent it. electron-launcher.sh
#           records the PID of what it spawned and `stop` kills that PID, so a
#           shim that forked would leave the real Electron running after a stop
#           that reported success. Asserted the way the launcher does it: spawn
#           in the background, keep `$!`, compare with the PID that actually ran.
#-------------------------------------------------------------------------------
test_shim_execs_so_launcher_pid_is_electron() {
    echo "TEST: the shim execs, so the PID the launcher records is Electron's"

    local tmp mock_dir cfg stderr present_bin shim_dir shim out
    tmp="$(mktemp -d)"
    cfg="${tmp}/.mcp.json"
    stderr="${tmp}/stderr.txt"
    present_bin="${tmp}/node_modules/electron/dist/electron"
    shim_dir="${tmp}/shimbin"
    shim="${shim_dir}/electron-shimtest-xyz"
    out="${tmp}/shim-out.txt"
    seed_config "${cfg}"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    mkdir -p "$(dirname "${present_bin}")" "${shim_dir}"
    make_fake_electron "${present_bin}"

    PROVISION_CALL_LOG="${tmp}/calls.log" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${WRAPPER}" \
        SMOKER_ELECTRON_BINARIES="${present_bin}" \
        SMOKER_LAUNCHER_ELECTRON_CMD="electron-shimtest-xyz" \
        SMOKER_ELECTRON_SHIM_DIR="${shim_dir}" \
        PATH="${mock_dir}:${shim_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>"${stderr}"
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "provisioning should exit 0 before the PID check" "exit=${exit_code}
$(cat "${stderr}")"
        return
    fi

    local spawned ran
    "${shim}" > "${out}" 2>/dev/null &
    spawned=$!
    wait "${spawned}"
    ran="$(sed -n 's/^pid=//p' "${out}")"

    if [ -z "${ran}" ]; then
        fail "the shim must run the Electron binary" "output:
$(cat "${out}")"
        return
    fi
    if [ "${spawned}" != "${ran}" ]; then
        fail "the shim must exec Electron so the launcher's recorded PID is the app" \
            "launcher would record: ${spawned}
Electron actually ran as: ${ran}"
        return
    fi

    pass "the shim execs, so the PID the launcher records is Electron's"
}

#-------------------------------------------------------------------------------
# Test 20: the shell the launcher runs is the BUILT main-process bundle
#          (`package.json` "main" is ./.webpack/main, which is gitignored), not
#          the TypeScript sources. With no bundle on disk `electron <app dir>`
#          has nothing to run, so provisioning must build it (issue #390 AC 3/4).
#-------------------------------------------------------------------------------
test_builds_shell_bundle_when_absent() {
    echo "TEST: builds the shell bundle when it is absent"

    local tmp mock_dir cfg log stderr bundle
    tmp="$(mktemp -d)"
    cfg="${tmp}/.mcp.json"
    log="${tmp}/calls.log"
    stderr="${tmp}/stderr.txt"
    bundle="${tmp}/.webpack/main/index.js"
    seed_config "${cfg}"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    mkdir -p "${tmp}/electron-app"
    touch "${tmp}/electron-app/index.ts"

    PROVISION_CALL_LOG="${log}" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${WRAPPER}" \
        SMOKER_SHELL_BUNDLE="${bundle}" SMOKER_SHELL_SOURCES="${tmp}/electron-app" \
        SMOKER_SHELL_BUILD_CMD="printf 'shell-build\n' >> '${log}'; mkdir -p '$(dirname "${bundle}")'; touch '${bundle}'" \
        PATH="${mock_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>"${stderr}"
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "provisioning should exit 0 after building the shell bundle" \
            "exit=${exit_code}
$(cat "${stderr}")"
        return
    fi
    if ! grep -q 'shell-build' "${log}"; then
        fail "an absent shell bundle must trigger the shell build" "log:
$(cat "${log}")"
        return
    fi
    if [ ! -f "${bundle}" ]; then
        fail "the shell bundle must be on disk after provisioning" "missing: ${bundle}"
        return
    fi
    if ! grep -qi "shell bundle built" "${stderr}"; then
        fail "the run must report the shell bundle as built" "stderr:
$(cat "${stderr}")"
        return
    fi

    pass "builds the shell bundle when it is absent"
}

#-------------------------------------------------------------------------------
# Test 21: a bundle built BEFORE the current shell sources must be rebuilt. This
#          is the silent-failure case: the stale shell still starts and CDP still
#          answers, it just runs the old main process — so a round would "verify"
#          a renderer-URL override the shell never read (issue #390 AC 4).
#-------------------------------------------------------------------------------
test_rebuilds_stale_shell_bundle() {
    echo "TEST: rebuilds the shell bundle when sources are newer than it"

    local tmp mock_dir cfg log stderr bundle
    tmp="$(mktemp -d)"
    cfg="${tmp}/.mcp.json"
    log="${tmp}/calls.log"
    stderr="${tmp}/stderr.txt"
    bundle="${tmp}/.webpack/main/index.js"
    seed_config "${cfg}"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    # Bundle first, then a source edit after it: the shell change that never made
    # it into the built bundle.
    mkdir -p "${tmp}/electron-app" "$(dirname "${bundle}")"
    touch "${bundle}"
    touch "${tmp}/electron-app/index.ts"

    PROVISION_CALL_LOG="${log}" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${WRAPPER}" \
        SMOKER_SHELL_BUNDLE="${bundle}" SMOKER_SHELL_SOURCES="${tmp}/electron-app" \
        SMOKER_SHELL_BUILD_CMD="printf 'shell-build\n' >> '${log}'; touch '${bundle}'" \
        PATH="${mock_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>"${stderr}"
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "provisioning should exit 0 after rebuilding a stale bundle" \
            "exit=${exit_code}
$(cat "${stderr}")"
        return
    fi
    if ! grep -q 'shell-build' "${log}"; then
        fail "a bundle older than its sources must be rebuilt" "log:
$(cat "${log}")"
        return
    fi
    if ! grep -qi "stale" "${stderr}"; then
        fail "the run must say the bundle was stale" "stderr:
$(cat "${stderr}")"
        return
    fi

    pass "rebuilds the shell bundle when sources are newer than it"
}

#-------------------------------------------------------------------------------
# Test 22: a bundle newer than every shell source is a no-op — no build, exit 0.
#          Rebuilding on every run would make each round pay for a full Forge
#          build it does not need (issue #390 AC 3, idempotency).
#-------------------------------------------------------------------------------
test_fresh_shell_bundle_is_noop() {
    echo "TEST: an up-to-date shell bundle is a no-op"

    local tmp mock_dir cfg log stderr bundle
    tmp="$(mktemp -d)"
    cfg="${tmp}/.mcp.json"
    log="${tmp}/calls.log"
    stderr="${tmp}/stderr.txt"
    bundle="${tmp}/.webpack/main/index.js"
    seed_config "${cfg}"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    mkdir -p "${tmp}/electron-app" "$(dirname "${bundle}")"
    touch "${tmp}/electron-app/index.ts"
    touch "${bundle}"

    PROVISION_CALL_LOG="${log}" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${WRAPPER}" \
        SMOKER_SHELL_BUNDLE="${bundle}" SMOKER_SHELL_SOURCES="${tmp}/electron-app" \
        SMOKER_SHELL_BUILD_CMD="printf 'shell-build\n' >> '${log}'" \
        PATH="${mock_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>"${stderr}"
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "provisioning should exit 0 when the bundle is up to date" \
            "exit=${exit_code}
$(cat "${stderr}")"
        return
    fi
    if grep -q 'shell-build' "${log}"; then
        fail "an up-to-date bundle must not be rebuilt" "log:
$(cat "${log}")"
        return
    fi
    if ! grep -q "shell bundle up to date" "${stderr}"; then
        fail "the run must report the bundle as up to date" "stderr:
$(cat "${stderr}")"
        return
    fi

    pass "an up-to-date shell bundle is a no-op"
}

#-------------------------------------------------------------------------------
# Test 23: a build that exits 0 but leaves no bundle must fail loudly, naming the
#          path — the same rule as the Electron binary: "provisioned" is what is
#          on disk, not what a command's exit code claims.
#-------------------------------------------------------------------------------
test_shell_build_without_bundle_fails_loudly() {
    echo "TEST: a build that produces no bundle fails loudly"

    local tmp mock_dir cfg stderr bundle
    tmp="$(mktemp -d)"
    cfg="${tmp}/.mcp.json"
    stderr="${tmp}/stderr.txt"
    bundle="${tmp}/.webpack/main/index.js"
    seed_config "${cfg}"
    mock_dir="$(make_mock_bin yes yes yes)"
    trap "rm -rf '${tmp}' '${mock_dir}'" RETURN

    mkdir -p "${tmp}/electron-app"
    touch "${tmp}/electron-app/index.ts"

    PROVISION_CALL_LOG="${tmp}/calls.log" MCP_CONFIG_FILE="${cfg}" \
        CHROME_MCP_WRAPPER="${WRAPPER}" \
        SMOKER_SHELL_BUNDLE="${bundle}" SMOKER_SHELL_SOURCES="${tmp}/electron-app" \
        SMOKER_SHELL_BUILD_CMD="true" \
        PATH="${mock_dir}:${PATH}" \
        bash "${PROVISION}" >/dev/null 2>"${stderr}"
    local exit_code=$?

    if [ "${exit_code}" -eq 0 ]; then
        fail "a build that leaves no bundle must exit non-zero" "got exit 0
$(cat "${stderr}")"
        return
    fi
    if ! grep -qF "${bundle}" "${stderr}"; then
        fail "the error must name where the bundle was expected" "stderr:
$(cat "${stderr}")"
        return
    fi

    pass "a build that produces no bundle fails loudly"
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
test_installs_smoker_deps_when_absent
test_smoker_deps_present_is_noop
test_install_without_binary_fails_loudly
test_links_launcher_electron_when_off_path
test_launcher_electron_shim_is_idempotent
test_unresolvable_electron_shim_fails
test_existing_path_electron_is_left_alone
test_correct_sandbox_is_left_enabled
test_unfixable_sandbox_is_disabled_in_shim
test_unstartable_electron_fails_the_run
test_shim_execs_so_launcher_pid_is_electron
test_builds_shell_bundle_when_absent
test_rebuilds_stale_shell_bundle
test_fresh_shell_bundle_is_noop
test_shell_build_without_bundle_fails_loudly

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
