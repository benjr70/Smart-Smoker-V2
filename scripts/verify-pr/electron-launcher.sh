#!/usr/bin/env bash
# electron-launcher.sh — start/stop the real smoker Electron app on the box
# display, wired to a hermetic per-PR stack, with a Chrome DevTools Protocol
# (CDP) endpoint the /verify-pr harness drives through Playwright MCP.
#
# The smoker app itself is unchanged — this launcher only supplies launch flags
# and environment:
#   - The hermetic stack URLs (from the stack-runner's `KEY=value` output) are
#     passed into the app's environment; no dev ports are hardcoded.
#   - `--remote-debugging-port=<CDP_PORT>` exposes a CDP endpoint on a fixed,
#     known port so the MCP wrapper can attach at a stable address.
#   - The GNOME/XWayland display env is resolved at launch via the shared
#     display lib (same resolution the Chrome wrapper uses).
#
# `start` blocks until the CDP endpoint answers (bounded wait; non-zero exit +
# reason on timeout) and records a PID file. `stop` kills the app via the PID
# file, cleans the file, and is idempotent — a second stop, or a stale PID file
# whose process is already gone, is a no-op with exit 0.
#
# Usage:
#   E2E_BACKEND_URL=... E2E_SMOKER_URL=... electron-launcher.sh start
#   electron-launcher.sh stop
#
# Inputs (from the stack-runner output block):
#   E2E_BACKEND_URL   REQUIRED — mapped to REACT_APP_CLOUD_URL[_API].
#   E2E_SMOKER_URL    REQUIRED — the smoker web URL the shell loads
#                     (exported as SMOKER_RENDERER_URL).
#
# Overrides (production defaults; ELECTRON_BIN / CDP_PROBE_CMD are the injection
# points the unit tests use to run without a real Electron or CDP endpoint):
#   ELECTRON_BIN               Electron binary            (default: electron)
#   SMOKER_APP_DIR             app dir passed to Electron (default: apps/smoker)
#   CDP_PORT                   fixed remote-debugging port (default: 9222)
#   CDP_PROBE_CMD              readiness probe; exit 0 == CDP up
#                              (default: curl -sf http://127.0.0.1:<port>/json/version)
#   CDP_WAIT_RETRIES           bounded readiness attempts  (default: 60)
#   CDP_WAIT_INTERVAL          seconds between attempts    (default: 1)
#   ELECTRON_LAUNCHER_PIDFILE  PID file path
#                              (default: ${XDG_RUNTIME_DIR:-/tmp}/verify-pr-electron.pid)
#
# Exit codes:
#   0  start ready (CDP answered) / stop complete (idempotent)
#   2  usage error (unknown subcommand)
#   3  no active desktop session (display env could not be resolved)
#   4  missing required stack URL
#   5  CDP endpoint did not come up within the bounded wait

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=lib/resolve-display-env.sh
source "${SCRIPT_DIR}/lib/resolve-display-env.sh"

CDP_PORT="${CDP_PORT:-9222}"
ELECTRON_BIN="${ELECTRON_BIN:-electron}"
SMOKER_APP_DIR="${SMOKER_APP_DIR:-${REPO_ROOT}/apps/smoker}"
CDP_PROBE_CMD="${CDP_PROBE_CMD:-curl -sf http://127.0.0.1:${CDP_PORT}/json/version}"
CDP_WAIT_RETRIES="${CDP_WAIT_RETRIES:-60}"
CDP_WAIT_INTERVAL="${CDP_WAIT_INTERVAL:-1}"
ELECTRON_LAUNCHER_PIDFILE="${ELECTRON_LAUNCHER_PIDFILE:-${XDG_RUNTIME_DIR:-/tmp}/verify-pr-electron.pid}"

log() { echo "[electron-launcher] $*" >&2; }

# True when a PID names a live process.
pid_alive() {
    local pid="$1"
    [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null
}

# Poll CDP_PROBE_CMD up to CDP_WAIT_RETRIES times; 0 once it answers, else 1.
wait_for_cdp() {
    local attempt=0
    while [ "${attempt}" -lt "${CDP_WAIT_RETRIES}" ]; do
        if bash -c "${CDP_PROBE_CMD}" >/dev/null 2>&1; then
            return 0
        fi
        attempt=$((attempt + 1))
        sleep "${CDP_WAIT_INTERVAL}"
    done
    return 1
}

cmd_start() {
    # 1. Refuse to start without the hermetic stack URLs — never fall back to a
    #    hardcoded dev port.
    if [ -z "${E2E_BACKEND_URL:-}" ]; then
        log "ERROR: E2E_BACKEND_URL is required (the hermetic backend URL from the stack-runner)."
        return 4
    fi
    if [ -z "${E2E_SMOKER_URL:-}" ]; then
        log "ERROR: E2E_SMOKER_URL is required (the hermetic smoker web URL from the stack-runner)."
        return 4
    fi

    # 2. Resolve the box display (shared with the Chrome wrapper). No session =>
    #    non-zero (3); a headful app cannot run without a desktop session.
    DISPLAY_ENV_LOG_PREFIX="electron-launcher" resolve_display_env || return $?

    # 3. Wire the hermetic URLs into the app's environment.
    export REACT_APP_CLOUD_URL="${E2E_BACKEND_URL}"
    export REACT_APP_CLOUD_URL_API="${E2E_BACKEND_URL}"
    export SMOKER_RENDERER_URL="${E2E_SMOKER_URL}"

    # 4. Launch the app on the box display with a CDP endpoint on the fixed port.
    log "launching ${ELECTRON_BIN} (${SMOKER_APP_DIR}) with CDP on :${CDP_PORT}"
    "${ELECTRON_BIN}" "${SMOKER_APP_DIR}" "--remote-debugging-port=${CDP_PORT}" &
    local child_pid=$!

    mkdir -p "$(dirname "${ELECTRON_LAUNCHER_PIDFILE}")"
    echo "${child_pid}" > "${ELECTRON_LAUNCHER_PIDFILE}"
    log "recorded PID ${child_pid} -> ${ELECTRON_LAUNCHER_PIDFILE}"

    # 5. Block until CDP answers. On timeout, kill the app and clean the PID file
    #    so a failed start leaves nothing behind.
    if ! wait_for_cdp; then
        log "ERROR: CDP endpoint on :${CDP_PORT} did not answer after ${CDP_WAIT_RETRIES} attempts — aborting."
        if pid_alive "${child_pid}"; then
            kill "${child_pid}" 2>/dev/null || true
        fi
        rm -f "${ELECTRON_LAUNCHER_PIDFILE}"
        return 5
    fi

    log "ready: smoker Electron app up on the box display, CDP at http://127.0.0.1:${CDP_PORT}"
    return 0
}

cmd_stop() {
    # Idempotent: no PID file => nothing to stop.
    if [ ! -f "${ELECTRON_LAUNCHER_PIDFILE}" ]; then
        log "no PID file at ${ELECTRON_LAUNCHER_PIDFILE} — nothing to stop"
        return 0
    fi

    local pid
    pid="$(cat "${ELECTRON_LAUNCHER_PIDFILE}" 2>/dev/null)"

    if pid_alive "${pid}"; then
        log "stopping smoker Electron app (PID ${pid})"
        kill "${pid}" 2>/dev/null || true
    else
        # Stale PID file: process already gone. Clean it, no error.
        log "PID ${pid:-<empty>} already gone — clearing stale PID file"
    fi

    rm -f "${ELECTRON_LAUNCHER_PIDFILE}"
    return 0
}

main() {
    local subcommand="${1:-}"
    case "${subcommand}" in
        start) cmd_start ;;
        stop) cmd_stop ;;
        *)
            log "usage: electron-launcher.sh {start|stop}"
            return 2
            ;;
    esac
}

main "$@"
