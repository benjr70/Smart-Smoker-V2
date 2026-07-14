#!/usr/bin/env bash
# provision-box.sh — one-time, idempotent provisioning of the always-on agent
# box for the /verify-pr harness (deep module).
#
# Prepares everything an agent needs to open a REAL, headful Google Chrome on
# the box's GNOME/XWayland display through the Playwright MCP server, and wires
# the MCP config at the chrome-mcp-wrapper.sh launcher. Running it twice changes
# nothing the second time — every step is verify-then-act.
#
# Verifies / provisions:
#   1. Real Google Chrome present         (installs via apt if absent)
#   2. Playwright browsers + system deps   (installs via `playwright install`)
#   3. Docker usable by the agent user     (adds user to the docker group)
#   4. MCP config entry pointing at the wrapper (writes it if missing)
#
# Usage:
#   scripts/verify-pr/provision-box.sh
#
# Environment overrides (production defaults; mainly for tests):
#   MCP_CONFIG_FILE     .mcp.json to update  (default: repo-root .mcp.json)
#   CHROME_MCP_WRAPPER  wrapper to register  (default: this dir's wrapper)
#
# Exit codes:
#   0  host is provisioned (or already was)
#   1  a required precondition could not be satisfied

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

MCP_CONFIG_FILE="${MCP_CONFIG_FILE:-${REPO_ROOT}/.mcp.json}"
CHROME_MCP_WRAPPER="${CHROME_MCP_WRAPPER:-${SCRIPT_DIR}/chrome-mcp-wrapper.sh}"
ELECTRON_MCP_WRAPPER="${ELECTRON_MCP_WRAPPER:-${SCRIPT_DIR}/electron-cdp-mcp-wrapper.sh}"
MCP_SERVER_KEY="playwright-chrome"
ELECTRON_MCP_SERVER_KEY="playwright-electron"

# Candidate binary names that satisfy "real Chrome present". Overridable so the
# presence check can be exercised without depending on the host's PATH.
CHROME_BINARIES="${CHROME_BINARIES:-google-chrome-stable google-chrome}"

log() { echo "[provision-box] $*" >&2; }

#-------------------------------------------------------------------------------
# Step 1 (chrome): verify a real Google Chrome is on PATH; install it from
# Google's apt repo if absent. Present => no-op.
#-------------------------------------------------------------------------------
ensure_chrome() {
    local b
    for b in ${CHROME_BINARIES}; do
        if command -v "${b}" >/dev/null 2>&1; then
            log "real Google Chrome present (${b}) — no change"
            return 0
        fi
    done

    log "Google Chrome absent — installing google-chrome-stable from Google's apt repo"
    local keyring="/usr/share/keyrings/google-chrome.gpg"
    local listfile="/etc/apt/sources.list.d/google-chrome.list"
    if [ ! -f "${listfile}" ]; then
        sudo install -d -m 0755 /usr/share/keyrings || true
        curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
            | sudo gpg --dearmor -o "${keyring}" || true
        echo "deb [arch=amd64 signed-by=${keyring}] http://dl.google.com/linux/chrome/deb/ stable main" \
            | sudo tee "${listfile}" >/dev/null || true
    fi
    sudo apt-get update || true
    sudo apt-get install -y google-chrome-stable
}

#-------------------------------------------------------------------------------
# Step 2 (docker): verify the agent user can reach the docker daemon; add the
# user to the docker group if not. `docker info` is the reachability probe.
# Group membership only takes effect on the next login — we say so, loudly.
#-------------------------------------------------------------------------------
ensure_docker() {
    if docker info >/dev/null 2>&1; then
        log "docker reachable by $(id -un) — no change"
        return 0
    fi

    log "docker not usable by $(id -un) — adding to the docker group"
    sudo usermod -aG docker "$(id -un)"
    log "NOTE: docker group membership applies on next login/session — re-login to use docker"
}

#-------------------------------------------------------------------------------
# Step 3 (playwright): verify the Playwright CLI is available and ensure the
# Chrome channel + its system deps are installed. `npx playwright --version`
# is the presence probe; `playwright install --with-deps chrome` is idempotent
# (skips anything already downloaded) so it only runs when the probe fails.
#-------------------------------------------------------------------------------
ensure_playwright() {
    if npx --no-install playwright --version >/dev/null 2>&1; then
        log "Playwright present — no change"
        return 0
    fi

    log "Playwright absent — installing Playwright + Chrome channel system deps"
    npx -y playwright install --with-deps chrome
}

#-------------------------------------------------------------------------------
# Step 4 (config): register a wrapper as an MCP server, idempotently. Skips the
# write entirely when the entry already points at the wrapper so a second run
# leaves the file byte-identical.
#   $1 = MCP server key   $2 = wrapper command path
#-------------------------------------------------------------------------------
ensure_mcp_entry() {
    local key="$1" wrapper="$2" current
    current="$(jq -r --arg k "${key}" \
        '.mcpServers[$k].command // ""' "${MCP_CONFIG_FILE}" 2>/dev/null)"

    if [ "${current}" = "${wrapper}" ]; then
        log "MCP entry '${key}' already points at the wrapper — no change"
        return 0
    fi

    log "writing MCP entry '${key}' → ${wrapper}"
    local tmp
    tmp="$(mktemp)"
    jq --arg k "${key}" --arg cmd "${wrapper}" \
        '.mcpServers[$k] = {type: "stdio", command: $cmd, args: [], env: {}}' \
        "${MCP_CONFIG_FILE}" > "${tmp}" && mv "${tmp}" "${MCP_CONFIG_FILE}"
}

main() {
    log "provisioning box for /verify-pr headful Chrome + Electron CDP MCP"

    # Guard: the wrappers we are about to register must exist and be executable.
    if [ ! -x "${CHROME_MCP_WRAPPER}" ]; then
        log "ERROR: wrapper not found or not executable: ${CHROME_MCP_WRAPPER}"
        return 1
    fi
    if [ ! -x "${ELECTRON_MCP_WRAPPER}" ]; then
        log "ERROR: wrapper not found or not executable: ${ELECTRON_MCP_WRAPPER}"
        return 1
    fi

    ensure_chrome || return 1
    ensure_docker || return 1
    ensure_playwright || return 1
    ensure_mcp_entry "${MCP_SERVER_KEY}" "${CHROME_MCP_WRAPPER}" || return 1
    ensure_mcp_entry "${ELECTRON_MCP_SERVER_KEY}" "${ELECTRON_MCP_WRAPPER}" || return 1

    log "provisioning complete"
    return 0
}

main "$@"
