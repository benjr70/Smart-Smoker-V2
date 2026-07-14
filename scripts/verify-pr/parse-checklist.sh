#!/usr/bin/env bash
# parse-checklist.sh — extract the unchecked verification items from a PR body.
#
# The /verify-pr round acts only on boxes a human has NOT already ticked, drawn
# from exactly two sections of the PR body:
#   ## Manual verification            -> section tag `manual`
#   ## Human verification required    -> section tag `human`
# Every other section (Summary, Acceptance criteria, ...) is ignored even when it
# contains `- [ ]` checkboxes. Ticked (`- [x]`) items are skipped so a re-run
# never re-verifies a box already signed off.
#
# Usage:
#   parse-checklist.sh [body-file]      # reads <body-file>, or stdin if omitted
#   gh pr view <n> --json body -q .body | parse-checklist.sh
#
# Output (one item per line, tab-separated, stdout):
#   <section>\t<item text>
# Exit 0 always on well-formed input (empty output == nothing to verify).

set -uo pipefail

# Heading detection: a markdown ATX heading line (one-or-more '#', a space, text).
# Returns the lower-cased, trimmed heading text on stdout, or non-zero if the
# line is not a heading.
heading_text() {
    local line="$1"
    if [[ "${line}" =~ ^[[:space:]]*#+[[:space:]]+(.*)$ ]]; then
        printf '%s' "${BASH_REMATCH[1]}" \
            | tr '[:upper:]' '[:lower:]' \
            | sed -E 's/[[:space:]]+$//'
        return 0
    fi
    return 1
}

# Map a heading's text to a section tag, or empty if it is not a target section.
section_tag_for() {
    local h="$1"
    case "${h}" in
        *"manual verification"*) printf 'manual' ;;
        *"human verification"*) printf 'human' ;;
        *) printf '' ;;
    esac
}

main() {
    local input
    if [ "${1:-}" ] && [ "${1}" != "-" ]; then
        input="$(cat -- "$1")"
    else
        input="$(cat)"
    fi

    local section="" line htext tag item
    while IFS= read -r line; do
        # A heading line either opens a target section or closes the current one.
        if htext="$(heading_text "${line}")"; then
            tag="$(section_tag_for "${htext}")"
            section="${tag}"
            continue
        fi

        [ -n "${section}" ] || continue

        # Unchecked checkbox: `- [ ] text` (also `* [ ]`, arbitrary indent).
        if [[ "${line}" =~ ^[[:space:]]*[-*][[:space:]]+\[[[:space:]]\][[:space:]]+(.*)$ ]]; then
            item="$(printf '%s' "${BASH_REMATCH[1]}" | sed -E 's/[[:space:]]+$//')"
            [ -n "${item}" ] && printf '%s\t%s\n' "${section}" "${item}"
        fi
    done <<<"${input}"
}

main "$@"
