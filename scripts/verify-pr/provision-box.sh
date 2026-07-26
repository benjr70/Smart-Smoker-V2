#!/usr/bin/env bash
# provision-box.sh — one-time, idempotent provisioning of the always-on agent
# box for the /verify-pr harness (deep module).
#
# Prepares everything an agent needs to open a REAL, headful Google Chrome on
# the box's GNOME/XWayland display through the Playwright MCP server, and checks
# that the MCP config still points at the harness wrappers. Running it twice
# changes nothing the second time — every step is verify-then-act.
#
# Verifies / provisions:
#   1. Real Google Chrome present         (installs via apt if absent)
#   2. Playwright browsers + system deps   (installs via `playwright install`)
#   3. Docker usable by the agent user     (adds user to the docker group)
#   4. MCP entries for both wrappers       (committed to .mcp.json — verified
#                                           here, repaired only if damaged)
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
# Step 4 (config): VERIFY — and only when needed, repair — a wrapper's MCP server
# entry. The two harness entries live in the repo's committed .mcp.json, so a
# healthy box has nothing to do here; this step exists to catch a hand-edited or
# hand-deleted entry, not to author one. (They used to be written on every run;
# because .mcp.json is tracked, the daemon's `git reset --hard` cleanup wiped
# them and the verifier lost its Electron/Chrome tools — hence committed entries
# plus a verify-then-repair step.)
#
# "Correct" is judged by WHAT THE MCP RUNTIME WOULD LAUNCH, not by string
# equality against a path. Two facts shape the expected form:
#
#   * stdio servers are spawned with the SESSION's cwd, which is not necessarily
#     the checkout root (CLAUDE.md itself sends developers into `apps/backend`).
#     A bare './scripts/...' command therefore ENOENTs there — silently, with no
#     tools and no diagnostic. Relative-to-the-config-file is NOT how it works.
#   * an absolute path is cwd-independent but not portable: it cannot be
#     committed, since every clone and worktree lives somewhere else.
#
# So the committed form is a tiny shell that resolves the checkout root at launch
# time (`git rev-parse --show-toplevel`, correct from any subdirectory and inside
# worktrees) and execs the wrapper from there. Provisioning expects exactly that
# form; a wrapper outside the config's checkout falls back to an absolute command.
#-------------------------------------------------------------------------------

# The launch script a committed entry carries for a repo-relative wrapper path.
# Sole source of truth for the string — repairs must converge on the committed
# bytes, or every run would dirty a tracked file.
mcp_launch_script() {
    printf 'r="$(git rev-parse --show-toplevel 2>/dev/null)"; if [ -z "$r" ]; then echo "[verify-pr] cannot locate the checkout root from $PWD; start Claude inside the repo" >&2; exit 3; fi; exec "$r/%s"' "$1"
}

# Wrapper path relative to the config's checkout, or non-zero when it cannot be
# expressed that way (outside the checkout, or realpath unusable).
mcp_wrapper_rel() {
    local wrapper="$1" base rel
    base="$(cd "$(dirname "${MCP_CONFIG_FILE}")" 2>/dev/null && pwd)" || return 1
    [ -n "${base}" ] || return 1
    rel="$(realpath -m --relative-to="${base}" "${wrapper}" 2>/dev/null)" || return 1
    [ -n "${rel}" ] || return 1
    case "${rel}" in
        /* | ../*) return 1 ;;
    esac
    printf '%s' "${rel}"
}

#   $1 = MCP server key   $2 = wrapper command path
ensure_mcp_entry() {
    local key="$1" wrapper="$2" rel want_cmd want_args current entry_type current_args

    if rel="$(mcp_wrapper_rel "${wrapper}")"; then
        want_cmd="bash"
        want_args="$(jq -nc --arg s "$(mcp_launch_script "${rel}")" '["-c", $s]')"
    else
        # Wrapper lives outside the config's checkout: an absolute command is the
        # only cwd-independent option left.
        want_cmd="$(realpath -m "${wrapper}" 2>/dev/null)"
        want_args='[]'
    fi

    # Never compare an empty expectation: "" = "" would wave any entry through as
    # verified and suppress the repair, reporting success on a broken config.
    if [ -z "${want_cmd}" ] || [ -z "${want_args}" ]; then
        log "ERROR: cannot compute the correct command for MCP entry '${key}'"
        log "       (could not resolve '${wrapper}' — is realpath available?);"
        log "       refusing to report the entry verified"
        return 1
    fi

    current="$(jq -r --arg k "${key}" \
        '.mcpServers[$k].command // ""' "${MCP_CONFIG_FILE}" 2>/dev/null)"
    entry_type="$(jq -r --arg k "${key}" \
        '.mcpServers[$k].type // ""' "${MCP_CONFIG_FILE}" 2>/dev/null)"
    current_args="$(jq -c --arg k "${key}" \
        '.mcpServers[$k].args // []' "${MCP_CONFIG_FILE}" 2>/dev/null)"

    if [ "${entry_type}" = "stdio" ] && [ "${current}" = "${want_cmd}" ] \
        && [ "${current_args}" = "${want_args}" ]; then
        log "MCP entry '${key}' verified — launches the wrapper from any cwd, no change"
        return 0
    fi

    local was="${current:-(missing)}"
    case "${current}" in
        "" | /* | bash) ;;
        *)
            log "MCP entry '${key}': command '${current}' is relative — the MCP runtime"
            log "       launches servers from the session's cwd (not the config's directory),"
            log "       so it breaks whenever Claude starts outside the checkout root"
            ;;
    esac
    log "MCP entry '${key}' repaired — was '${was}', now resolves the checkout root at launch"

    local tmp
    tmp="$(mktemp)"
    jq --arg k "${key}" --arg cmd "${want_cmd}" --argjson args "${want_args}" \
        '.mcpServers[$k] = {type: "stdio", command: $cmd, args: $args, env: {}}' \
        "${MCP_CONFIG_FILE}" > "${tmp}" && mv "${tmp}" "${MCP_CONFIG_FILE}"
}

main() {
    log "provisioning box for /verify-pr headful Chrome + Electron CDP MCP"

    # Guard: the wrappers the MCP entries point at must exist and be executable.
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
    # Committed entries — expected to verify; a repair means someone edited them.
    ensure_mcp_entry "${MCP_SERVER_KEY}" "${CHROME_MCP_WRAPPER}" || return 1
    ensure_mcp_entry "${ELECTRON_MCP_SERVER_KEY}" "${ELECTRON_MCP_WRAPPER}" || return 1

    log "provisioning complete"
    return 0
}

main "$@"
