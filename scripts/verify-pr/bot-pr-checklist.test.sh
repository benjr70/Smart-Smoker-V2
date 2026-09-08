#!/usr/bin/env bash
# Tests for scripts/verify-pr/bot-pr-checklist.md
#
# Run: bash scripts/verify-pr/bot-pr-checklist.test.sh
#
# The Bot-PR checklist is the fixed `## Manual verification` section the
# `deps-land` lane injects into every Dependabot PR body before its Tier B
# round. Nothing executes the file — its whole contract is how the existing
# checklist parser (parse-checklist.sh) reads it, so these tests feed the real
# file through the real parser and assert on the emitted items. If the file ever
# drifts out of the shape `/verify-pr` expects (marker missing, heading renamed,
# an item pre-ticked, an item with no observable), the round would silently
# verify the wrong number of things on every Dependabot PR.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARSER="${SCRIPT_DIR}/parse-checklist.sh"
CHECKLIST="${SCRIPT_DIR}/bot-pr-checklist.md"

TESTS_RUN=0
TESTS_FAILED=0
FAILED_NAMES=()

pass() {
    TESTS_RUN=$((TESTS_RUN + 1))
    echo "  PASS: $1"
}

fail() {
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILED_NAMES+=("$1")
    echo "  FAIL: $1"
    if [ -n "${2:-}" ]; then
        echo "    $2"
    fi
}

if [ ! -f "${PARSER}" ]; then
    echo "FATAL: ${PARSER} not found"
    exit 2
fi
if [ ! -f "${CHECKLIST}" ]; then
    echo "FATAL: ${CHECKLIST} not found"
    exit 2
fi

#-------------------------------------------------------------------------------
# Test 1: the parser emits exactly six items from the file, every one tagged
#         `manual` and none pre-ticked — the Tier B round must always have all
#         six mini-journey steps to run.
#-------------------------------------------------------------------------------
test_yields_six_unticked_manual_items() {
    echo "TEST: parser emits exactly six unticked, manual-tagged items"

    local out count non_manual
    out="$(bash "${PARSER}" "${CHECKLIST}")"

    count="$(printf '%s\n' "${out}" | grep -c '.')"
    if [ "${count}" -ne 6 ]; then
        fail "checklist must yield exactly six items, got ${count}" "out:
${out}"
        return
    fi

    non_manual="$(printf '%s\n' "${out}" | grep -cv $'^manual\t')"
    if [ "${non_manual}" -ne 0 ]; then
        fail "every item must be tagged 'manual'" "out:
${out}"
        return
    fi

    # A pre-ticked box would never reach the parser's output, so a shipped file
    # with `- [x]` shows up as a missing item; assert directly on the source too.
    if grep -qiE '^[[:space:]]*[-*][[:space:]]+\[x\]' "${CHECKLIST}"; then
        fail "no checklist item may ship pre-ticked" "$(grep -inE '^[[:space:]]*[-*][[:space:]]+\[x\]' "${CHECKLIST}")"
        return
    fi

    pass "parser emits exactly six unticked, manual-tagged items"
}

#-------------------------------------------------------------------------------
# The observable guard, as a function of a checklist file, so the tests can
# prove it REJECTS a checklist that names no observable as well as accept the
# shipped one. Prints the offending items and returns non-zero when any item
# fails, when the parser fails, or when the parser emits nothing at all (an
# empty parse is a broken checklist, not a checklist whose every item passes).
#
# Every item ends in "no console errors", so the blanket console clause is
# stripped before the allowlist is applied: an item has to name an observable
# of its OWN — an HTTP `200`, a screen that renders, a value that updates or
# persists, a list that lists it — not just promise a quiet console.
#-------------------------------------------------------------------------------
items_missing_observable() {
    local file="$1" out text line
    local bad=0

    if ! out="$(bash "${PARSER}" "${file}")"; then
        printf 'parser failed on: %s\n' "${file}"
        return 1
    fi
    if [ "$(printf '%s\n' "${out}" | grep -c '.')" -eq 0 ]; then
        printf 'parser emitted no items: %s\n' "${file}"
        return 1
    fi

    while IFS=$'\t' read -r _ text; do
        [ -n "${text}" ] || continue
        # Strip the blanket "no console errors" clause first, so it cannot be
        # the thing that satisfies the allowlist.
        line="$(printf '%s' "${text}" \
            | tr '[:upper:]' '[:lower:]' \
            | sed -E 's/,?[[:space:]]*no (uncaught )?console errors?//g')"
        if [[ "${line}" != *200* ]] &&
            [[ "${line}" != *render* ]] &&
            [[ "${line}" != *persist* ]] &&
            [[ "${line}" != *updat* ]] &&
            [[ "${line}" != *list* ]]; then
            printf 'no observable: %s\n' "${text}"
            bad=1
        fi
    done <<<"${out}"
    return "${bad}"
}

#-------------------------------------------------------------------------------
# Test 2: every emitted item names an observable, and none of them needs
#         anything the hermetic stack cannot provide (hardware, a deployed
#         environment). An item a verifier cannot observe can only be deferred,
#         and on a Bot PR a deferral counts as a failure.
#-------------------------------------------------------------------------------
test_every_item_names_an_observable() {
    echo "TEST: every item names an observable and stays hermetic"

    local offenders
    if ! offenders="$(items_missing_observable "${CHECKLIST}")"; then
        fail "every checklist item must name an observable" "${offenders}"
        return
    fi

    # The guard must be able to fail: an item with an action but no observable
    # is rejected. Without this, an allowlist typo would pass everything.
    local bogus
    bogus="$(mktemp)"
    cat >"${bogus}" <<'EOF'
## Manual verification

- [ ] Click around the app for a while
EOF
    if items_missing_observable "${bogus}" >/dev/null; then
        rm -f "${bogus}"
        fail "observable guard must reject an item with no observable"
        return
    fi
    rm -f "${bogus}"

    # ...and the blanket "no console errors" clause every item carries must not
    # be what satisfies it, or the guard is tautological: a pure action plus
    # that clause names nothing a verifier can point at, and an item like that
    # can only be deferred.
    local console_only
    console_only="$(mktemp)"
    cat >"${console_only}" <<'EOF'
## Manual verification

- [ ] Restart the stack, no console errors
EOF
    if items_missing_observable "${console_only}" >/dev/null; then
        rm -f "${console_only}"
        fail "observable guard must reject an item whose only observable is the console clause"
        return
    fi
    rm -f "${console_only}"

    # An empty parse (parser regression, heading renamed, unreadable file) is a
    # failure, not "every item has an observable".
    local empty
    empty="$(mktemp)"
    cat >"${empty}" <<'EOF'
## Some other section

- [ ] Nothing the round can see
EOF
    if items_missing_observable "${empty}" >/dev/null; then
        rm -f "${empty}"
        fail "observable guard must reject a checklist the parser reads as empty"
        return
    fi
    rm -f "${empty}"

    # Hermetic-only: no item may lean on hardware or a deployed environment.
    local forbidden
    forbidden="$(bash "${PARSER}" "${CHECKLIST}" |
        grep -iE 'physical|hardware|thermocouple|arduino|prod|deployed|dev-cloud|tailscale' || true)"
    if [ -n "${forbidden}" ]; then
        fail "items must be executable against the hermetic stack alone" "${forbidden}"
        return
    fi

    pass "every item names an observable and stays hermetic"
}

#-------------------------------------------------------------------------------
# Test 3: the file opens with the v1 marker on its FIRST line, closes the
#         injected block with `<!-- /bot-pr-checklist -->`, and puts the items
#         under the heading the parser tags `manual` — all of it INSIDE that
#         block. The lane appends the block verbatim and keys its inject-once
#         decision on the marker, so a marker outside the block would never
#         reach the PR body and the lane would append a second copy on every
#         fire. Parsing the block on its own has to yield the same six items as
#         parsing the whole file.
#-------------------------------------------------------------------------------
test_marker_first_line_and_manual_heading() {
    echo "TEST: v1 marker opens the injected block; items sit under Manual verification"

    local first
    first="$(head -n 1 "${CHECKLIST}")"
    if [ "${first}" != '<!-- bot-pr-checklist v1 -->' ]; then
        fail "first line must be the v1 marker" "got: ${first}"
        return
    fi

    local close_line
    close_line="$(grep -nxF '<!-- /bot-pr-checklist -->' "${CHECKLIST}" | head -n 1 | cut -d: -f1)"
    if [ -z "${close_line}" ]; then
        fail "the injected block must be closed by '<!-- /bot-pr-checklist -->'"
        return
    fi

    if ! grep -qxF '## Manual verification' "${CHECKLIST}"; then
        fail "items must sit under a '## Manual verification' heading" \
            "$(grep -nE '^#+ ' "${CHECKLIST}")"
        return
    fi

    # Any heading after the items would end the section for the parser, so the
    # Manual verification heading must be the only one in the file.
    local headings
    headings="$(grep -cE '^[[:space:]]*#+[[:space:]]' "${CHECKLIST}")"
    if [ "${headings}" -ne 1 ]; then
        fail "the file must carry exactly one heading, got ${headings}" \
            "$(grep -nE '^[[:space:]]*#+[[:space:]]' "${CHECKLIST}")"
        return
    fi

    # The block the lane appends — line 1 through the closing marker — must
    # carry the marker, the heading and all six boxes on its own.
    local block block_items
    block="$(sed -n "1,${close_line}p" "${CHECKLIST}")"
    if ! printf '%s\n' "${block}" | grep -qxF '<!-- bot-pr-checklist v1 -->'; then
        fail "the injected block must carry the v1 marker"
        return
    fi
    block_items="$(printf '%s\n' "${block}" | bash "${PARSER}" | grep -c '.')"
    if [ "${block_items}" -ne 6 ]; then
        fail "the injected block alone must yield six items, got ${block_items}" \
            "block:
${block}"
        return
    fi

    # Prettier reflows this file at printWidth 80 (proseWrap: always), and a
    # re-wrapped item loses its tail to a continuation line the parser cannot
    # see. Keep every box on one line.
    local long
    long="$(grep -nE '^[[:space:]]*[-*][[:space:]]+\[' "${CHECKLIST}" \
        | awk -F: '{ line = substr($0, index($0, ":") + 1); if (length(line) > 80) print $1": "length(line) }')"
    if [ -n "${long}" ]; then
        fail "no checklist item may exceed 80 characters (Prettier would wrap it)" "${long}"
        return
    fi

    pass "v1 marker opens the injected block; items sit under Manual verification"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "bot-pr-checklist.md tests"
echo "=========================================="

test_yields_six_unticked_manual_items
test_every_item_names_an_observable
test_marker_first_line_and_manual_heading

echo ""
echo "=========================================="
echo "Ran: ${TESTS_RUN} | Failed: ${TESTS_FAILED}"
echo "=========================================="

if [ "${TESTS_FAILED}" -gt 0 ]; then
    echo "Failed tests:"
    for name in "${FAILED_NAMES[@]}"; do
        echo "  - ${name}"
    done
    exit 1
fi

exit 0
