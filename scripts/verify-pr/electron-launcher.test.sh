#!/usr/bin/env bash
# Tests for scripts/verify-pr/electron-launcher.sh
#
# Run: bash scripts/verify-pr/electron-launcher.test.sh
#
# Strategy: the launcher's system boundaries are (a) the Electron binary it
# spawns and (b) the CDP readiness probe it polls. Both are injected:
#   ELECTRON_BIN    a stub that records its argv + inherited env, then stays
#                   alive (exec sleep) so the launcher gets a real, killable PID.
#   CDP_PROBE_CMD   a shell command whose exit code the launcher treats as
#                   "CDP up (0) / not yet (non-zero)". We flip it per test.
# The rotating GNOME/XWayland X-authority file (resolved via the shared display
# lib) is simulated by pointing XDG_RUNTIME_DIR at a temp dir with a
# `.mutter-Xwaylandauth.XXXXXX` file inside, exactly like the Chrome wrapper
# tests. No real Electron, browser, or desktop session is required.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHER="${SCRIPT_DIR}/electron-launcher.sh"

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

if [ ! -f "${LAUNCHER}" ]; then
    echo "FATAL: ${LAUNCHER} not found"
    exit 2
fi

# A GNOME/XWayland session with a rotating X-authority file, in a temp runtime
# dir. Echoes the runtime dir so callers can pass it as XDG_RUNTIME_DIR.
make_session() {
    local runtime
    runtime="$(mktemp -d)"
    echo "fake-xauth" > "${runtime}/.mutter-Xwaylandauth.$(printf '%06d' $((RANDOM)))"
    echo "${runtime}"
}

# An Electron stub that records its argv and a few env vars to ${ELECTRON_LOG},
# then stays alive so the launcher captures a live, killable PID.
make_electron_stub() {
    local stub
    stub="$(mktemp)"
    cat > "${stub}" <<'EOF'
#!/usr/bin/env bash
{
    echo "argv: $*"
    echo "REACT_APP_CLOUD_URL_API=${REACT_APP_CLOUD_URL_API:-}"
    echo "REACT_APP_CLOUD_URL=${REACT_APP_CLOUD_URL:-}"
    echo "SMOKER_RENDERER_URL=${SMOKER_RENDERER_URL:-}"
    echo "DISPLAY=${DISPLAY:-}"
    echo "XAUTHORITY=${XAUTHORITY:-}"
} >> "${ELECTRON_LOG}"
# Record our own PID (== the PID the launcher tracks) so a test can assert the
# app was killed. After exec, this process *becomes* the sleep.
[ -n "${ELECTRON_PIDLOG:-}" ] && echo "$$" > "${ELECTRON_PIDLOG}"
exec sleep 300
EOF
    chmod +x "${stub}"
    echo "${stub}"
}

#-------------------------------------------------------------------------------
# Test 1: start refuses to run without the hermetic stack URLs. The Electron
#         binary is never spawned and the error names the missing variable
#         (behavior 1 / AC 1 — no hardcoded dev ports; URLs must be supplied).
#-------------------------------------------------------------------------------
test_start_requires_stack_urls() {
    echo "TEST: start refuses without hermetic stack URLs"

    local tmp runtime electron_log stderr
    tmp="$(mktemp -d)"
    runtime="$(make_session)"
    electron_log="${tmp}/electron.log"
    stderr="${tmp}/stderr.txt"
    : > "${electron_log}"
    trap "rm -rf '${tmp}' '${runtime}'" RETURN

    # No E2E_BACKEND_URL / E2E_SMOKER_URL exported.
    XDG_RUNTIME_DIR="${runtime}" DISPLAY=":0" \
        ELECTRON_BIN="/bin/true" ELECTRON_LOG="${electron_log}" \
        ELECTRON_LAUNCHER_PIDFILE="${tmp}/pid" \
        bash "${LAUNCHER}" start >/dev/null 2>"${stderr}"
    local exit_code=$?

    if [ "${exit_code}" -eq 0 ]; then
        fail "start must exit non-zero without stack URLs" "got exit 0"
        return
    fi
    if [ -s "${electron_log}" ]; then
        fail "Electron must NOT be spawned when stack URLs are missing" \
            "electron log:
$(cat "${electron_log}")"
        return
    fi
    if ! grep -qi "E2E_BACKEND_URL" "${stderr}"; then
        fail "error must name the missing stack URL variable" "stderr:
$(cat "${stderr}")"
        return
    fi

    pass "start refuses without hermetic stack URLs"
}

#-------------------------------------------------------------------------------
# Test 2: start wires the hermetic URLs into the Electron process environment
#         (no hardcoded dev ports), exposes the CDP endpoint on the fixed port,
#         and records the launched PID (behavior 1 / AC 1 + AC 2).
#-------------------------------------------------------------------------------
test_start_wires_urls_and_cdp_port() {
    echo "TEST: start passes hermetic URLs + CDP port and records a PID"

    local tmp runtime electron_log stub pidfile backend smoker
    tmp="$(mktemp -d)"
    runtime="$(make_session)"
    electron_log="${tmp}/electron.log"
    pidfile="${tmp}/pid"
    stub="$(make_electron_stub)"
    backend="http://localhost:20331"
    smoker="http://localhost:20333"
    : > "${electron_log}"
    trap "rm -rf '${tmp}' '${runtime}' '${stub}'; [ -f '${pidfile}' ] && kill \$(cat '${pidfile}') 2>/dev/null; true" RETURN

    XDG_RUNTIME_DIR="${runtime}" DISPLAY=":0" \
        E2E_BACKEND_URL="${backend}" E2E_SMOKER_URL="${smoker}" \
        ELECTRON_BIN="${stub}" ELECTRON_LOG="${electron_log}" \
        CDP_PORT="9333" CDP_PROBE_CMD="true" \
        CDP_WAIT_RETRIES="3" CDP_WAIT_INTERVAL="0" \
        ELECTRON_LAUNCHER_PIDFILE="${pidfile}" \
        bash "${LAUNCHER}" start >/dev/null 2>&1
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "start should exit 0 when CDP answers" "exit=${exit_code}"
        return
    fi
    if ! grep -qF "REACT_APP_CLOUD_URL_API=${backend}" "${electron_log}"; then
        fail "backend URL must be wired into the app env (REACT_APP_CLOUD_URL_API)" \
            "electron log:
$(cat "${electron_log}")"
        return
    fi
    if ! grep -qF "SMOKER_RENDERER_URL=${smoker}" "${electron_log}"; then
        fail "smoker web URL must be wired into the app env (SMOKER_RENDERER_URL)" \
            "electron log:
$(cat "${electron_log}")"
        return
    fi
    if ! grep -qF -- "--remote-debugging-port=9333" "${electron_log}"; then
        fail "Electron must be launched with the fixed CDP --remote-debugging-port" \
            "electron log:
$(cat "${electron_log}")"
        return
    fi
    if ! grep -qF "XAUTHORITY=${runtime}/.mutter-Xwaylandauth." "${electron_log}"; then
        fail "app must inherit the resolved box-display XAUTHORITY" \
            "electron log:
$(cat "${electron_log}")"
        return
    fi
    if [ ! -f "${pidfile}" ] || ! kill -0 "$(cat "${pidfile}")" 2>/dev/null; then
        fail "start must record a PID file naming the live app process" \
            "pidfile='${pidfile}' contents='$(cat "${pidfile}" 2>/dev/null)'"
        return
    fi

    pass "start passes hermetic URLs + CDP port and records a PID"
}

#-------------------------------------------------------------------------------
# Test 3: when the CDP endpoint never answers, start times out with a non-zero
#         exit + reason, kills the launched app, and removes the PID file so a
#         failed start leaves no orphan process or stale file (behavior 2 / AC 2).
#-------------------------------------------------------------------------------
test_start_times_out_when_cdp_never_up() {
    echo "TEST: start times out (non-zero + reason) and cleans up when CDP never answers"

    local tmp runtime electron_log stub pidfile pidlog stderr app_pid
    tmp="$(mktemp -d)"
    runtime="$(make_session)"
    electron_log="${tmp}/electron.log"
    pidfile="${tmp}/pid"
    pidlog="${tmp}/app.pid"
    stderr="${tmp}/stderr.txt"
    stub="$(make_electron_stub)"
    : > "${electron_log}"
    trap "rm -rf '${tmp}' '${runtime}' '${stub}'; [ -f '${pidlog}' ] && kill \$(cat '${pidlog}') 2>/dev/null; true" RETURN

    XDG_RUNTIME_DIR="${runtime}" DISPLAY=":0" \
        E2E_BACKEND_URL="http://localhost:20331" E2E_SMOKER_URL="http://localhost:20333" \
        ELECTRON_BIN="${stub}" ELECTRON_LOG="${electron_log}" ELECTRON_PIDLOG="${pidlog}" \
        CDP_PORT="9444" CDP_PROBE_CMD="false" \
        CDP_WAIT_RETRIES="3" CDP_WAIT_INTERVAL="0" \
        ELECTRON_LAUNCHER_PIDFILE="${pidfile}" \
        bash "${LAUNCHER}" start >/dev/null 2>"${stderr}"
    local exit_code=$?

    if [ "${exit_code}" -eq 0 ]; then
        fail "start must exit non-zero when CDP never answers" "got exit 0"
        return
    fi
    if ! grep -qi "CDP" "${stderr}"; then
        fail "timeout error must name the CDP endpoint as the failed precondition" \
            "stderr:
$(cat "${stderr}")"
        return
    fi
    if [ -f "${pidfile}" ]; then
        fail "a timed-out start must remove the PID file (no stale file)" \
            "pidfile still present: $(cat "${pidfile}")"
        return
    fi
    # The launched app must have been killed (no orphan).
    app_pid="$(cat "${pidlog}" 2>/dev/null)"
    if [ -n "${app_pid}" ] && kill -0 "${app_pid}" 2>/dev/null; then
        fail "a timed-out start must kill the launched app (no orphan process)" \
            "app PID ${app_pid} still alive"
        return
    fi

    pass "start times out (non-zero + reason) and cleans up when CDP never answers"
}

#-------------------------------------------------------------------------------
# Test 4: stop kills the running app via the PID file and removes the file
#         (behavior 3 / AC 3).
#-------------------------------------------------------------------------------
test_stop_kills_and_clears() {
    echo "TEST: stop kills the app and removes the PID file"

    local tmp pidfile app_pid
    tmp="$(mktemp -d)"
    pidfile="${tmp}/pid"
    trap "rm -rf '${tmp}'" RETURN

    # A live process stands in for the app; record its PID in the PID file.
    sleep 300 &
    app_pid=$!
    echo "${app_pid}" > "${pidfile}"

    ELECTRON_LAUNCHER_PIDFILE="${pidfile}" bash "${LAUNCHER}" stop >/dev/null 2>&1
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "stop should exit 0" "exit=${exit_code}"
        kill "${app_pid}" 2>/dev/null || true
        return
    fi
    # Give the signal a moment to land.
    for _ in 1 2 3 4 5; do kill -0 "${app_pid}" 2>/dev/null || break; sleep 0.1; done
    if kill -0 "${app_pid}" 2>/dev/null; then
        fail "stop must kill the app process named by the PID file" "PID ${app_pid} still alive"
        kill "${app_pid}" 2>/dev/null || true
        return
    fi
    if [ -f "${pidfile}" ]; then
        fail "stop must remove the PID file" "still present: $(cat "${pidfile}")"
        return
    fi

    pass "stop kills the app and removes the PID file"
}

#-------------------------------------------------------------------------------
# Test 5: stop is idempotent — a second stop (no PID file) is a no-op with exit
#         0, and does not error (behavior 3 / AC 3).
#-------------------------------------------------------------------------------
test_stop_is_idempotent() {
    echo "TEST: a second stop is a no-op (idempotent)"

    local tmp pidfile stderr
    tmp="$(mktemp -d)"
    pidfile="${tmp}/pid" # never created
    stderr="${tmp}/stderr.txt"
    trap "rm -rf '${tmp}'" RETURN

    ELECTRON_LAUNCHER_PIDFILE="${pidfile}" bash "${LAUNCHER}" stop >/dev/null 2>"${stderr}"
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "stop with no PID file must exit 0 (idempotent)" \
            "exit=${exit_code}; stderr:
$(cat "${stderr}")"
        return
    fi

    pass "a second stop is a no-op (idempotent)"
}

#-------------------------------------------------------------------------------
# Test 6: a stale PID file (its process already gone) is cleaned without error
#         (behavior 3 / AC 3 — "stale PID files are handled").
#-------------------------------------------------------------------------------
test_stop_handles_stale_pidfile() {
    echo "TEST: stale PID file is cleaned without error"

    local tmp pidfile dead_pid
    tmp="$(mktemp -d)"
    pidfile="${tmp}/pid"
    trap "rm -rf '${tmp}'" RETURN

    # Spawn then reap a process so its PID is guaranteed dead, then write it.
    sleep 0 &
    dead_pid=$!
    wait "${dead_pid}" 2>/dev/null
    echo "${dead_pid}" > "${pidfile}"

    ELECTRON_LAUNCHER_PIDFILE="${pidfile}" bash "${LAUNCHER}" stop >/dev/null 2>&1
    local exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "stale PID file must be handled with exit 0" "exit=${exit_code}"
        return
    fi
    if [ -f "${pidfile}" ]; then
        fail "stale PID file must be removed" "still present: $(cat "${pidfile}")"
        return
    fi

    pass "stale PID file is cleaned without error"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "electron-launcher.sh tests"
echo "=========================================="

test_start_requires_stack_urls
test_start_wires_urls_and_cdp_port
test_start_times_out_when_cdp_never_up
test_stop_kills_and_clears
test_stop_is_idempotent
test_stop_handles_stale_pidfile

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
