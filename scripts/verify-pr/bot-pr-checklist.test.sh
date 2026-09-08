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
# fails; an item passes when it names something a verifier can see: an HTTP
# `200`, a screen that renders, a value that persists, or the console.
#-------------------------------------------------------------------------------
items_missing_observable() {
    local file="$1" line text
    local bad=0
    while IFS=$'\t' read -r _ text; do
        [ -n "${text}" ] || continue
        line="$(printf '%s' "${text}" | tr '[:upper:]' '[:lower:]')"
        if [[ "${line}" != *200* ]] &&
            [[ "${line}" != *render* ]] &&
            [[ "${line}" != *persist* ]] &&
            [[ "${line}" != *console* ]]; then
            printf 'no observable: %s\n' "${text}"
            bad=1
        fi
    done < <(bash "${PARSER}" "${file}")
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
# Test 3: the file opens with the v1 marker on its FIRST line and puts the items
#         under the heading the parser tags `manual`. The lane keys its
#         inject-once decision on that exact marker, and an item under any other
#         heading is invisible to the round.
#-------------------------------------------------------------------------------
test_marker_first_line_and_manual_heading() {
    echo "TEST: first line is the v1 marker; items sit under Manual verification"

    local first
    first="$(head -n 1 "${CHECKLIST}")"
    if [ "${first}" != '<!-- bot-pr-checklist v1 -->' ]; then
        fail "first line must be the v1 marker" "got: ${first}"
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

    pass "first line is the v1 marker; items sit under Manual verification"
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
