#!/usr/bin/env bash
# Tests for scripts/verify-pr/parse-checklist.sh
#
# Run: bash scripts/verify-pr/parse-checklist.test.sh
#
# The parser is a pure text transform (PR body markdown -> the unchecked
# verification items the /verify-pr round must act on), so it needs no injected
# boundaries: every test feeds a body on stdin and asserts on stdout. It exists
# as a standalone script precisely so this behavior is unit-tested away from the
# live-only skill/agent prose (per the issue's testing-priority note).
#
# Output contract (one item per line, tab-separated):
#   <section>\t<item text>
# where <section> is `manual` (## Manual verification) or `human`
# (## Human verification required). Only `- [ ]` (unchecked) items under those
# two sections are emitted; ticked items and items in any other section are
# skipped.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARSER="${SCRIPT_DIR}/parse-checklist.sh"

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

#-------------------------------------------------------------------------------
# Test 1: unchecked items under both target sections are emitted with the right
#         section tag; ticked items are skipped.
#-------------------------------------------------------------------------------
test_extracts_unchecked_from_both_sections() {
    echo "TEST: extracts unchecked items from both target sections, tagged"

    local body out
    body="$(cat <<'EOF'
## Summary

Some prose about the change.

## Manual verification

- [ ] Frontend renders the temperature chart at /
- [x] Backend /api/health returns 200
- [ ] Settings page saves a new probe name

## Human verification required

- [ ] Physical probe reads ambient temperature within 2 degrees
EOF
)"
    out="$(printf '%s\n' "${body}" | bash "${PARSER}")"

    if ! printf '%s\n' "${out}" | grep -qxF $'manual\tFrontend renders the temperature chart at /'; then
        fail "unchecked manual item must be emitted with 'manual' tag" "out:
${out}"
        return
    fi
    if ! printf '%s\n' "${out}" | grep -qxF $'manual\tSettings page saves a new probe name'; then
        fail "second unchecked manual item must be emitted" "out:
${out}"
        return
    fi
    if ! printf '%s\n' "${out}" | grep -qxF $'human\tPhysical probe reads ambient temperature within 2 degrees'; then
        fail "unchecked human item must be emitted with 'human' tag" "out:
${out}"
        return
    fi
    if printf '%s\n' "${out}" | grep -qF 'Backend /api/health returns 200'; then
        fail "already-ticked item must NOT be emitted" "out:
${out}"
        return
    fi

    pass "extracts unchecked items from both target sections, tagged"
}

#-------------------------------------------------------------------------------
# Test 2: checklist items in unrelated sections (e.g. Acceptance criteria) are
#         ignored — only the two verification sections count.
#-------------------------------------------------------------------------------
test_ignores_other_sections() {
    echo "TEST: ignores checklist items outside the verification sections"

    local body out
    body="$(cat <<'EOF'
## Acceptance criteria

- [ ] This is a spec box, not a verification item
- [ ] Another acceptance box

## Manual verification

- [ ] Real verification item
EOF
)"
    out="$(printf '%s\n' "${body}" | bash "${PARSER}")"

    if printf '%s\n' "${out}" | grep -qF 'spec box'; then
        fail "acceptance-criteria boxes must be ignored" "out:
${out}"
        return
    fi
    if [ "$(printf '%s\n' "${out}" | grep -c '.')" -ne 1 ]; then
        fail "exactly one verification item expected" "out:
${out}"
        return
    fi
    if ! printf '%s\n' "${out}" | grep -qxF $'manual\tReal verification item'; then
        fail "the single manual item must be emitted" "out:
${out}"
        return
    fi

    pass "ignores checklist items outside the verification sections"
}

#-------------------------------------------------------------------------------
# Test 3: header matching is case-insensitive and a section ends at the next
#         heading (items after the section's heading but before the next one).
#-------------------------------------------------------------------------------
test_header_case_insensitive_and_section_bounded() {
    echo "TEST: case-insensitive headers; a section stops at the next heading"

    local body out
    body="$(cat <<'EOF'
### MANUAL VERIFICATION

- [ ] Item inside the section

## Notes

- [ ] Item after the section ends
EOF
)"
    out="$(printf '%s\n' "${body}" | bash "${PARSER}")"

    if ! printf '%s\n' "${out}" | grep -qxF $'manual\tItem inside the section'; then
        fail "uppercase header must still match" "out:
${out}"
        return
    fi
    if printf '%s\n' "${out}" | grep -qF 'after the section ends'; then
        fail "items after the next heading must not leak into the section" "out:
${out}"
        return
    fi

    pass "case-insensitive headers; a section stops at the next heading"
}

#-------------------------------------------------------------------------------
# Test 4: a body with no verification section (or no unchecked items) produces no
#         output and exits 0 — the skill treats zero items as "nothing to do".
#-------------------------------------------------------------------------------
test_no_items_empty_output_exit_zero() {
    echo "TEST: no verification items -> empty output, exit 0"

    local body out exit_code
    body="$(cat <<'EOF'
## Summary

Nothing to verify here.

## Manual verification

- [x] Already done
EOF
)"
    out="$(printf '%s\n' "${body}" | bash "${PARSER}")"
    exit_code=$?

    if [ "${exit_code}" -ne 0 ]; then
        fail "must exit 0 even with no unchecked items" "exit=${exit_code}"
        return
    fi
    if [ -n "${out}" ]; then
        fail "output must be empty when there are no unchecked items" "out:
${out}"
        return
    fi

    pass "no verification items -> empty output, exit 0"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "parse-checklist.sh tests"
echo "=========================================="

test_extracts_unchecked_from_both_sections
test_ignores_other_sections
test_header_case_insensitive_and_section_bounded
test_no_items_empty_output_exit_zero

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
