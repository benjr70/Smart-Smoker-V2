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
#   4. Smoker workspace deps + the Electron binary the launcher runs
#                                          (workspace install if absent, then a
#                                           PATH shim so the launcher's default
#                                           `electron` actually resolves)
#   5. Built smoker shell bundle           (Forge/webpack build if absent or
#                                           older than the shell sources)
#   6. MCP entries for both wrappers       (committed to .mcp.json — verified
#                                           here, repaired only if damaged)
#
# Usage:
#   scripts/verify-pr/provision-box.sh
#
# Environment overrides (production defaults; mainly for tests):
#   MCP_CONFIG_FILE               .mcp.json to update  (default: repo .mcp.json)
#   CHROME_MCP_WRAPPER            wrapper to register  (default: this dir's)
#   SMOKER_APP_DIR                smoker app dir       (default: apps/smoker)
#   SMOKER_ELECTRON_BINARIES      candidate Electron binary paths, first wins
#   SMOKER_DEPS_INSTALL_CMD       install run from the repo root when none exist
#   SMOKER_LAUNCHER_ELECTRON_CMD  command name the launcher runs (default:
#                                 electron) — the shim is named after it
#   SMOKER_ELECTRON_SHIM_DIR      PATH dir the shim is installed into
#                                 (default: ~/.local/bin)
#   SMOKER_SHELL_BUNDLE           built main-process bundle the shell runs
#                                 (default: apps/smoker/.webpack/main/index.js)
#   SMOKER_SHELL_SOURCES          paths whose mtimes decide bundle freshness
#   SMOKER_SHELL_BUILD_CMD        build run from SMOKER_APP_DIR when the bundle
#                                 is absent or stale
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

# Candidate paths that satisfy "the smoker workspace's Electron binary is on
# disk", and the install that puts it there. Both overridable so the
# verify-then-act branches can be exercised without a real install.
SMOKER_APP_DIR="${SMOKER_APP_DIR:-${REPO_ROOT}/apps/smoker}"
SMOKER_ELECTRON_BINARIES="${SMOKER_ELECTRON_BINARIES:-${SMOKER_APP_DIR}/node_modules/electron/dist/electron ${REPO_ROOT}/node_modules/electron/dist/electron}"
SMOKER_DEPS_INSTALL_CMD="${SMOKER_DEPS_INSTALL_CMD:-npm install --legacy-peer-deps --workspace smoker}"
# The command name electron-launcher.sh runs by default (its ELECTRON_BIN
# default), and the PATH directory the shim that makes it resolve is installed
# into. Both overridable so the shim step can be exercised without depending on
# what this host has installed or writing into the real ~/.local/bin.
SMOKER_LAUNCHER_ELECTRON_CMD="${SMOKER_LAUNCHER_ELECTRON_CMD:-electron}"
SMOKER_ELECTRON_SHIM_DIR="${SMOKER_ELECTRON_SHIM_DIR:-${HOME}/.local/bin}"

# The built main-process bundle the shell actually runs, the sources it is built
# from (freshness inputs), and the build that produces it. The build is the app's
# own Forge/webpack pipeline; it also packages the app into `out/`, which the
# harness has no use for, so the default drops that 200MB+ byproduct again.
SMOKER_SHELL_BUNDLE="${SMOKER_SHELL_BUNDLE:-${SMOKER_APP_DIR}/.webpack/main/index.js}"
SMOKER_SHELL_SOURCES="${SMOKER_SHELL_SOURCES:-${SMOKER_APP_DIR}/electron-app ${SMOKER_APP_DIR}/src ${SMOKER_APP_DIR}/package.json ${SMOKER_APP_DIR}/config.forge.js ${SMOKER_APP_DIR}/webpack.main.config.js ${SMOKER_APP_DIR}/webpack.renderer.config.js ${SMOKER_APP_DIR}/webpack.rules.js}"
SMOKER_SHELL_BUILD_CMD="${SMOKER_SHELL_BUILD_CMD:-ELECTRON_APP_MODE=thin npx electron-forge package && rm -rf out/smoker-electron-build}"

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
# Step 4 (smoker deps): verify the smoker workspace's dependencies — the Electron
# binary above all — exist in this checkout, and install them if not. The
# launcher runs the shell from the provisioned checkout, so without this step it
# has nothing to run; and rounds themselves never install anything, so the
# install has to happen here.
#
# The Electron binary on disk is the probe: it is the one dependency the launcher
# actually executes, and it is what a half-finished install leaves missing. After
# an install we re-check it and fail loudly if it still is not there, rather than
# reporting a provisioned box the launcher will die on.
#
# On disk is necessary but not sufficient: the launcher invokes it by NAME, so
# the step finishes by making that name resolve (see ensure_launcher_electron_cmd).
#-------------------------------------------------------------------------------

# First existing, executable candidate Electron binary (npm hoists workspace deps
# to the root, but a workspace-local install is equally valid).
find_electron_binary() {
    local candidate
    for candidate in ${SMOKER_ELECTRON_BINARIES}; do
        if [ -x "${candidate}" ]; then
            printf '%s' "${candidate}"
            return 0
        fi
    done
    return 1
}

# Canonical (symlinks resolved) form of a path; the path itself when it cannot
# be resolved, so comparisons never collapse to an empty string.
canonical_path() {
    realpath -m "$1" 2>/dev/null || printf '%s' "$1"
}

# What the launcher's command name resolves to today, symlinks followed — empty
# when it does not resolve at all.
resolved_launcher_electron() {
    local found
    hash -r 2>/dev/null || true
    found="$(command -v "${SMOKER_LAUNCHER_ELECTRON_CMD}" 2>/dev/null)" || return 0
    [ -n "${found}" ] || return 0
    canonical_path "${found}"
}

# The launcher runs a bare `electron` (its ELECTRON_BIN default) and is not ours
# to change, but a workspace install lands the binary under node_modules, which
# is not on PATH — so `launcher start` would die with "command not found" on a
# box provisioning just called ready, and only surface 60s later as a CDP
# timeout. This step therefore MAKES that default resolve: a symlink named after
# the launcher's command, in a PATH directory, pointing at the binary found
# above. Already correct => no-op; ours but pointing elsewhere => repointed; a
# foreign `electron` already on PATH => left alone, the launcher's default works.
# The link is then re-probed, and a name that still does not resolve fails the
# step: a box the launcher cannot start on must never report as provisioned.
ensure_launcher_electron_cmd() {
    local bin="$1" cmd="${SMOKER_LAUNCHER_ELECTRON_CMD}" want shim current

    want="$(canonical_path "${bin}")"
    shim="${SMOKER_ELECTRON_SHIM_DIR}/${cmd}"
    current="$(resolved_launcher_electron)"

    if [ "${current}" = "${want}" ]; then
        log "launcher command '${cmd}' resolves to ${bin} — no change"
        return 0
    fi
    if [ -n "${current}" ] && [ "${current}" != "$(canonical_path "${shim}")" ]; then
        log "launcher command '${cmd}' already resolves to ${current} — no change"
        return 0
    fi

    log "launcher command '${cmd}' does not resolve to ${bin} — linking ${shim}"
    if ! mkdir -p "${SMOKER_ELECTRON_SHIM_DIR}" || ! ln -sfn "${bin}" "${shim}"; then
        log "ERROR: could not install the launcher shim at ${shim}"
        return 1
    fi

    current="$(resolved_launcher_electron)"
    if [ "${current}" != "${want}" ]; then
        log "ERROR: '${cmd}' still does not resolve to ${bin} after linking ${shim}"
        log "       (resolves to: ${current:-nothing}); is ${SMOKER_ELECTRON_SHIM_DIR} on PATH?"
        log "       PATH=${PATH}"
        return 1
    fi

    log "launcher command '${cmd}' linked: ${shim} -> ${bin}"
    return 0
}

ensure_smoker_deps() {
    local bin
    if bin="$(find_electron_binary)"; then
        log "smoker workspace deps present (Electron binary at ${bin}) — no change"
        ensure_launcher_electron_cmd "${bin}" || return 1
        return 0
    fi

    log "smoker workspace deps absent — installing: ${SMOKER_DEPS_INSTALL_CMD}"
    if ! (cd "${REPO_ROOT}" && bash -c "${SMOKER_DEPS_INSTALL_CMD}"); then
        log "ERROR: smoker workspace install failed: ${SMOKER_DEPS_INSTALL_CMD}"
        return 1
    fi

    if bin="$(find_electron_binary)"; then
        log "smoker workspace deps installed (Electron binary at ${bin})"
        ensure_launcher_electron_cmd "${bin}" || return 1
        return 0
    fi

    log "ERROR: install completed but no Electron binary is on disk;"
    log "       looked for: ${SMOKER_ELECTRON_BINARIES}"
    return 1
}

#-------------------------------------------------------------------------------
# Step 5 (shell bundle): verify the built main-process bundle exists and is newer
# than the shell sources, and (re)build it if not.
#
# This step is what makes the renderer-URL override reach the box. The launcher
# runs `electron <app dir>`, and the app's `package.json` "main" points at
# ./.webpack/main — a gitignored BUILD ARTIFACT. So the shell never executes the
# TypeScript sources: a checkout that was never built has nothing to run, and a
# checkout built before a shell change runs the OLD main process. The stale case
# is the dangerous one, because the shell still comes up and CDP still answers —
# it just quietly loads the old URL, which is exactly the kind of silent failure
# this slice exists to remove.
#-------------------------------------------------------------------------------

# True when any shell source is newer than the built bundle.
shell_sources_newer_than_bundle() {
    local path
    for path in ${SMOKER_SHELL_SOURCES}; do
        [ -e "${path}" ] || continue
        if [ -n "$(find "${path}" -newer "${SMOKER_SHELL_BUNDLE}" -print -quit 2>/dev/null)" ]; then
            return 0
        fi
    done
    return 1
}

ensure_smoker_shell_bundle() {
    if [ -f "${SMOKER_SHELL_BUNDLE}" ]; then
        if ! shell_sources_newer_than_bundle; then
            log "smoker shell bundle up to date (${SMOKER_SHELL_BUNDLE}) — no change"
            return 0
        fi
        log "smoker shell bundle is stale — shell sources changed since it was built"
    else
        log "smoker shell bundle absent (${SMOKER_SHELL_BUNDLE})"
    fi

    log "building the smoker shell: ${SMOKER_SHELL_BUILD_CMD}"
    if ! (cd "${SMOKER_APP_DIR}" && bash -c "${SMOKER_SHELL_BUILD_CMD}"); then
        log "ERROR: smoker shell build failed: ${SMOKER_SHELL_BUILD_CMD}"
        return 1
    fi

    if [ ! -f "${SMOKER_SHELL_BUNDLE}" ]; then
        log "ERROR: build completed but no main-process bundle is on disk;"
        log "       expected: ${SMOKER_SHELL_BUNDLE}"
        return 1
    fi

    log "smoker shell bundle built (${SMOKER_SHELL_BUNDLE})"
    return 0
}

#-------------------------------------------------------------------------------
# Step 6 (config): VERIFY — and only when needed, repair — a wrapper's MCP server
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
    ensure_smoker_deps || return 1
    ensure_smoker_shell_bundle || return 1
    # Committed entries — expected to verify; a repair means someone edited them.
    ensure_mcp_entry "${MCP_SERVER_KEY}" "${CHROME_MCP_WRAPPER}" || return 1
    ensure_mcp_entry "${ELECTRON_MCP_SERVER_KEY}" "${ELECTRON_MCP_WRAPPER}" || return 1

    log "provisioning complete"
    return 0
}

main "$@"
