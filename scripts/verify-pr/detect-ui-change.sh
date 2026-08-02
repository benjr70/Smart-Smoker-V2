#!/usr/bin/env bash
# detect-ui-change.sh — decide whether a PR's diff changes user-visible UI, and
# name the surfaces a screenshot tour has to cover.
#
# Why this exists: the harness posts a screenshot tour into the PR description
# (issue: "auto agent — post UI screenshots in the PR body"), but only for PRs
# that actually change UI. "Actually changes UI" is a file-path judgement, and a
# judgement made in skill prose drifts round to round. So it lives here, as a
# pure text transform with a test suite: no git, no network, no side effects.
#
# Usage:
#   git diff --name-only origin/master...HEAD | detect-ui-change.sh
#   detect-ui-change.sh --list-globs
#
# Reads changed repo-relative paths on stdin (one per line), writes the surfaces
# to screenshot on stdout, one per line, sorted and deduped, from:
#
#   frontend   the cloud web app (apps/frontend)
#   smoker     the Electron shell (apps/smoker)
#
# No output at all means "no UI change" — the caller skips the tour entirely.
# A shared package (packages/*/src) renders inside BOTH apps, so it emits both
# surfaces.
#
# What counts as UI (deliberately narrow — a false positive costs a whole
# screenshot round on the box):
#   - under an app/package source root, AND
#   - a rendering extension: .tsx .jsx .css .scss .sass .less .html .svg, AND
#   - not a test / story / snapshot file (a test-only change ships no pixels).
#
# `.ts` is excluded on purpose: the api/, hooks/ and service layers are `.ts`
# and change constantly without moving a pixel. A `.ts` change that DOES alter
# rendering (a theme token, a formatter) will normally arrive alongside the
# `.tsx` that consumes it.
#
# Exit codes:
#   0  ran (surfaces on stdout, possibly none)
#   2  usage error

set -uo pipefail

usage() {
    cat >&2 <<'EOF'
Usage: detect-ui-change.sh < changed-paths
       detect-ui-change.sh --list-globs
Reads repo-relative changed paths on stdin; prints UI surfaces (frontend|smoker).
EOF
}

# Source roots that render pixels, as `surface<TAB>path-prefix-regex` lines.
# `shared` fans out to both apps.
root_table() {
    printf '%s\n' \
        "frontend	apps/frontend/src/" \
        "frontend	apps/frontend/public/" \
        "smoker	apps/smoker/src/" \
        "smoker	apps/smoker/public/" \
        "shared	packages/[^/]+/src/"
}

UI_EXT_RE='\.(tsx|jsx|css|scss|sass|less|html|svg)$'
NON_UI_RE='(\.test\.|\.spec\.|\.stories\.|__tests__/|__snapshots__/|__mocks__/)'

main() {
    case "${1:-}" in
        --list-globs)
            root_table
            return 0
            ;;
        '') ;;
        *)
            usage
            return 2
            ;;
    esac

    local -a surfaces=()
    local path surface prefix

    while IFS= read -r path; do
        [ -n "${path}" ] || continue
        # Strip a leading ./ so `git diff` and `find` styles both work.
        path="${path#./}"

        printf '%s' "${path}" | grep -Eq -- "${UI_EXT_RE}" || continue
        printf '%s' "${path}" | grep -Eq -- "${NON_UI_RE}" && continue

        while IFS=$'\t' read -r surface prefix; do
            [ -n "${surface}" ] || continue
            if printf '%s' "${path}" | grep -Eq -- "^${prefix}"; then
                if [ "${surface}" = "shared" ]; then
                    surfaces+=("frontend" "smoker")
                else
                    surfaces+=("${surface}")
                fi
            fi
        done < <(root_table)
    done

    [ "${#surfaces[@]}" -gt 0 ] || return 0
    printf '%s\n' "${surfaces[@]}" | sort -u
}

main "$@"
