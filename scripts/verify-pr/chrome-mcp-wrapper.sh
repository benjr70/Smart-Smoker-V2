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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { echo "[chrome-mcp-wrapper] $*" >&2; }

# 1 & 2. Resolve DISPLAY + the rotating X-authority file via the shared display
# lib (same resolution the Electron launcher uses — one source of truth). No
# desktop session => the lib returns 3 with a clear error; we never fall back to
# headless.
# shellcheck source=lib/resolve-display-env.sh
source "${SCRIPT_DIR}/lib/resolve-display-env.sh"
DISPLAY_ENV_LOG_PREFIX="chrome-mcp-wrapper" resolve_display_env || exit $?

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
