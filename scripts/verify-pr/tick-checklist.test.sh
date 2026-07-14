#!/usr/bin/env bash
# Tests for scripts/verify-pr/tick-checklist.sh
#
# Run: bash scripts/verify-pr/tick-checklist.test.sh
#
# Pure text transform: given a PR body and the set of item texts that PASSED
# this round (read from stdin, one per line), emit the body with exactly those
# unchecked boxes flipped to `- [x]`. Extracted as a standalone script so the
# box-ticking behavior — the part that mutates a human's PR — is unit-tested,
# not left to live-only skill prose. No injected boundaries needed.
#
# Rules under test:
#   - only `- [ ]` items whose text is in the pass-list are flipped
#   - items NOT in the pass-list stay `- [ ]` (deferred / failed boxes)
#   - already-`- [x]` items are never un-ticked
#   - only the two verification sections are eligible (an identical-text box in
#     another section is left alone)
#   - the rest of the body is preserved verbatim

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TICKER="${SCRIPT_DIR}/tick-checklist.sh"

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

if [ ! -f "${TICKER}" ]; then
    echo "FATAL: ${TICKER} not found"
    exit 2
fi

#-------------------------------------------------------------------------------
# Test 1: only pass-listed items flip; non-listed and already-checked untouched.
#-------------------------------------------------------------------------------
test_flips_only_passed_items() {
    echo "TEST: flips only the passed items, leaves the rest"

    local body_file out
    body_file="$(mktemp)"
    trap "rm -f '${body_file}'" RETURN
    cat > "${body_file}" <<'EOF'
## Manual verification

- [ ] Chart renders at /
- [ ] Deferred deployed-env item
- [x] Previously verified item
EOF

    out="$(printf '%s\n' 'Chart renders at /' | bash "${TICKER}" "${body_file}")"

    if ! printf '%s\n' "${out}" | grep -qxF -- '- [x] Chart renders at /'; then
        fail "a passed item must be ticked" "out:
${out}"
        return
    fi
    if ! printf '%s\n' "${out}" | grep -qxF -- '- [ ] Deferred deployed-env item'; then
        fail "a non-passed item must stay unchecked" "out:
${out}"
        return
    fi
    if ! printf '%s\n' "${out}" | grep -qxF -- '- [x] Previously verified item'; then
        fail "an already-checked item must stay checked" "out:
${out}"
        return
    fi

    pass "flips only the passed items, leaves the rest"
}

#-------------------------------------------------------------------------------
# Test 2: only the verification sections are eligible — an identical-text box in
#         another section is not ticked.
#-------------------------------------------------------------------------------
test_only_verification_sections_eligible() {
    echo "TEST: an identical-text box in a non-verification section is untouched"

    local body_file out accept_line
    body_file="$(mktemp)"
    trap "rm -f '${body_file}'" RETURN
    cat > "${body_file}" <<'EOF'
## Acceptance criteria

- [ ] Shared wording

## Manual verification

- [ ] Shared wording
EOF

    out="$(printf '%s\n' 'Shared wording' | bash "${TICKER}" "${body_file}")"

    # The acceptance box (first occurrence) must remain unchecked.
    accept_line="$(printf '%s\n' "${out}" | grep -nF 'Shared wording' | head -1)"
    if ! printf '%s' "${accept_line}" | grep -qF -- '- [ ] Shared wording'; then
        fail "the acceptance-section box must NOT be ticked" "first occurrence:
${accept_line}
full out:
${out}"
        return
    fi
    # Exactly one box was flipped (the manual one).
    if [ "$(printf '%s\n' "${out}" | grep -cF -- '- [x] Shared wording')" -ne 1 ]; then
        fail "exactly the verification-section box should flip" "out:
${out}"
        return
    fi

    pass "an identical-text box in a non-verification section is untouched"
}

#-------------------------------------------------------------------------------
# Test 3: exact-match only — a pass-list entry that is a substring of a different
#         item does not flip that item.
#-------------------------------------------------------------------------------
test_exact_match_only() {
    echo "TEST: substring does not flip a longer item"

    local body_file out
    body_file="$(mktemp)"
    trap "rm -f '${body_file}'" RETURN
    cat > "${body_file}" <<'EOF'
## Manual verification

- [ ] Login works with valid credentials
EOF

    out="$(printf '%s\n' 'Login works' | bash "${TICKER}" "${body_file}")"

    if printf '%s\n' "${out}" | grep -qF -- '- [x]'; then
        fail "a substring pass-entry must not flip a longer item" "out:
${out}"
        return
    fi

    pass "substring does not flip a longer item"
}

#-------------------------------------------------------------------------------
# Test 4: the rest of the body is preserved verbatim (prose, headings, blanks).
#-------------------------------------------------------------------------------
test_preserves_body() {
    echo "TEST: non-checklist content is preserved verbatim"

    local body_file out
    body_file="$(mktemp)"
    trap "rm -f '${body_file}'" RETURN
    cat > "${body_file}" <<'EOF'
## Summary

This PR does a thing. See #327.

## Manual verification

- [ ] Do the thing
EOF

    out="$(printf '%s\n' 'Do the thing' | bash "${TICKER}" "${body_file}")"

    if ! printf '%s\n' "${out}" | grep -qxF '## Summary'; then
        fail "headings must be preserved" "out:
${out}"
        return
    fi
    if ! printf '%s\n' "${out}" | grep -qxF 'This PR does a thing. See #327.'; then
        fail "prose must be preserved verbatim" "out:
${out}"
        return
    fi

    pass "non-checklist content is preserved verbatim"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "tick-checklist.sh tests"
echo "=========================================="

test_flips_only_passed_items
test_only_verification_sections_eligible
test_exact_match_only
test_preserves_body

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
