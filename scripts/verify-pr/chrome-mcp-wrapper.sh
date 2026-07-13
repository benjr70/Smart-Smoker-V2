#!/usr/bin/env bash
# chrome-mcp-wrapper.sh — launch the Playwright MCP server against REAL, headful
# Google Chrome on this box's GNOME/XWayland display (deep module).
#
# Why a wrapper: the MCP config must stay static across reboots, but the GNOME
# session's X-authority file path rotates every boot (mutter writes a fresh
# random-suffixed `.mutter-Xwaylandauth.XXXXXX` under the user runtime dir). So
# the display environment cannot be hardcoded in the MCP config — it must be
# resolved at launch time. This wrapper does that resolution, then `exec`s the
# Playwright MCP server configured for real Chrome, headful, with a fresh,
# isolated user-data-dir per run.
#
# Contract:
#   - Resolves DISPLAY + XAUTHORITY at launch by globbing the session auth file.
#   - No desktop session (no auth file) => exit non-zero with a clear error that
#     names the missing precondition. NEVER falls back to headless.
#   - Each run gets a fresh, unique user-data-dir so no cookies/permissions
#     persist between runs.
#
# Usage (normally invoked by the MCP runtime, not by hand):
#   scripts/verify-pr/chrome-mcp-wrapper.sh [extra @playwright/mcp args...]
#
# Environment overrides (all have production defaults; used mainly by tests):
#   XDG_RUNTIME_DIR         User runtime dir (default /run/user/<uid>).
#   DISPLAY                 X display (default :0 — XWayland on the box).
#   CHROME_MCP_XAUTH_GLOB   Glob for the session auth file
#                           (default ${XDG_RUNTIME_DIR}/.mutter-Xwaylandauth.*).
#   CHROME_MCP_PROFILE_BASE Base dir for the fresh per-run user-data-dir
#                           (default ${TMPDIR:-/tmp}/verify-pr-chrome-profiles).
#
# Exit codes:
#   0  handed off to the MCP server (exec)
#   3  missing precondition (no desktop session / no X-authority file)

set -uo pipefail

log() { echo "[chrome-mcp-wrapper] $*" >&2; }

# 1. Resolve the display. XWayland on the box lives on :0.
DISPLAY="${DISPLAY:-:0}"

# 2. Resolve the rotating X-authority file by glob. The runtime dir defaults to
#    /run/user/<uid>; mutter drops a fresh `.mutter-Xwaylandauth.XXXXXX` there
#    each boot, so the exact name is never hardcoded.
runtime_dir="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
xauth_glob="${CHROME_MCP_XAUTH_GLOB:-${runtime_dir}/.mutter-Xwaylandauth.*}"

# Newest match wins (a rotated boot may leave a stale file behind).
xauthority=""
for candidate in $(ls -1t ${xauth_glob} 2>/dev/null); do
    if [ -f "${candidate}" ]; then
        xauthority="${candidate}"
        break
    fi
done

if [ -z "${xauthority}" ]; then
    log "ERROR: no active desktop session — no X-authority file matching"
    log "       '${xauth_glob}' (expected a GNOME/XWayland session on DISPLAY=${DISPLAY})."
    log "       A headful Chrome needs a logged-in desktop session on the box;"
    log "       refusing to fall back to headless. Log into the box's desktop"
    log "       (or run the provisioning script) and retry."
    exit 3
fi

export DISPLAY
export XAUTHORITY="${xauthority}"
log "resolved DISPLAY=${DISPLAY} XAUTHORITY=${XAUTHORITY}"

# 3. Fresh, unique user-data-dir per run so no cookies/permissions leak between
#    verification runs.
profile_base="${CHROME_MCP_PROFILE_BASE:-${TMPDIR:-/tmp}/verify-pr-chrome-profiles}"
mkdir -p "${profile_base}"
profile_dir="$(mktemp -d "${profile_base}/run-XXXXXX")"
log "fresh user-data-dir: ${profile_dir}"

# 4. Hand off to the Playwright MCP server: REAL Chrome channel, headful (NO
#    --headless flag), isolated fresh profile.
exec npx -y @playwright/mcp@latest \
    --browser chrome \
    --user-data-dir "${profile_dir}" \
    "$@"
