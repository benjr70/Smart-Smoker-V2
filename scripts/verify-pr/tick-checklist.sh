#!/usr/bin/env bash
# tick-checklist.sh — tick the boxes that PASSED this /verify-pr round.
#
# Given a PR body and the set of item texts that passed (read from stdin, one
# per line), emit the body with exactly those unchecked boxes flipped to
# `- [x]`. This is the mutation applied to a human's PR at the end of a round, so
# it is deliberately conservative:
#   - only items whose text exactly matches a pass-list entry are flipped;
#   - deferred / failed items keep their `- [ ]` (never ticked);
#   - already-`- [x]` items are never un-ticked;
#   - only the two verification sections (Manual verification / Human
#     verification required) are eligible — a coincidentally identical box in
#     another section is left untouched;
#   - every other line is emitted verbatim.
#
# Usage:
#   printf '%s\n' "$passed_items" | tick-checklist.sh <body-file> > new-body.md
#
# The section boundaries mirror parse-checklist.sh so the two agree on what a
# "verification item" is.

set -uo pipefail

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

is_verification_heading() {
    case "$1" in
        *"manual verification"* | *"human verification"*) return 0 ;;
        *) return 1 ;;
    esac
}

main() {
    local body_file="${1:?tick-checklist.sh: body-file argument required}"

    # Read the pass-list (item texts) from stdin into an associative set.
    declare -A PASSED=()
    local p
    while IFS= read -r p; do
        p="$(printf '%s' "${p}" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
        [ -n "${p}" ] && PASSED["${p}"]=1
    done

    local in_section=0 line htext item trimmed
    while IFS= read -r line || [ -n "${line}" ]; do
        if htext="$(heading_text "${line}")"; then
            if is_verification_heading "${htext}"; then
                in_section=1
            else
                in_section=0
            fi
            printf '%s\n' "${line}"
            continue
        fi

        if [ "${in_section}" -eq 1 ] &&
            [[ "${line}" =~ ^([[:space:]]*[-*][[:space:]]+)\[[[:space:]]\]([[:space:]]+)(.*)$ ]]; then
            local prefix="${BASH_REMATCH[1]}" gap="${BASH_REMATCH[2]}" rest="${BASH_REMATCH[3]}"
            item="${rest}"
            trimmed="$(printf '%s' "${item}" | sed -E 's/[[:space:]]+$//')"
            if [ -n "${PASSED[${trimmed}]:-}" ]; then
                printf '%s[x]%s%s\n' "${prefix}" "${gap}" "${rest}"
                continue
            fi
        fi

        printf '%s\n' "${line}"
    done <"${body_file}"
}

main "$@"
