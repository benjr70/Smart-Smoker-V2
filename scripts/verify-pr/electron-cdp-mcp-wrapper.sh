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
# Why a wrapper (not a plain MCP entry): the CDP endpoint is a moving target —
# the MCP runtime may start this server before, or racing with, the Electron app.
# The wrapper polls the endpoint briefly so a launcher race resolves before the
# first tool call, then `exec`s the MCP server.
#
# Why the wait is NOT a gate: MCP stdio servers are spawned once, at session
# start. At that moment /verify-pr has not even checked the PR out — Electron is
# launched minutes later (SKILL.md step 5). A wrapper that exits because nothing
# is listening yet is dropped for the WHOLE session, and the verifier ends up
# with zero Electron tools (exactly what happened before issue #388: the 60s wait
# also blew past the runtime's 30s startup timeout). @playwright/mcp dials
# --cdp-endpoint lazily, on the first tool call, so the wrapper hands off even
# when the endpoint is down: registration succeeds now, and a premature tool call
# fails on its own with a connection error instead of costing the whole session
# its tools. No detached browser is ever launched — `--cdp-endpoint` only ever
# attaches.
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
#   CDP_WAIT_RETRIES   bounded readiness attempts (default: 5 — the whole wait
#                      must stay well inside the MCP runtime's 30s startup
#                      timeout, or the server is dropped before it registers)
#   CDP_WAIT_INTERVAL  seconds between attempts   (default: 1)
#
# Exit codes:
#   0  handed off to the MCP server (exec) — whether or not CDP answered yet

set -uo pipefail

CDP_PORT="${CDP_PORT:-9222}"
CDP_HOST="${CDP_HOST:-127.0.0.1}"
CDP_ENDPOINT="http://${CDP_HOST}:${CDP_PORT}"
CDP_PROBE_CMD="${CDP_PROBE_CMD:-curl -sf ${CDP_ENDPOINT}/json/version}"
CDP_WAIT_RETRIES="${CDP_WAIT_RETRIES:-5}"
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

if wait_for_cdp; then
    log "CDP endpoint ${CDP_ENDPOINT} is up — attaching Playwright MCP"
else
    log "WARNING: CDP endpoint ${CDP_ENDPOINT} did not answer within ${CDP_WAIT_RETRIES} attempts."
    log "         Registering the MCP server anyway so its tools exist for this session;"
    log "         Playwright dials the endpoint lazily, on the first tool call."
    log "         Start the smoker Electron app with --remote-debugging-port=${CDP_PORT}"
    log "         (electron-launcher.sh) BEFORE calling a tool, or the call fails to connect."
fi

# Hand off to the Playwright MCP server attached to the existing Electron
# renderer over CDP. No new browser is launched (so no display env needed here —
# the launcher already put the app on the box display).
exec npx -y @playwright/mcp@latest \
    --cdp-endpoint "${CDP_ENDPOINT}" \
    "$@"
