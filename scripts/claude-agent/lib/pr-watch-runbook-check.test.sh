#!/usr/bin/env bash
# Tests for scripts/claude-agent/lib/pr-watch-runbook-check.sh
#
# Run: bash scripts/claude-agent/lib/pr-watch-runbook-check.test.sh
#
# Strategy: the checker's public interface is (a) its exit code + report over a
# skill file and (b) `--list`, the machine-readable table of the load-bearing
# rules it enforces. Tests drive it against the REAL skill (the shipped prose
# must satisfy every rule) and against mutated temp copies produced by deleting
# one rule phrase at a time — proving a future edit to SKILL.md cannot silently
# drop the bot mode's label, cap or verdict lines. No network, no gh, no writes
# outside mktemp.
#
# Why a text check at all: SKILL.md is the program an Opus agent executes. There
# is no compiler for it, so the only thing standing between a well-meant rewrite
# and a lane that labels a Dependabot PR `AFK:checks-failed` (or loops forever
# because the cap sentence vanished) is an assertion that the sentences are
# still there.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
CHECKER="${SCRIPT_DIR}/pr-watch-runbook-check.sh"
SKILL_FILE="${REPO_ROOT}/.claude/skills/pr-watch/SKILL.md"

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

if [ ! -f "${CHECKER}" ]; then
    echo "FATAL: ${CHECKER} not found"
    exit 2
fi

#-------------------------------------------------------------------------------
# Test 1: the shipped pr-watch skill carries every load-bearing rule of the bot
#         mode (behavior 1; AC 3, AC 5). Run with no arguments, so the default
#         path resolution is exercised too — the lane calls it that way from CI.
#-------------------------------------------------------------------------------
test_real_skill_passes() {
    echo "TEST: the shipped pr-watch SKILL.md satisfies every runbook rule"

    local out rc
    out="$(bash "${CHECKER}" 2>&1)"
    rc=$?

    if [ "${rc}" -eq 0 ]; then
        pass "checker exits 0 on the shipped skill"
    else
        fail "checker exits 0 on the shipped skill" "exit ${rc}; output: ${out}"
    fi
}

#-------------------------------------------------------------------------------
# Test 2: `--list` publishes the enforced rules as `rule-id<TAB>pattern` lines,
#         covering both modes' verdict lines and both labels. The table is the
#         interface: test 3 enumerates it to mutate the skill, and a human
#         reading it should be able to see what the bot mode promises.
#-------------------------------------------------------------------------------
test_list_publishes_rule_table() {
    echo "TEST: --list publishes the rule table (rule-id<TAB>pattern)"

    local listing rc
    listing="$(bash "${CHECKER}" --list)"
    rc=$?

    if [ "${rc}" -ne 0 ]; then
        fail "--list exits 0" "exit ${rc}"
        return
    fi
    pass "--list exits 0"

    local malformed
    malformed="$(printf '%s\n' "${listing}" | grep -cv $'^[a-z-]\+\t.\+$')"
    if [ "${malformed}" -eq 0 ]; then
        pass "every --list line is rule-id<TAB>pattern"
    else
        fail "every --list line is rule-id<TAB>pattern" "${malformed} malformed line(s)"
    fi

    local expected id missing_ids=()
    expected=(bot-flag bot-verdict-pass bot-verdict-draft bot-label
              default-label default-verdict bot-cap fix-marker skip-trailer
              lockfile-recipe)
    for id in "${expected[@]}"; do
        if ! printf '%s\n' "${listing}" | cut -f1 | grep -qx "${id}"; then
            missing_ids+=("${id}")
        fi
    done
    if [ "${#missing_ids[@]}" -eq 0 ]; then
        pass "rule table covers every issue #657 acceptance criterion"
    else
        fail "rule table covers every issue #657 acceptance criterion" \
            "missing: ${missing_ids[*]}"
    fi
}

# Write a copy of ${1} with every occurrence of the regex ${2} deleted. The copy
# is whitespace-normalized first so a phrase Prettier wrapped across markdown
# lines is still removed (the checker normalizes the same way).
mutate_without() {
    local src="$1" pattern="$2" out d
    out="$(mktemp)"
    d=$'\001'
    tr '\n' ' ' < "${src}" | tr -s '[:space:]' ' ' \
        | sed -E "s${d}${pattern}${d}${d}gI" > "${out}"
    echo "${out}"
}

#-------------------------------------------------------------------------------
# Test 3: deleting any single rule phrase from the skill fails the check, and
#         the report names the rule that went missing (behavior 1; AC 3, AC 5).
#         The named-rule half matters as much as the exit code: the whole point
#         is telling the next editor WHICH sentence they deleted.
#-------------------------------------------------------------------------------
test_deletion_detected() {
    echo "TEST: dropping a runbook rule from SKILL.md fails the check by name"

    local rule pattern mutated out rc undetected=()
    while IFS=$'\t' read -r rule pattern; do
        [ -n "${rule}" ] || continue
        mutated="$(mutate_without "${SKILL_FILE}" "${pattern}")"
        out="$(bash "${CHECKER}" "${mutated}" 2>&1)"
        rc=$?
        rm -f "${mutated}"
        if [ "${rc}" -ne 1 ] || ! printf '%s' "${out}" | grep -q "rule=${rule}"; then
            undetected+=("${rule}: ${pattern} (exit ${rc})")
        fi
    done < <(bash "${CHECKER}" --list)

    if [ "${#undetected[@]}" -eq 0 ]; then
        pass "deleting any single rule phrase fails the check, naming the rule"
    else
        fail "deleting any single rule phrase fails the check, naming the rule" \
            "undetected: ${undetected[*]}"
    fi
}

#-------------------------------------------------------------------------------
# Test 4: specifically, a skill that lost the bot DRAFT verdict line fails with
#         exit 1 (AC 5). Spelled out on its own because that one line is the
#         lane's entire hand-off to a human: without it the exhaustion path
#         returns something the caller cannot parse, and the PR sits drafted
#         with nobody told why.
#-------------------------------------------------------------------------------
test_missing_bot_draft_line_fails() {
    echo "TEST: a skill without the bot DRAFT verdict line fails (exit 1)"

    local copy out rc
    copy="$(mktemp)"
    grep -v 'exhausted 3 attempts, marked draft, AFK:deps-failed' \
        "${SKILL_FILE}" > "${copy}"

    out="$(bash "${CHECKER}" "${copy}" 2>&1)"
    rc=$?
    rm -f "${copy}"

    if [ "${rc}" -ne 1 ]; then
        fail "a missing bot DRAFT line must exit 1" "exit ${rc}; output: ${out}"
        return
    fi
    if ! printf '%s' "${out}" | grep -q 'rule=bot-verdict-draft'; then
        fail "the report must name the bot-verdict-draft rule" "output: ${out}"
        return
    fi

    pass "a skill without the bot DRAFT verdict line fails (exit 1)"
}

#-------------------------------------------------------------------------------
# Test 5: a missing skill file is an operator error (exit 2), clearly distinct
#         from a missing rule (exit 1) — otherwise a checker pointed at a moved
#         or renamed SKILL.md would read as "the rules are gone" and a CI job
#         would be red for the wrong reason.
#-------------------------------------------------------------------------------
test_missing_file_is_usage_error() {
    echo "TEST: missing skill file exits 2 with the offending path"

    local out rc
    out="$(bash "${CHECKER}" "/nonexistent/pr-watch/SKILL.md" 2>&1)"
    rc=$?

    if [ "${rc}" -eq 2 ]; then
        pass "missing skill file exits 2"
    else
        fail "missing skill file exits 2" "exit ${rc}; output: ${out}"
    fi

    if printf '%s' "${out}" | grep -q "/nonexistent/pr-watch/SKILL.md"; then
        pass "error names the missing path"
    else
        fail "error names the missing path" "output: ${out}"
    fi
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "pr-watch-runbook-check.sh tests"
echo "=========================================="

test_real_skill_passes
test_list_publishes_rule_table
test_deletion_detected
test_missing_bot_draft_line_fails
test_missing_file_is_usage_error

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
