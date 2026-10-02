#!/usr/bin/env bash
# Tests for scripts/verify/ (the Environment provider, the smoker launcher,
# the shell-bundle step) and .auto-agent/host-extension.
#
# Run: bash scripts/verify/verify.test.sh
#
# Strategy: each script is driven through its public command line with its
# documented seams pointed at recording stubs, so no test needs docker, a
# display, Electron, a tailnet or a workspace install. What is asserted is the
# auto-agent harness's Environment provider contract (stdout is the KEY=value
# block and nothing else, the exit codes, an idempotent `down`, the `smoke:`
# verdict line) and each script's own verify-then-act behaviour.
#
# With AUTO_AGENT_ROOT pointing at a checkout of the harness, the suite also
# runs the harness's own Provider check against the provider and a stub stack.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PROVIDER="${SCRIPT_DIR}/provider"
LAUNCHER="${SCRIPT_DIR}/smoker-launcher"
BUNDLE="${SCRIPT_DIR}/shell-bundle.sh"
EXTENSION="${REPO_ROOT}/.auto-agent/host-extension"

TESTS_RUN=0
TESTS_FAILED=0
FAILED_NAMES=()

pass() { TESTS_RUN=$((TESTS_RUN + 1)); echo "  PASS: $1"; }
fail() {
    TESTS_RUN=$((TESTS_RUN + 1)); TESTS_FAILED=$((TESTS_FAILED + 1)); FAILED_NAMES+=("$1")
    echo "  FAIL: $1"; [ -n "${2:-}" ] && printf '    %s\n' "$2"
}
check() { if eval "$2"; then pass "$1"; else fail "$1" "${3:-}"; fi; }

W="$(mktemp -d)"
trap 'rm -rf "${W}"' EXIT

# run <cmd...> : stdout in ${W}/out, stderr in ${W}/err, exit code in RC
run() { "$@" > "${W}/out" 2> "${W}/err"; RC=$?; }

# A stub stack-runner: records its arguments, prints progress on stderr and
# the block on stdout, and fails `up` while ${W}/stack-fails exists.
cat > "${W}/stack" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${W}/stack.calls"
echo "[stack-runner] progress" >&2
if [ "\$1" = up ]; then
    [ -e "${W}/stack-fails" ] && exit 1
    [ -e "${W}/stack-silent" ] && exit 0
    echo "E2E_FRONTEND_URL=http://localhost:23280"
    echo "E2E_BACKEND_URL=http://localhost:23281"
    echo "E2E_DEVICE_URL=http://localhost:23282"
    echo "E2E_SMOKER_URL=http://localhost:23283"
    echo "E2E_MONGO_URL=mongodb://localhost:23284/smartsmoker"
    echo "STACK_PROJECT_NAME=smoker-pr-\$3"
fi
[ "\$1" = down ] && [ -e "${W}/down-fails" ] && exit 1
exit 0
EOF
chmod +x "${W}/stack"

provider() {
    run env PROVIDER_SKIP_PREREQS=1 PROVIDER_STACK_CMD="${W}/stack" \
        PROVIDER_BUNDLE_CMD="${PROVIDER_BUNDLE_CMD:-true}" "${PROVIDER}" "$@"
}

test_provider_up() {
    echo "TEST: provider up prints the stack's block, and only the block, on stdout"
    : > "${W}/stack.calls"
    provider up --pr 328
    check "exit 0" '[ "${RC}" -eq 0 ]' "rc=${RC} $(cat "${W}/err")"
    check "stdout is six KEY=value lines and nothing else" \
        '[ "$(wc -l < "${W}/out")" -eq 6 ] && ! grep -vEq "^[A-Z][A-Z0-9_]*=" "${W}/out"' "$(cat "${W}/out")"
    check "every Surface's url_key in .auto-agent/harness.json is in the block" \
        'for k in $(jq -r ".surfaces[].url_key" "${REPO_ROOT}/.auto-agent/harness.json"); do grep -q "^${k}=" "${W}/out" || exit 1; done'
    check "the runner's progress went to stderr" 'grep -q "stack-runner. progress" "${W}/err"'
    check "the runner was asked for this PR" 'grep -qx "up --pr 328" "${W}/stack.calls"' "$(cat "${W}/stack.calls")"
    provider up --pr=41
    check "--pr=N works too" '[ "${RC}" -eq 0 ] && grep -qx "up --pr 41" "${W}/stack.calls"'

    : > "${W}/stack.calls"
    provider up --pr 0
    check "PR 0 (the Provider check's default) is mapped to a slot the runner accepts" \
        '[ "${RC}" -eq 0 ] && grep -qx "up --pr 999000" "${W}/stack.calls" && grep -qx "STACK_PROJECT_NAME=smoker-pr-999000" "${W}/out"' "$(cat "${W}/stack.calls")"

    provider up
    check "no --pr is a usage error: exit 2" '[ "${RC}" -eq 2 ]' "rc=${RC}"
    provider up --pr abc
    check "a non-numeric --pr is a usage error: exit 2" '[ "${RC}" -eq 2 ]' "rc=${RC}"
    provider frobnicate
    check "an unknown subcommand is a usage error: exit 2" '[ "${RC}" -eq 2 ]' "rc=${RC}"
}

test_provider_up_failures() {
    echo "TEST: provider up maps its failures onto the contract's exit codes"
    touch "${W}/stack-fails"
    provider up --pr 7
    check "a stack that does not boot is exit 4, with an empty stdout" '[ "${RC}" -eq 4 ] && [ ! -s "${W}/out" ]' "rc=${RC} $(cat "${W}/out")"
    rm -f "${W}/stack-fails"

    touch "${W}/stack-silent"; : > "${W}/stack.calls"
    provider up --pr 7
    check "a boot that prints no block is exit 4, and is torn down" \
        '[ "${RC}" -eq 4 ] && grep -qx "down --pr 7" "${W}/stack.calls"' "rc=${RC} $(cat "${W}/stack.calls")"
    rm -f "${W}/stack-silent"

    : > "${W}/stack.calls"
    PROVIDER_BUNDLE_CMD="exit 3" provider up --pr 7
    check "a missing prerequisite for the shell bundle is exit 3, and nothing is booted" \
        '[ "${RC}" -eq 3 ] && [ ! -s "${W}/stack.calls" ]' "rc=${RC} $(cat "${W}/stack.calls")"
    PROVIDER_BUNDLE_CMD="exit 1" provider up --pr 7
    check "a shell bundle that does not build is exit 4, and nothing is booted" \
        '[ "${RC}" -eq 4 ] && [ ! -s "${W}/stack.calls" ]' "rc=${RC}"

    # The real prerequisite check, on a PATH with no docker and no node.
    mkdir -p "${W}/emptybin"
    for c in bash sed grep dirname; do ln -sf "$(command -v "${c}")" "${W}/emptybin/${c}"; done
    run env PATH="${W}/emptybin" PROVIDER_STACK_CMD="${W}/stack" PROVIDER_BUNDLE_CMD=true "${PROVIDER}" up --pr 7
    check "no docker and no node is exit 3, naming them, with nothing booted" \
        '[ "${RC}" -eq 3 ] && grep -q -- "- docker" "${W}/err" && grep -q -- "- node" "${W}/err" && [ ! -s "${W}/out" ]' "rc=${RC} $(cat "${W}/err")"
}

test_provider_down() {
    echo "TEST: provider down is idempotent and always exits 0"
    : > "${W}/stack.calls"
    provider down --pr 328
    check "exit 0, the runner torn down for this PR, stdout empty" \
        '[ "${RC}" -eq 0 ] && grep -qx "down --pr 328" "${W}/stack.calls" && [ ! -s "${W}/out" ]' "rc=${RC}"
    touch "${W}/down-fails"
    provider down --pr 328
    check "a runner that reports a failure still exits 0, and says so" '[ "${RC}" -eq 0 ] && grep -q "WARN" "${W}/err"' "rc=${RC}"
    rm -f "${W}/down-fails"
    provider down --pr 0
    check "PR 0 tears down the Provider check's slot" '[ "${RC}" -eq 0 ] && grep -qx "down --pr 999000" "${W}/stack.calls"'
    provider down
    check "no --pr is a usage error: exit 2" '[ "${RC}" -eq 2 ]' "rc=${RC}"
}

smoke() {
    run env PROVIDER_SKIP_PREREQS=1 PROVIDER_SMOKE_CMD="${W}/smoke" SMOKE_ARTIFACT_DIR="${W}/artifacts" \
        E2E_FRONTEND_URL="${FRONT-http://localhost:23280}" E2E_BACKEND_URL=http://localhost:23281 \
        E2E_DEVICE_URL=http://localhost:23282 "${PROVIDER}" smoke
}

test_provider_smoke() {
    echo "TEST: provider smoke ends on the contract's verdict line"
    cat > "${W}/smoke" <<EOF
#!/usr/bin/env bash
echo "\$*" > "${W}/smoke.args"
echo "smoke: starting"
printf '\033[32msmoke: PASS\033[0m (5/5)\n'
EOF
    chmod +x "${W}/smoke"
    smoke
    check "a passing smoke exits 0" '[ "${RC}" -eq 0 ]' "rc=${RC} $(cat "${W}/err")"
    check "its last stdout line is the plain verdict" '[ "$(tail -1 "${W}/out")" = "smoke: PASS (5/5)" ]' "$(cat "${W}/out")"
    check "the block's URLs reached the runner, the device probe included" \
        'grep -q -- "--frontend http://localhost:23280 --backend http://localhost:23281" "${W}/smoke.args" && grep -q -- "--device http://localhost:23282" "${W}/smoke.args"' "$(cat "${W}/smoke.args")"

    printf '#!/usr/bin/env bash\necho "smoke: results"\necho "smoke: FAIL (2/5 failed)"\nexit 1\n' > "${W}/smoke"
    smoke
    check "a failing smoke exits 1 on its FAIL line" '[ "${RC}" -eq 1 ] && [ "$(tail -1 "${W}/out")" = "smoke: FAIL (2/5 failed)" ]' "rc=${RC} $(cat "${W}/out")"

    printf '#!/usr/bin/env bash\necho "smoke: unexpected error" >&2\nexit 2\n' > "${W}/smoke"
    smoke
    check "a runner that could not run is exit 2" '[ "${RC}" -eq 2 ]' "rc=${RC}"
    printf '#!/usr/bin/env bash\nexit 0\n' > "${W}/smoke"
    smoke
    check "an exit 0 with no verdict line is exit 2, never a silent pass" '[ "${RC}" -eq 2 ]' "rc=${RC}"
    FRONT='' smoke
    check "smoke without the block in its environment is exit 2" '[ "${RC}" -eq 2 ]' "rc=${RC}"
}

status() {
    run env PROVIDER_RESOLVE_CMD="${W}/resolve" PROVIDER_PROBE_CMD="${W}/probe" "${PROVIDER}" status
}

test_provider_status() {
    echo "TEST: provider status prints the deployed block, read-only"
    printf '#!/usr/bin/env bash\necho "$1.tailnet.example"\n' > "${W}/resolve"
    printf '#!/usr/bin/env bash\necho "$1" >> "%s/probe.calls"\n[ ! -e "%s/probe-fails" ]\n' "${W}" "${W}" > "${W}/probe"
    chmod +x "${W}/resolve" "${W}/probe"
    : > "${W}/probe.calls"
    status
    check "exit 0 when every service answers" '[ "${RC}" -eq 0 ]' "rc=${RC} $(cat "${W}/err")"
    check "stdout is the four Surface keys and nothing else" \
        '[ "$(wc -l < "${W}/out")" -eq 4 ] && for k in $(jq -r ".surfaces[].url_key" "${REPO_ROOT}/.auto-agent/harness.json"); do grep -q "^${k}=" "${W}/out" || exit 1; done' "$(cat "${W}/out")"
    check "the cloud is its Serve endpoints, the device its own ports" \
        'grep -qx "E2E_BACKEND_URL=https://smart-smoker-dev-cloud.tailnet.example:8443" "${W}/out" && grep -qx "E2E_DEVICE_URL=http://virtual-smoker:3003" "${W}/out"' "$(cat "${W}/out")"
    check "all four services were probed" '[ "$(wc -l < "${W}/probe.calls")" -eq 4 ]' "$(cat "${W}/probe.calls")"
    touch "${W}/probe-fails"
    status
    check "an unhealthy environment is exit 1 with no block" '[ "${RC}" -eq 1 ] && [ ! -s "${W}/out" ]' "rc=${RC}"
    rm -f "${W}/probe-fails"
    printf '#!/usr/bin/env bash\nexit 1\n' > "${W}/resolve"
    status
    check "a peer that does not resolve is exit 3 (prerequisite)" '[ "${RC}" -eq 3 ]' "rc=${RC}"
}

test_provider_check() {
    echo "TEST: the harness's own Provider check passes against the provider"
    if [ -z "${AUTO_AGENT_ROOT:-}" ] || [ ! -x "${AUTO_AGENT_ROOT}/bin/auto-agent" ]; then
        echo "  SKIP: AUTO_AGENT_ROOT does not name a checkout of the auto-agent harness"; return
    fi
    printf '#!/usr/bin/env bash\necho "smoke: PASS (5/5)"\n' > "${W}/smoke"; chmod +x "${W}/smoke"
    # The check resolves the Harness config, which asks gh for the default
    # branch and nothing else: answer it here so the suite needs no network.
    printf '#!/usr/bin/env bash\necho master\n' > "${W}/gh"; chmod +x "${W}/gh"
    run env -u HARNESS_CONFIG_JSON PROVIDER_SKIP_PREREQS=1 PROVIDER_STACK_CMD="${W}/stack" PROVIDER_BUNDLE_CMD=true \
        PROVIDER_SMOKE_CMD="${W}/smoke" GH_BIN="${W}/gh" "${AUTO_AGENT_ROOT}/bin/auto-agent" provider-check "${REPO_ROOT}"
    check "provider-check: PASS (6 checks)" '[ "${RC}" -eq 0 ] && grep -q "^provider-check: PASS — scripts/verify/provider conforms (6 checks" "${W}/out"' "rc=${RC} $(tail -3 "${W}/out") $(tail -3 "${W}/err")"
}

test_launcher() {
    echo "TEST: the smoker launcher maps the block into the shell and execs Electron"
    cat > "${W}/electron" <<EOF
#!/usr/bin/env bash
echo "pid=\$\$ args=\$*" > "${W}/electron.call"
echo "cloud=\${REACT_APP_CLOUD_URL} api=\${REACT_APP_CLOUD_URL_API} renderer=\${SMOKER_RENDERER_URL}" >> "${W}/electron.call"
EOF
    chmod +x "${W}/electron"
    mkdir -p "${W}/app/.webpack/main"; : > "${W}/app/.webpack/main/index.js"
    launcher() { run env SMOKER_ELECTRON_BIN="${W}/electron" SMOKER_APP_DIR="${W}/app" "$@" "${LAUNCHER}" --remote-debugging-port=9222; }

    launcher E2E_BACKEND_URL=http://localhost:23281 E2E_SMOKER_URL=http://localhost:23283
    check "exit 0" '[ "${RC}" -eq 0 ]' "rc=${RC} $(cat "${W}/err")"
    check "Electron ran the app dir with the harness's debugging port" \
        'grep -q "args=${W}/app --remote-debugging-port=9222" "${W}/electron.call"' "$(cat "${W}/electron.call")"
    check "the stack URLs are mapped into the shell's environment" \
        'grep -qx "cloud=http://localhost:23281 api=http://localhost:23281 renderer=http://localhost:23283" "${W}/electron.call"' "$(cat "${W}/electron.call")"

    # exec, not a child: the PID the harness records must be Electron's.
    env SMOKER_ELECTRON_BIN="${W}/electron" SMOKER_APP_DIR="${W}/app" E2E_BACKEND_URL=b E2E_SMOKER_URL=s \
        "${LAUNCHER}" --remote-debugging-port=9222 > /dev/null 2>&1 &
    local pid=$!; wait "${pid}"
    check "the launcher execs Electron (same PID)" 'grep -q "^pid=${pid} " "${W}/electron.call"' "launcher pid ${pid}: $(head -1 "${W}/electron.call")"

    rm -f "${W}/electron.call"
    launcher E2E_SMOKER_URL=http://localhost:23283
    check "no backend URL is exit 4 and nothing is launched" '[ "${RC}" -eq 4 ] && [ ! -e "${W}/electron.call" ]' "rc=${RC}"
    launcher E2E_BACKEND_URL=http://localhost:23281
    check "no smoker URL is exit 4 and nothing is launched" '[ "${RC}" -eq 4 ] && [ ! -e "${W}/electron.call" ]' "rc=${RC}"
    rm -f "${W}/app/.webpack/main/index.js"
    launcher E2E_BACKEND_URL=b E2E_SMOKER_URL=s
    check "an unbuilt shell is exit 4, naming the fix" '[ "${RC}" -eq 4 ] && grep -q "shell-bundle.sh ensure" "${W}/err"' "rc=${RC} $(cat "${W}/err")"
    run env SMOKER_ELECTRON_BIN="${W}/no-such-electron" SMOKER_APP_DIR="${W}/app" E2E_BACKEND_URL=b E2E_SMOKER_URL=s "${LAUNCHER}"
    check "no Electron binary is exit 4" '[ "${RC}" -eq 4 ]' "rc=${RC}"
}

test_shell_bundle() {
    echo "TEST: the shell bundle is rebuilt when absent or stale, and only then"
    local app="${W}/shell"; mkdir -p "${app}/electron-app" "${app}/src"
    echo "main" > "${app}/electron-app/index.ts"
    : > "${W}/forge"
    bundle() {
        run env SMOKER_APP_DIR="${app}" SMOKER_SHELL_FORGE_BIN="${FORGE-${W}/forge}" \
            SMOKER_SHELL_BUILD_CMD="${BUILD-echo built >> '${W}/build.calls'; mkdir -p .webpack/main && : > .webpack/main/index.js}" \
            "${BUNDLE}" "$@"
    }
    : > "${W}/build.calls"
    bundle status
    check "an unbuilt checkout is absent" '[ "$(cat "${W}/out")" = absent ]' "$(cat "${W}/out")"
    bundle ensure
    check "ensure builds it: exit 0, bundle on disk, stdout empty" '[ "${RC}" -eq 0 ] && [ -f "${app}/.webpack/main/index.js" ] && [ ! -s "${W}/out" ]' "rc=${RC} $(cat "${W}/err")"
    bundle ensure
    check "a second ensure changes nothing" '[ "${RC}" -eq 0 ] && [ "$(wc -l < "${W}/build.calls")" -eq 1 ]' "$(cat "${W}/build.calls")"
    bundle status
    check "and reports fresh" '[ "$(cat "${W}/out")" = fresh ]' "$(cat "${W}/out")"
    touch -d '+1 minute' "${app}/electron-app/index.ts"
    bundle status
    check "a shell source newer than the bundle is stale" '[ "$(cat "${W}/out")" = stale ]' "$(cat "${W}/out")"
    bundle ensure
    check "ensure rebuilds a stale bundle" '[ "${RC}" -eq 0 ] && [ "$(wc -l < "${W}/build.calls")" -eq 2 ]' "$(cat "${W}/build.calls")"
    touch -d '+2 minutes' "${app}/electron-app/index.ts"
    BUILD="exit 1" bundle ensure
    check "a failing build is exit 1" '[ "${RC}" -eq 1 ]' "rc=${RC}"
    rm -rf "${app}/.webpack"
    BUILD="true" bundle ensure
    check "a build that leaves no bundle is exit 1" '[ "${RC}" -eq 1 ]' "rc=${RC}"
    FORGE="${W}/no-such-forge" bundle ensure
    check "a workspace that is not installed is exit 3 (prerequisite)" '[ "${RC}" -eq 3 ]' "rc=${RC}"
    bundle frobnicate
    check "an unknown subcommand is a usage error: exit 2" '[ "${RC}" -eq 2 ]' "rc=${RC}"
}

test_host_extension() {
    echo "TEST: the Host extension is verify-then-act and idempotent"
    local root="${W}/host"; mkdir -p "${root}/scripts/verify" "${root}/scripts/stack-runner" "${root}/scripts/smoke"
    ext() {
        run env HOST_EXT_ROOT="${root}" \
            HOST_EXT_INSTALL_CMD="echo install >> '${W}/ext.calls'; mkdir -p node_modules/electron/dist node_modules/.bin && printf '#!/bin/sh\n' > node_modules/electron/dist/electron && chmod +x node_modules/electron/dist/electron && : > node_modules/.bin/electron-forge" \
            HOST_EXT_RUNNER_CMD="echo runner >> '${W}/ext.calls'; mkdir -p scripts/stack-runner/node_modules" \
            HOST_EXT_SMOKE_CMD="echo smoke >> '${W}/ext.calls'; mkdir -p scripts/smoke/node_modules" \
            HOST_EXT_CHROMIUM_PROBE="test -e '${W}/chromium'" \
            HOST_EXT_CHROMIUM_CMD="echo chromium >> '${W}/ext.calls'; : > '${W}/chromium'" \
            HOST_EXT_BUNDLE_CMD="${EXT_BUNDLE-echo bundle >> '${W}/ext.calls'}" \
            "${EXTENSION}" "$@"
    }
    : > "${W}/ext.calls"
    ext setup
    check "a bare Host: exit 0" '[ "${RC}" -eq 0 ]' "rc=${RC} $(cat "${W}/err")"
    check "every step ran once, in order" '[ "$(tr "\n" " " < "${W}/ext.calls")" = "install runner smoke chromium bundle " ]' "$(tr '\n' ' ' < "${W}/ext.calls")"
    : > "${W}/ext.calls"
    ext upgrade
    check "a second run installs nothing (the bundle step decides for itself)" \
        '[ "${RC}" -eq 0 ] && [ "$(tr "\n" " " < "${W}/ext.calls")" = "bundle " ]' "$(tr '\n' ' ' < "${W}/ext.calls")"
    EXT_BUNDLE="exit 1" ext setup
    check "a failing step is a non-zero exit, so Setup stops before the Daemon starts" '[ "${RC}" -ne 0 ]' "rc=${RC}"
    ext frobnicate
    check "an unknown mode is refused" '[ "${RC}" -ne 0 ]' "rc=${RC}"
}

test_declarations() {
    echo "TEST: .auto-agent/ names files that exist and are executable"
    local cfg="${REPO_ROOT}/.auto-agent/harness.json" f
    check "harness.json is JSON" 'jq -e . "${cfg}" >/dev/null'
    for f in "$(jq -r .verification.hermetic.command "${cfg}")" "$(jq -r .verification.deployed.command "${cfg}")" \
             "$(jq -r .surfaces.smoker.launcher "${cfg}")" .auto-agent/host-extension; do
        check "${f} is executable" '[ -x "${REPO_ROOT}/${f}" ]'
    done
    check "the Bot-PR checklist's boxes each fit on one line under the heading the harness reads" \
        '[ "$(sed -n "/^## Manual verification/,/^<!-- \/bot-pr-checklist -->/p" "${REPO_ROOT}/.auto-agent/bot-pr-checklist.md" | grep -c "^- \[ \] ")" -eq 6 ]'
}

test_provider_up
test_provider_up_failures
test_provider_down
test_provider_smoke
test_provider_status
test_provider_check
test_launcher
test_shell_bundle
test_host_extension
test_declarations

echo
echo "verify.test.sh: ${TESTS_RUN} run, ${TESTS_FAILED} failed"
if [ "${TESTS_FAILED}" -gt 0 ]; then
    printf '  - %s\n' "${FAILED_NAMES[@]}"
    exit 1
fi
