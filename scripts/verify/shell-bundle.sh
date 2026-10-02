#!/usr/bin/env bash
# shell-bundle.sh — keep the smoker Electron shell's main-process bundle built
# from the sources in this checkout.
#
# Why this exists: apps/smoker's package.json `main` points at the gitignored
# `.webpack/main` build artifact. An unbuilt checkout gives the Electron
# launcher nothing to run. A bundle OLDER than the shell sources is the
# dangerous case: the shell still starts and its debugging endpoint still
# answers, while it quietly runs the old main process. So the bundle is rebuilt
# whenever it is absent or any shell source is newer than it, and left alone
# otherwise.
#
# Callers: the Environment provider's `up` (so the shell a verification round
# drives is built from the PR it checked out) and the Host extension (so a
# fresh Host has a bundle before its first round).
#
# Usage:
#   scripts/verify/shell-bundle.sh ensure   build when absent or stale
#   scripts/verify/shell-bundle.sh status   print fresh | stale | absent
#
# Exit codes:
#   0  the bundle is fresh (it already was, or it was just built)
#   1  the build ran and failed, or left no bundle behind
#   2  usage error
#   3  a prerequisite is missing (the smoker workspace is not installed)
#
# Env (the defaults are production; the overrides are the tests' seams):
#   SMOKER_APP_DIR          the smoker app (default: apps/smoker)
#   SMOKER_SHELL_BUNDLE     the built bundle (default: <app>/.webpack/main/index.js)
#   SMOKER_SHELL_SOURCES    paths whose mtimes decide freshness
#   SMOKER_SHELL_BUILD_CMD  the build, run from the app dir
#   SMOKER_SHELL_FORGE_BIN  the file whose presence means the workspace is
#                           installed (default: the electron-forge binary)

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${HERE}/../.." && pwd)"

SMOKER_APP_DIR="${SMOKER_APP_DIR:-${REPO_ROOT}/apps/smoker}"
SMOKER_SHELL_BUNDLE="${SMOKER_SHELL_BUNDLE:-${SMOKER_APP_DIR}/.webpack/main/index.js}"
SMOKER_SHELL_SOURCES="${SMOKER_SHELL_SOURCES:-${SMOKER_APP_DIR}/electron-app ${SMOKER_APP_DIR}/src ${SMOKER_APP_DIR}/package.json ${SMOKER_APP_DIR}/config.forge.js ${SMOKER_APP_DIR}/webpack.main.config.js ${SMOKER_APP_DIR}/webpack.renderer.config.js ${SMOKER_APP_DIR}/webpack.rules.js}"
# The build is the app's own Forge/webpack pipeline. It also packages the app
# into `out/`, which nothing here uses, so that 200MB+ byproduct is dropped.
SMOKER_SHELL_BUILD_CMD="${SMOKER_SHELL_BUILD_CMD:-ELECTRON_APP_MODE=thin npx electron-forge package && rm -rf out/smoker-electron-build}"

log() { echo "[shell-bundle] $*" >&2; }

# forge_bin : where the workspace install puts electron-forge (npm hoists
# workspace dependencies to the root unless a version conflict keeps one local)
forge_bin() {
    local candidate
    for candidate in ${SMOKER_SHELL_FORGE_BIN:-"${SMOKER_APP_DIR}/node_modules/.bin/electron-forge" "${REPO_ROOT}/node_modules/.bin/electron-forge"}; do
        [ -e "${candidate}" ] && { printf '%s\n' "${candidate}"; return 0; }
    done
    return 1
}

bundle_state() {
    [ -f "${SMOKER_SHELL_BUNDLE}" ] || { echo absent; return 0; }
    local path
    for path in ${SMOKER_SHELL_SOURCES}; do
        [ -e "${path}" ] || continue
        if [ -n "$(find "${path}" -newer "${SMOKER_SHELL_BUNDLE}" -print -quit 2>/dev/null)" ]; then
            echo stale
            return 0
        fi
    done
    echo fresh
}

cmd_ensure() {
    local state; state="$(bundle_state)"
    if [ "${state}" = "fresh" ]; then
        log "the smoker shell bundle is up to date (${SMOKER_SHELL_BUNDLE})"
        return 0
    fi
    log "the smoker shell bundle is ${state} (${SMOKER_SHELL_BUNDLE})"
    if ! forge_bin >/dev/null; then
        log "prerequisite missing: the smoker workspace is not installed (npm install --legacy-peer-deps)"
        return 3
    fi
    log "building the smoker shell: ${SMOKER_SHELL_BUILD_CMD}"
    if ! ( cd "${SMOKER_APP_DIR}" && bash -c "${SMOKER_SHELL_BUILD_CMD}" ) >&2; then
        log "ERROR: the smoker shell build failed"
        return 1
    fi
    if [ ! -f "${SMOKER_SHELL_BUNDLE}" ]; then
        log "ERROR: the build finished but left no bundle at ${SMOKER_SHELL_BUNDLE}"
        return 1
    fi
    log "the smoker shell bundle is built (${SMOKER_SHELL_BUNDLE})"
}

case "${1:-}" in
    ensure) cmd_ensure ;;
    status) bundle_state ;;
    *) echo "usage: shell-bundle.sh ensure | status" >&2; exit 2 ;;
esac
