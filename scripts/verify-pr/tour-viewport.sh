#!/usr/bin/env bash
# tour-viewport.sh — the viewport a screenshot tour is captured at, per surface.
#
# Why this exists: neither app is a desktop app, so a default 1280x720 browser
# window produces screenshots that look nothing like what a user sees. The web
# frontend is used on a **phone, held portrait**; the smoker shell runs on the
# device's own fixed panel. A tour captured at the wrong shape is worse than no
# tour — it invites review comments about layout that only exists on the box.
#
# The smoker number is not a preference, it is the hardware: the kiosk
# BrowserWindow in apps/smoker/electron-app/index.ts. The sibling test parses
# that file and fails if the two ever disagree, so a device-panel change cannot
# silently leave the tour capturing the old shape.
#
# Usage:
#   tour-viewport.sh frontend      # -> 390x844
#   tour-viewport.sh smoker        # -> 800x480
#   tour-viewport.sh --list        # -> surface<TAB>WxH lines
#
# Exit codes:
#   0  viewport printed
#   2  unknown surface / usage error

set -uo pipefail

# frontend: iPhone 12/13/14-class portrait logical viewport — the common shape
# for the phone the smoker's owner actually holds. Portrait, always.
FRONTEND_VIEWPORT="390x844"

# smoker: the device panel, mirrored from the kiosk BrowserWindow (800x480).
SMOKER_VIEWPORT="800x480"

viewport_table() {
    printf '%s\t%s\n' \
        "frontend" "${FRONTEND_VIEWPORT}" \
        "smoker" "${SMOKER_VIEWPORT}"
}

main() {
    local surface="${1:-}"

    case "${surface}" in
        --list)
            viewport_table
            return 0
            ;;
        frontend)
            printf '%s\n' "${FRONTEND_VIEWPORT}"
            return 0
            ;;
        smoker)
            printf '%s\n' "${SMOKER_VIEWPORT}"
            return 0
            ;;
        *)
            echo "tour-viewport: unknown surface '${surface}' (expected frontend|smoker|--list)" >&2
            return 2
            ;;
    esac
}

main "$@"
