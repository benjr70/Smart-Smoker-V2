#!/usr/bin/env bash
# electron-cdp-mcp-wrapper.sh — launch the Playwright MCP server attached over
# the Chrome DevTools Protocol to the running smoker Electron app (deep module).
#
# Companion to electron-launcher.sh: the launcher starts the smoker desktop app
# on the box display with `--remote-debugging-port=<CDP_PORT>`; this wrapper is
# the MCP server entry that attaches Playwright to that fixed CDP endpoint, so
# the agent gets snapshot/click/type/network tools against the REAL Electron
# renderer.
#
# Why a wrapper (not a plain MCP entry): the MCP runtime may start this server
# before — or racing with — the Electron app. So the wrapper polls the CDP
# endpoint and only `exec`s the MCP server once it answers, retrying up to a
# bounded number of attempts. If the endpoint never comes up it exits non-zero
# with a clear error naming the endpoint — it never launches a detached browser.
#
# Usage (normally invoked by the MCP runtime, not by hand):
#   scripts/verify-pr/electron-cdp-mcp-wrapper.sh [extra @playwright/mcp args...]
#
# Overrides (production defaults; CDP_PROBE_CMD is the injection point tests use
# to run without a real CDP endpoint):
#   CDP_PORT           the Electron app's remote-debugging port (default: 9222)
#   CDP_HOST           CDP host (default: 127.0.0.1)
#   CDP_PROBE_CMD      readiness probe; exit 0 == CDP up
#                      (default: curl -sf http://<host>:<port>/json/version)
#   CDP_WAIT_RETRIES   bounded readiness attempts (default: 60)
#   CDP_WAIT_INTERVAL  seconds between attempts   (default: 1)
#
# Exit codes:
#   0  handed off to the MCP server (exec)
#   6  the CDP endpoint did not come up within the bounded wait

set -uo pipefail

CDP_PORT="${CDP_PORT:-9222}"
CDP_HOST="${CDP_HOST:-127.0.0.1}"
CDP_ENDPOINT="http://${CDP_HOST}:${CDP_PORT}"
CDP_PROBE_CMD="${CDP_PROBE_CMD:-curl -sf ${CDP_ENDPOINT}/json/version}"
CDP_WAIT_RETRIES="${CDP_WAIT_RETRIES:-60}"
CDP_WAIT_INTERVAL="${CDP_WAIT_INTERVAL:-1}"

log() { echo "[electron-cdp-mcp-wrapper] $*" >&2; }

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

if ! wait_for_cdp; then
    log "ERROR: CDP endpoint ${CDP_ENDPOINT} never answered after ${CDP_WAIT_RETRIES} attempts."
    log "       The smoker Electron app must be running with --remote-debugging-port=${CDP_PORT}"
    log "       (start it via electron-launcher.sh). Refusing to launch a detached browser."
    exit 6
fi

log "CDP endpoint ${CDP_ENDPOINT} is up — attaching Playwright MCP"

# Hand off to the Playwright MCP server attached to the existing Electron
# renderer over CDP. No new browser is launched (so no display env needed here —
# the launcher already put the app on the box display).
exec npx -y @playwright/mcp@latest \
    --cdp-endpoint "${CDP_ENDPOINT}" \
    "$@"
