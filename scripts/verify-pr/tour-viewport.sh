#!/usr/bin/env bash
# tour-viewport.sh — the viewport a screenshot tour is captured at, per surface.
#
# Why this exists: neither app is a desktop app, so a default 1280x720 browser
# window produces screenshots that look nothing like what a user sees. The web
# frontend is used on a **phone, held portrait**; the smoker shell runs on the
# device's own fixed panel. A tour captured at the wrong shape is worse than no
# tour — it invites review comments about layout that only exists on the box.
#
# Shape is only half of it: the tour is captured **viewport-clipped at this
# size, never full-page**. Fixed/sticky chrome (the app's bottom navigation bar)
# is painted once, at its viewport anchor, so a full-page capture of a document
# taller than the viewport shows that bar stranded mid-image over unrelated
# content — which is exactly the "layout bug" a reviewer flagged on PR #464 when
# a full-page Review shot was posted. Content below the fold gets scrolled to
# and captured in the viewport; that is the shot.
#
# The smoker number is not a preference, it is the hardware: the kiosk
# BrowserWindow in apps/smoker/electron-app/index.ts. The sibling test parses
# that file and fails if the two ever disagree, so a device-panel change cannot
# silently leave the tour capturing the old shape.
#
# Usage:
#   tour-viewport.sh frontend      # -> 427x952
#   tour-viewport.sh smoker        # -> 800x480
#   tour-viewport.sh --list        # -> surface<TAB>WxH lines
#
# Exit codes:
#   0  viewport printed
#   2  unknown surface / usage error

set -uo pipefail

# frontend: the Pixel 10 Pro the smoker's owner actually holds. Its panel is
# 1280x2856 physical at device-pixel-ratio 3, so the logical (CSS) viewport a
# page sees is 2856/3 = 952 tall by 1280/3 ~= 427 wide. Portrait, always — a
# landscape or desktop-width capture documents a layout that user never sees.
# (browser_resize takes width/height only; the DPR is not settable through it,
# which costs sharpness, not shape.)
FRONTEND_VIEWPORT="427x952"

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
