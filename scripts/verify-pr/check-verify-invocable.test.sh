#!/usr/bin/env bash
# Tests for scripts/verify-pr/check-verify-invocable.sh
#
# Run: bash scripts/verify-pr/check-verify-invocable.test.sh
#
# Strategy: the checker's public interface is (a) its exit code + report over the
# three skill definitions that make up the automated verification round and (b)
# `--list`, the machine-readable table of the invocability rules it enforces.
# Tests drive it against the REAL shipped skills (which must satisfy every rule)
# and against mutated temp copies — a re-added `disable-model-invocation` flag, a
# restored "reserved for explicit user invocation" sentence, a deleted
# non-skippable routing rule — proving a future edit cannot silently re-break the
# pipeline's last quality gate. No filesystem writes outside mktemp, no network.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CHECKER="${SCRIPT_DIR}/check-verify-invocable.sh"
VERIFY_SKILL="${REPO_ROOT}/.claude/skills/verify-pr/SKILL.md"
PICKUP_SKILL="${REPO_ROOT}/.claude/skills/team-pickup/SKILL.md"
RECONCILE_SKILL="${REPO_ROOT}/.claude/skills/pr-reconcile/SKILL.md"

TESTS_RUN=0
TESTS_FAILED=0
# Newline-delimited, not an array: `${arr[@]}` on an empty array aborts under
# `set -u` on bash 3.2 (macOS's system bash), which would fail the suite on a
# healthy tree.
FAILED_NAMES=""

pass() {
    TESTS_RUN=$((TESTS_RUN + 1))
    echo "  PASS: $1"
}

fail() {
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILED_NAMES="${FAILED_NAMES}$1
"
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
# Test 1: the shipped skills satisfy every invocability rule — the `Skill` tool
#         and `Agent`-tool subagents can reach the harness (AC 1, behavior 1).
#-------------------------------------------------------------------------------
test_real_definitions_pass() {
    echo "TEST: shipped verify-pr/team-pickup/pr-reconcile satisfy every rule"

    local out rc
    out="$(bash "${CHECKER}" 2>&1)"
    rc=$?

    if [ "${rc}" -eq 0 ]; then
        pass "checker exits 0 on the shipped skills"
    else
        fail "checker exits 0 on the shipped skills" "exit ${rc}; output: ${out}"
    fi
}

#-------------------------------------------------------------------------------
# Test 2: re-adding `disable-model-invocation` to the verify-pr frontmatter is
#         caught. This is the exact regression that made every automated
#         verification round impossible (#467, behavior 1 / AC 1).
#-------------------------------------------------------------------------------
test_reintroduced_flag_is_caught() {
    echo "TEST: re-adding disable-model-invocation to the frontmatter fails"

    local mutated out rc
    mutated="$(mktemp)"
    # Re-insert the flag right after the opening `---` fence, exactly as it read
    # before this issue.
    awk 'NR==1 && $0=="---" { print; print "disable-model-invocation: true"; next } { print }' \
        "${VERIFY_SKILL}" > "${mutated}"

    out="$(bash "${CHECKER}" "${mutated}" "${PICKUP_SKILL}" "${RECONCILE_SKILL}" 2>&1)"
    rc=$?
    rm -f "${mutated}"

    if [ "${rc}" -eq 1 ]; then
        pass "checker exits 1 when the flag is back"
    else
        fail "checker exits 1 when the flag is back" "exit ${rc}; output: ${out}"
    fi

    if grep -q 'disable-model-invocation' <<< "${out}"; then
        pass "report names the offending flag"
    else
        fail "report names the offending flag" "output: ${out}"
    fi
}

#-------------------------------------------------------------------------------
# Test 3: the verify-pr body may not re-acquire a human-only caller assumption.
#         The frontmatter flag was only half the block: prose telling the model
#         the skill is "reserved for explicit user invocation" forecloses the
#         delegation paths just as effectively (AC 5).
#-------------------------------------------------------------------------------
test_human_only_wording_is_caught() {
    echo "TEST: human-only caller wording in the verify-pr body fails"

    local phrase mutated out rc
    for phrase in \
        "This skill is reserved for explicit user invocation." \
        "Ask the user to run /verify-pr themselves — it cannot be invoked via the Skill tool."; do
        mutated="$(mktemp)"
        { cat "${VERIFY_SKILL}"; printf '\n%s\n' "${phrase}"; } > "${mutated}"

        out="$(bash "${CHECKER}" "${mutated}" "${PICKUP_SKILL}" "${RECONCILE_SKILL}" 2>&1)"
        rc=$?
        rm -f "${mutated}"

        if [ "${rc}" -eq 1 ] && grep -q 'rule=no-human-only' <<< "${out}"; then
            pass "rejected: ${phrase}"
        else
            fail "rejected: ${phrase}" "exit ${rc}; output: ${out}"
        fi
    done
}

# Echo a whitespace-normalized copy of ${1} (matching how the checker reads it),
# so a phrase wrapped across markdown lines by Prettier is still greppable.
normalized() {
    sed -E 's/^[[:space:]]*>[[:space:]]?//' "$1" | tr '\n' ' ' | tr -s '[:space:]' ' '
}

#-------------------------------------------------------------------------------
# Test 4: the shipped verify-pr skill positively licenses its automated callers.
#         Removing the refusal is not enough — a model reading the skill has to
#         know that a `Skill`-tool call and an `Agent`-tool subagent are ordinary
#         legitimate entry points, otherwise it defers to a human anyway (AC 1,
#         AC 2, behavior 1).
#-------------------------------------------------------------------------------
test_skill_licenses_automated_callers() {
    echo "TEST: verify-pr skill names its automated callers as legitimate"

    local text
    text="$(normalized "${VERIFY_SKILL}")"

    local phrase
    for phrase in \
        'Skill.{0,4}tool' \
        'Agent.{0,4}tool' \
        'team-pickup' \
        'pr-reconcile'; do
        if grep -Eqi -- "${phrase}" <<< "${text}"; then
            pass "invocation section mentions: ${phrase}"
        else
            fail "invocation section mentions: ${phrase}" "not found in ${VERIFY_SKILL}"
        fi
    done

    # And the checker must enforce that, so a future edit cannot drop it.
    if bash "${CHECKER}" --list | cut -f1 | grep -qx 'any-caller'; then
        pass "checker enforces an any-caller rule"
    else
        fail "checker enforces an any-caller rule" "no any-caller rule in --list"
    fi
}

#-------------------------------------------------------------------------------
# Test 5: both automated callers make the round NON-SKIPPABLE. A fire whose
#         verification round could not run must park with a failure label and an
#         explanatory PR comment — never reach `result: PASS`, never report the
#         absent round as an ordinary skip. This is the property whose absence
#         let three consecutive PR #460 fires land green with no verification at
#         all (AC 4, behavior 3).
#
#         The asserted phrases are the park block's OWN wording, not the generic
#         `team:checks-failed` / `gh pr comment` that the older escalation paths
#         in these files already satisfy — including the `gh pr ready --undo`
#         draft flip, without which PR Triage (pr_triage_pick skips drafts and
#         PR labels only) re-picks the parked PR as `incomplete` every fire.
#-------------------------------------------------------------------------------
test_round_is_non_skippable_in_both_callers() {
    echo "TEST: team-pickup and pr-reconcile cannot PASS without a round"

    local skill name text phrase
    for skill in "${PICKUP_SKILL}" "${RECONCILE_SKILL}"; do
        name="$(basename "$(dirname "${skill}")")"
        text="$(normalized "${skill}")"
        for phrase in \
            'verify: MISSING' \
            'never be reported as .{0,4}result: PASS' \
            'Manual verification round did not run' \
            'no verification evidence exists for this PR' \
            'gh pr ready "\$PR_NUM" --undo' \
            'gh pr edit +"\$PR_NUM" --add-label team:checks-failed' \
            'drafting is what takes the PR out of the .{0,4}incomplete.{0,4} class'; do
            if grep -Eqi -- "${phrase}" <<< "${text}"; then
                pass "${name} carries: ${phrase}"
            else
                fail "${name} carries: ${phrase}" "not found in ${skill}"
            fi
        done
    done

    if bash "${CHECKER}" --list | cut -f1 | grep -qx 'round-non-skippable'; then
        pass "checker enforces a round-non-skippable rule"
    else
        fail "checker enforces a round-non-skippable rule" "no such rule in --list"
    fi
}

# Write a copy of ${1} with every occurrence of the regex ${2} deleted. The copy
# is whitespace-normalized first so a phrase wrapped across markdown lines is
# still removed (the checker normalizes the same way). Echoes the temp path.
#
# Case-insensitivity is done by folding BOTH the text and the pattern to lower
# case rather than with sed's `I` flag, which is a GNU extension BSD sed rejects
# (the mutation would silently no-op on macOS and the suite would report a
# healthy tree as broken). Folding the copy is safe: the checker matches
# case-insensitively, so every other rule still holds over the lower-cased text.
mutate_without() {
    local src="$1" pattern="$2" out d lc_pattern
    out="$(mktemp)"
    d=$'\001'
    lc_pattern="$(printf '%s' "${pattern}" | tr '[:upper:]' '[:lower:]')"
    tr '\n' ' ' < "${src}" | tr -s '[:space:]' ' ' | tr '[:upper:]' '[:lower:]' \
        | sed -E "s${d}${lc_pattern}${d}${d}g" > "${out}"
    echo "${out}"
}

#-------------------------------------------------------------------------------
# Test 6: deleting any single REQUIRED phrase from the skill that owns it fails
#         the check, naming the rule. Without this, a future rewrite of any of
#         the three skills could quietly drop the invocability contract or the
#         non-skippable routing and the pipeline would go back to passing PRs
#         with no verification behind them (AC 4, AC 5).
#-------------------------------------------------------------------------------
test_dropping_any_required_phrase_is_caught() {
    echo "TEST: deleting any required phrase from its skill fails the check"

    local rule target mode pattern mutated out rc
    local v p r
    # Newline-delimited string, not an array: see FAILED_NAMES — an empty array
    # expansion aborts under `set -u` on bash 3.2.
    local undetected=""

    while IFS=$'\t' read -r rule target mode pattern; do
        [ -n "${rule}" ] || continue
        [ "${mode}" = "require" ] || continue

        v="${VERIFY_SKILL}"; p="${PICKUP_SKILL}"; r="${RECONCILE_SKILL}"
        case "${target}" in
            verify)    mutated="$(mutate_without "${VERIFY_SKILL}" "${pattern}")";    v="${mutated}" ;;
            pickup)    mutated="$(mutate_without "${PICKUP_SKILL}" "${pattern}")";    p="${mutated}" ;;
            reconcile) mutated="$(mutate_without "${RECONCILE_SKILL}" "${pattern}")"; r="${mutated}" ;;
            *) continue ;;
        esac

        out="$(bash "${CHECKER}" "${v}" "${p}" "${r}" 2>&1)"
        rc=$?
        rm -f "${mutated}"

        if [ "${rc}" -ne 1 ] || ! grep -q "rule=${rule}" <<< "${out}"; then
            undetected="${undetected}${rule}/${target}: ${pattern} (exit ${rc}); "
        fi
    done < <(bash "${CHECKER}" --list)

    if [ -z "${undetected}" ]; then
        pass "every required phrase is load-bearing"
    else
        fail "every required phrase is load-bearing" "undetected: ${undetected}"
    fi
}

#-------------------------------------------------------------------------------
# Test 7: a missing skill file is an operator error (exit 2), clearly
#         distinguished from a violated rule (exit 1).
#-------------------------------------------------------------------------------
test_missing_file_is_usage_error() {
    echo "TEST: missing skill file exits 2 with the offending path"

    local out rc
    out="$(bash "${CHECKER}" "/nonexistent/SKILL.md" "${PICKUP_SKILL}" "${RECONCILE_SKILL}" 2>&1)"
    rc=$?

    if [ "${rc}" -eq 2 ]; then
        pass "missing skill file exits 2"
    else
        fail "missing skill file exits 2" "exit ${rc}; output: ${out}"
    fi

    if grep -q "/nonexistent/SKILL.md" <<< "${out}"; then
        pass "error names the missing path"
    else
        fail "error names the missing path" "output: ${out}"
    fi
}

main() {
    echo "=========================================="
    echo "check-verify-invocable.sh tests"
    echo "=========================================="

    test_real_definitions_pass
    test_reintroduced_flag_is_caught
    test_human_only_wording_is_caught
    test_skill_licenses_automated_callers
    test_round_is_non_skippable_in_both_callers
    test_dropping_any_required_phrase_is_caught
    test_missing_file_is_usage_error

    echo ""
    echo "=========================================="
    echo "Tests run: ${TESTS_RUN} | Failed: ${TESTS_FAILED}"
    echo "=========================================="

    if [ "${TESTS_FAILED}" -gt 0 ]; then
        echo "Failed tests:"
        printf '%s' "${FAILED_NAMES}" | while IFS= read -r name; do
            [ -n "${name}" ] && echo "  - ${name}"
        done
        exit 1
    fi
    exit 0
}

main "$@"
