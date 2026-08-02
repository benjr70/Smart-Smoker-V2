#!/usr/bin/env bash
# inject-screenshots.sh — put (or refresh) the `## Screenshots` section in a PR
# body from a caption→URL list.
#
# Why this exists: the harness posts the UI tour into the PR *description*, and
# it re-posts it on every verification round of the same PR. Appending blindly
# would grow a wall of stale images; hand-editing the body in skill prose is how
# a human's PR text gets clobbered. So the mutation is a pure, idempotent text
# transform with a test suite — same shape as tick-checklist.sh.
#
# Usage:
#   printf 'Settings page\thttps://github.com/user-attachments/assets/abc\n' \
#     | inject-screenshots.sh body.md > body.new.md
#
# Reads `caption<TAB>url` lines on stdin (one image per line, in the order they
# should appear) and the current PR body from the file argument. Writes the new
# body to stdout.
#
# Behaviour:
#   - an existing `## Screenshots` section (recognised by its
#     `<!-- verify-pr-screenshots -->` marker) is REPLACED wholesale, so a
#     re-verify round refreshes rather than accumulates;
#   - otherwise the section is inserted just before the verification checklist
#     (`## Manual verification` / `## Human verification required`) so the
#     reviewer sees the pixels before the checklist they belong to; failing
#     that, before the generated-by footer rule; failing that, appended;
#   - empty stdin leaves the body byte-identical (a round that captured nothing
#     never destroys what an earlier round posted);
#   - everything else in the body is preserved verbatim.
#
# Exit codes:
#   0  body written to stdout
#   2  usage error / body file not found

set -uo pipefail

MARKER='<!-- verify-pr-screenshots -->'

usage() {
    echo "Usage: inject-screenshots.sh BODY_FILE < caption-tab-url-lines" >&2
}

main() {
    local body_file="${1:-}"
    if [ -z "${body_file}" ] || [ ! -f "${body_file}" ]; then
        usage
        return 2
    fi

    # Read the caption/URL pairs first: no input means no mutation at all.
    local -a captions=() urls=()
    local caption url
    while IFS=$'\t' read -r caption url; do
        [ -n "${url:-}" ] || continue
        captions+=("${caption}")
        urls+=("${url}")
    done

    if [ "${#urls[@]}" -eq 0 ]; then
        cat "${body_file}"
        return 0
    fi

    local section
    section="$(render_section "${#urls[@]}" "${captions[@]}" "${urls[@]}")"

    # Strip any previous section, then re-insert. Stripping first keeps the
    # insertion logic single-path: the body handed to the inserter never has one.
    local stripped
    stripped="$(strip_section < "${body_file}" | cat -s)"
    printf '%s\n' "${stripped}" | insert_section "${section}"
}

# render_section <count> <captions...> <urls...>
render_section() {
    local count="$1"
    shift
    local -a captions=("${@:1:count}")
    local -a urls=("${@:count+1:count}")

    printf '## Screenshots\n'
    printf '%s\n' "${MARKER}"
    printf '\n'
    printf '_Captured live by `/verify-pr` in a real headful browser on the harness box._\n'

    local i
    for ((i = 0; i < count; i++)); do
        printf '\n'
        printf '**%s**\n' "${captions[i]:-Screenshot $((i + 1))}"
        printf '\n'
        printf '![%s](%s)\n' "${captions[i]:-screenshot}" "${urls[i]}"
    done
}

# Drop an existing marked section: from its `## Screenshots` heading through the
# line before the next `## ` heading or `---` rule (or EOF). An unmarked section
# a human wrote by hand is left alone — we only own what we generated.
strip_section() {
    awk -v marker="${MARKER}" '
        BEGIN { in_section = 0; pending = 0 }
        # A heading line is only OUR section if the very next line is the marker,
        # so buffer the heading for one line before deciding.
        pending {
            pending = 0
            if ($0 == marker) { in_section = 1; next }
            print held
        }
        in_section {
            if ($0 ~ /^## / || $0 ~ /^---[[:space:]]*$/) { in_section = 0 }
            else { next }
        }
        /^## Screenshots[[:space:]]*$/ && !in_section { held = $0; pending = 1; next }
        { print }
        END { if (pending) print held }
    '
}

# insert_section <section-text>: body on stdin. Anchor priority:
#   1. before the verification checklist heading (pixels then the boxes);
#   2. else before the trailing `---` rule that carries the generated-by footer;
#   3. else appended at the end.
insert_section() {
    local section="$1"

    awk -v section="${section}" '
        { lines[NR] = $0 }
        /^## Manual verification[[:space:]]*$/ || /^## Human verification required[[:space:]]*$/ {
            if (!checklist) { checklist = NR }
        }
        /^---[[:space:]]*$/ { rule = NR }
        END {
            at = checklist ? checklist : (rule ? rule : 0)
            if (at == 0) {
                for (i = 1; i <= NR; i++) { print lines[i] }
                print ""
                print section
            } else {
                for (i = 1; i < at; i++) {
                    # one blank line before the section, not three
                    if (i == at - 1 && lines[i] ~ /^[[:space:]]*$/) { continue }
                    print lines[i]
                }
                print ""
                print section
                print ""
                for (i = at; i <= NR; i++) { print lines[i] }
            }
        }
    ' | trim_trailing_blanks
}

trim_trailing_blanks() {
    awk '{ lines[NR] = $0 } END {
        last = NR
        while (last > 0 && lines[last] ~ /^[[:space:]]*$/) { last-- }
        for (i = 1; i <= last; i++) { print lines[i] }
    }'
}

main "$@"
