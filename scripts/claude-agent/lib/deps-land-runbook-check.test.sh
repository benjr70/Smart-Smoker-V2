#!/usr/bin/env bash
# Tests for scripts/claude-agent/lib/deps-land-runbook-check.sh
#
# Run: bash scripts/claude-agent/lib/deps-land-runbook-check.test.sh
#
# Strategy (same as pr-watch-runbook-check.test.sh, the prior art): the checker's
# public interface is (a) its exit code + report over a set of files and (b)
# `--list`, the machine-readable table of load-bearing rules it enforces. Tests
# drive it against the REAL files — the shipped `deps-land` skill, afk-pickup's
# §1.2 wiring and the domain glossary must all satisfy every rule — and against
# mutated temp copies produced by deleting one rule phrase at a time. No network,
# no gh, no writes outside mktemp.
#
# Why a text check at all: SKILL.md is the program an Opus agent executes, and
# nothing compiles it. The lane's terminal outcomes, its hand-off sentence and
# its `deps:` report line are parsed by humans and by afk-pickup; a well-meant
# rewrite that drops the "Approve this PR (GitHub review)…" sentence leaves a
# major bump parked with `HITL` and no instructions, and a rewrite that drops
# `superseded` leaves the lane fixing a closed PR. This check makes those
# deletions loud.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
CHECKER="${SCRIPT_DIR}/deps-land-runbook-check.sh"

declare -A FILE_OF=(
    [skill]="${REPO_ROOT}/.claude/skills/deps-land/SKILL.md"
    [pickup]="${REPO_ROOT}/.claude/skills/afk-pickup/SKILL.md"
    [glossary]="${REPO_ROOT}/CONTEXT.md"
)

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
# Test 1: the shipped files satisfy every load-bearing rule (behavior 1 and 2).
#         Run with no arguments so the default path resolution is exercised too
#         — that is how the suite and any CI job call it.
#-------------------------------------------------------------------------------
test_real_files_pass() {
    echo "TEST: the shipped deps-land skill, afk-pickup §1.2 and glossary pass"

    local out rc
    out="$(bash "${CHECKER}" 2>&1)"
    rc=$?

    if [ "${rc}" -eq 0 ]; then
        pass "checker exits 0 on the shipped files"
    else
        fail "checker exits 0 on the shipped files" "exit ${rc}; output: ${out}"
    fi
}

#-------------------------------------------------------------------------------
# Test 2: `--list` publishes the enforced rules as `rule-id<TAB>file<TAB>pattern`
#         lines. The table is the interface: test 3 enumerates it to mutate each
#         file, and a human reading it should see what the lane promises.
#-------------------------------------------------------------------------------
test_list_publishes_rule_table() {
    echo "TEST: --list publishes the rule table (rule-id<TAB>file<TAB>pattern)"

    local listing rc
    listing="$(bash "${CHECKER}" --list)"
    rc=$?

    if [ "${rc}" -ne 0 ]; then
        fail "--list exits 0" "exit ${rc}"
        return
    fi
    pass "--list exits 0"

    local malformed
    malformed="$(printf '%s\n' "${listing}" \
        | grep -cv $'^[a-z0-9-]\+\t\(skill\|pickup\|glossary\)\t.\+$')"
    if [ "${malformed}" -eq 0 ]; then
        pass "every --list line is rule-id<TAB>file<TAB>pattern"
    else
        fail "every --list line is rule-id<TAB>file<TAB>pattern" \
            "${malformed} malformed line(s)"
    fi

    local expected id missing_ids=()
    expected=(pickup-dispatch pickup-merge-site step-order superseded
              handoff-sentence report-line exhaustion-label dependabot-rebase
              tier-a-bot tier-b-force-tour glossary-bot-pr-checklist
              glossary-dependabot-pr conflict-dispatch merge-cmd-line
              tier-a-fresh-sha)
    for id in "${expected[@]}"; do
        if ! printf '%s\n' "${listing}" | cut -f1 | grep -qx "${id}"; then
            missing_ids+=("${id}")
        fi
    done
    if [ "${#missing_ids[@]}" -eq 0 ]; then
        pass "rule table covers every issue #658 acceptance criterion"
    else
        fail "rule table covers every issue #658 acceptance criterion" \
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
# Test 3: deleting any single rule phrase from ITS file fails the check, and the
#         report names the rule that went missing (behaviors 1 and 2). The
#         named-rule half matters as much as the exit code: the point is telling
#         the next editor WHICH sentence they deleted, in which file.
#-------------------------------------------------------------------------------
test_deletion_detected() {
    echo "TEST: dropping a rule phrase from its file fails the check by name"

    local rule fkey pattern mutated out rc undetected=()
    while IFS=$'\t' read -r rule fkey pattern; do
        [ -n "${rule}" ] || continue
        mutated="$(mutate_without "${FILE_OF[${fkey}]}" "${pattern}")"
        out="$(bash "${CHECKER}" "--${fkey}" "${mutated}" 2>&1)"
        rc=$?
        rm -f "${mutated}"
        if [ "${rc}" -ne 1 ] || ! printf '%s' "${out}" | grep -q "rule=${rule}"; then
            undetected+=("${rule}(${fkey}): ${pattern} (exit ${rc})")
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
# Test 4: specifically, a skill that lost the major-bump hand-off sentence fails
#         with exit 1 (behavior 1). Spelled out on its own because that sentence
#         is the lane's entire hand-off to a human: without it a major bump sits
#         labeled `HITL` with nobody told that a GitHub approval is what lands
#         it, and the PR waits forever on a ritual nobody documented.
#-------------------------------------------------------------------------------
test_missing_handoff_sentence_fails() {
    echo "TEST: a skill without the hand-off sentence fails (exit 1)"

    local copy out rc
    copy="$(mktemp)"
    grep -v 'Approve this PR (GitHub review) to let the daemon land it' \
        "${FILE_OF[skill]}" > "${copy}"

    out="$(bash "${CHECKER}" --skill "${copy}" 2>&1)"
    rc=$?
    rm -f "${copy}"

    if [ "${rc}" -ne 1 ]; then
        fail "a missing hand-off sentence must exit 1" "exit ${rc}; output: ${out}"
        return
    fi
    if ! printf '%s' "${out}" | grep -q 'rule=handoff-sentence'; then
        fail "the report must name the handoff-sentence rule" "output: ${out}"
        return
    fi

    pass "a skill without the hand-off sentence fails (exit 1)"
}

#-------------------------------------------------------------------------------
# Test 5: the glossary rules are checked against CONTEXT.md, not the skill —
#         both new terms (behavior 2). A future glossary trim that drops
#         **Dependabot PR** must fail here, or the next spec re-invents the
#         vocabulary this lane already fixed.
#-------------------------------------------------------------------------------
test_glossary_terms_checked() {
    echo "TEST: dropping a glossary term from CONTEXT.md fails (exit 1)"

    local copy out rc
    copy="$(mktemp)"
    grep -v '^\*\*Dependabot PR\*\*' "${FILE_OF[glossary]}" > "${copy}"

    out="$(bash "${CHECKER}" --glossary "${copy}" 2>&1)"
    rc=$?
    rm -f "${copy}"

    if [ "${rc}" -ne 1 ] \
        || ! printf '%s' "${out}" | grep -q 'rule=glossary-dependabot-pr'; then
        fail "a dropped **Dependabot PR** entry must fail as glossary-dependabot-pr" \
            "exit ${rc}; output: ${out}"
        return
    fi

    pass "dropping a glossary term fails, naming the glossary rule"
}

#-------------------------------------------------------------------------------
# Test 6: a missing file is an operator error (exit 2), clearly distinct from a
#         missing rule (exit 1) — otherwise a checker pointed at a moved or
#         renamed SKILL.md reads as "the rules are gone" and a CI job goes red
#         for the wrong reason.
#-------------------------------------------------------------------------------
test_missing_file_is_usage_error() {
    echo "TEST: missing input file exits 2 with the offending path"

    local out rc
    out="$(bash "${CHECKER}" --skill "/nonexistent/deps-land/SKILL.md" 2>&1)"
    rc=$?

    if [ "${rc}" -eq 2 ]; then
        pass "missing input file exits 2"
    else
        fail "missing input file exits 2" "exit ${rc}; output: ${out}"
    fi

    if printf '%s' "${out}" | grep -q "/nonexistent/deps-land/SKILL.md"; then
        pass "error names the missing path"
    else
        fail "error names the missing path" "output: ${out}"
    fi
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "deps-land-runbook-check.sh tests"
echo "=========================================="

test_real_files_pass
test_list_publishes_rule_table
test_deletion_detected
test_missing_handoff_sentence_fails
test_glossary_terms_checked
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
