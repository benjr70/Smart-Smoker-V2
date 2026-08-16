#!/usr/bin/env bash
# Validates a pull-request title against the Conventional Commits format used
# by release-please (PRD #498). Pure check: title in, exit code + human-readable
# reason on stderr out. No side effects, no network, no file writes.
#
# Usage: validate-pr-title.sh "<pr title>"
#        PR_TITLE="<pr title>" validate-pr-title.sh
#
# Exit codes:
#   0  title is a valid conventional-commit subject
#   1  title is invalid (reason printed to stderr)
#   2  no title supplied (usage printed to stderr)

set -uo pipefail

VALID_TYPES=(feat fix chore docs ci refactor test perf build style revert)

# Bash expands ${array[*]} with only the *first* character of IFS, so join on a
# comma and widen to comma-space afterwards.
types_csv() {
    local IFS=','
    local joined="${VALID_TYPES[*]}"
    echo "${joined//,/, }"
}

format_help() {
    cat >&2 <<EOF

Expected format: <type>[optional (scope)][optional !]: <subject>
  Examples: feat(scope): add wifi screen
            fix: correct probe offset
            feat!: drop legacy temps endpoint
  Accepted types: $(types_csv)
EOF
}

usage() {
    echo "Usage: $(basename "$0") \"<pr title>\"  (or set PR_TITLE)" >&2
    exit 2
}

is_valid_type() {
    local candidate="$1"
    local t
    for t in "${VALID_TYPES[@]}"; do
        if [ "${t}" = "${candidate}" ]; then
            return 0
        fi
    done
    return 1
}

reject() {
    echo "Invalid PR title: $1" >&2
    format_help
    exit 1
}

# Rejects the legacy `Closes #N: ...` shape with a targeted message. The space
# before the `#` is optional so `Closes#499: ...` gets the same guidance instead
# of falling through to a misleading type/scope error.
check_legacy_closes_shape() {
    local title="$1"
    if [[ "${title}" =~ ^[Cc]loses[[:space:]]*#[0-9]+ ]]; then
        reject "legacy 'Closes #N: ...' shape is no longer allowed in PR titles.
  Use the conventional format — e.g. 'feat(scope): short description' — and
  move 'Closes #N' into the PR body."
    fi
}

check_conventional_shape() {
    local title="$1"

    # Split on the first colon so we can explain *which* half is wrong.
    if [[ "${title}" != *:* ]]; then
        reject "'${title}' has no '<type>:' prefix."
    fi

    local prefix="${title%%:*}"
    local remainder="${title#*:}"

    if ! [[ "${prefix}" =~ ^([a-z]+)(\(([^()[:space:]]+)\))?(!)?$ ]]; then
        local lowered="${prefix,,}"
        if [[ "${prefix}" != "${lowered}" ]]; then
            reject "type/scope '${prefix}' must be lowercase."
        fi
        reject "type/scope '${prefix}' is malformed — expected '<type>', '<type>(scope)', or '<type>(scope)!'."
    fi

    local type="${BASH_REMATCH[1]}"
    if ! is_valid_type "${type}"; then
        reject "unknown type '${type}'."
    fi

    if [[ "${remainder}" != " "* ]]; then
        reject "missing a space after the colon in '${title}'."
    fi

    local subject="${remainder# }"
    if [[ -z "${subject//[[:space:]]/}" ]]; then
        reject "subject is empty after '${prefix}:'."
    fi
}

main() {
    local title="${1:-${PR_TITLE:-}}"

    if [ "${#}" -eq 0 ] && [ -z "${PR_TITLE:-}" ]; then
        usage
    fi

    if [[ -z "${title//[[:space:]]/}" ]]; then
        reject "title is empty."
    fi

    check_legacy_closes_shape "${title}"
    check_conventional_shape "${title}"

    echo "PR title OK: ${title}"
    exit 0
}

main "$@"
