#!/usr/bin/env bash
# resolve-display-env.sh — shared GNOME/XWayland display-environment resolution
# for the /verify-pr MCP launchers (sourced, not executed).
#
# Why this exists as a lib: the box's MCP config must stay static across reboots,
# but the GNOME session's X-authority file path rotates every boot (mutter writes
# a fresh random-suffixed `.mutter-Xwaylandauth.XXXXXX` under the user runtime
# dir). Both the headful-Chrome wrapper and the Electron launcher need to resolve
# that rotated path at launch time; keeping the logic here means it lives in
# exactly one place (no duplication).
#
# Override env vars (production defaults; used mainly by tests):
#   DISPLAY                 X display (default :0 — XWayland on the box).
#   XDG_RUNTIME_DIR         User runtime dir (default /run/user/<uid>).
#   CHROME_MCP_XAUTH_GLOB   Glob for the session auth file
#                           (default ${XDG_RUNTIME_DIR}/.mutter-Xwaylandauth.*).
#   DISPLAY_ENV_LOG_PREFIX  Log prefix (default display-env).

# resolve_display_env — export DISPLAY + XAUTHORITY for the active GNOME session.
#
# On success: exports DISPLAY and XAUTHORITY (newest matching auth file wins) and
# returns 0. On no active session (no auth file): logs a clear error naming the
# missing precondition, refuses any headless fallback, and returns 3.
resolve_display_env() {
    local log_prefix="${DISPLAY_ENV_LOG_PREFIX:-display-env}"

    # 1. Resolve the display. XWayland on the box lives on :0.
    DISPLAY="${DISPLAY:-:0}"

    # 2. Resolve the rotating X-authority file by glob. Newest match wins (a
    #    rotated boot may leave a stale file behind).
    local runtime_dir="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
    local xauth_glob="${CHROME_MCP_XAUTH_GLOB:-${runtime_dir}/.mutter-Xwaylandauth.*}"

    local xauthority="" candidate
    for candidate in $(ls -1t ${xauth_glob} 2>/dev/null); do
        if [ -f "${candidate}" ]; then
            xauthority="${candidate}"
            break
        fi
    done

    if [ -z "${xauthority}" ]; then
        echo "[${log_prefix}] ERROR: no active desktop session — no X-authority file matching" >&2
        echo "[${log_prefix}]        '${xauth_glob}' (expected a GNOME/XWayland session on DISPLAY=${DISPLAY})." >&2
        echo "[${log_prefix}]        A headful app needs a logged-in desktop session on the box;" >&2
        echo "[${log_prefix}]        refusing to fall back to headless. Log into the box's desktop" >&2
        echo "[${log_prefix}]        (or run the provisioning script) and retry." >&2
        return 3
    fi

    export DISPLAY
    export XAUTHORITY="${xauthority}"
    echo "[${log_prefix}] resolved DISPLAY=${DISPLAY} XAUTHORITY=${XAUTHORITY}" >&2
    return 0
}
