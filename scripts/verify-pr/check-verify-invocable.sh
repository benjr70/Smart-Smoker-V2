#!/usr/bin/env bash
# check-verify-invocable.sh — assert the manual-verification round can actually
# be run by the autonomous pipeline, and cannot be silently skipped (#467).
#
# Why this exists: `/verify-pr` carried `disable-model-invocation: true` in its
# frontmatter, which the Claude Code harness enforces *before* a single line of
# the skill runs. Both automated call sites — afk-pickup §6a.2 and pr-reconcile
# §3 — delegate the round to a subagent, and the subagent is still a model, so
# every automated verification round was refused. The pipeline's last quality
# gate was missing repo-wide and nobody noticed, because a refused round reported
# as an ordinary skip. This check pins both halves of the fix: the harness stays
# agent-invocable, and a round that did not run can never be reported as PASS.
#
# Usage:
#   check-verify-invocable.sh [VERIFY_SKILL] [PICKUP_SKILL] [RECONCILE_SKILL]
#   check-verify-invocable.sh --list
#
# Defaults: .claude/skills/{verify-pr,afk-pickup,pr-reconcile}/SKILL.md
# resolved relative to this script (works from any cwd).
#
# `--list` prints the enforced rule table as
# `rule-id<TAB>target<TAB>mode<TAB>pattern` lines — the machine-readable
# interface tests (and humans) use to enumerate the rules.
#
# Targets select which text a rule is matched against:
#   verify-frontmatter  the YAML frontmatter block of the verify-pr skill
#   verify              the whole verify-pr skill
#   pickup              the whole afk-pickup skill
#   reconcile           the whole pr-reconcile skill
#
# Modes: `require` (pattern MUST match) and `forbid` (pattern must NOT match).
#
# Matching is done over a whitespace-normalized copy of each file, so Prettier's
# 80-column prose re-wrapping of the markdown can never break a multi-word rule
# phrase. Patterns are case-insensitive extended regular expressions.
#
# Exit codes:
#   0  every rule satisfied
#   1  at least one rule violated (each violation is reported)
#   2  usage error / skill file not found

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

DEFAULT_VERIFY_SKILL="${REPO_ROOT}/.claude/skills/verify-pr/SKILL.md"
DEFAULT_PICKUP_SKILL="${REPO_ROOT}/.claude/skills/afk-pickup/SKILL.md"
DEFAULT_RECONCILE_SKILL="${REPO_ROOT}/.claude/skills/pr-reconcile/SKILL.md"

# The load-bearing rules, one `rule-id<TAB>target<TAB>mode<TAB>pattern` per line.
# A rule with several patterns must satisfy ALL of them. Each pattern is
# deliberately a phrase from the skill text, not a lone keyword, so the check
# fails when the *rule* goes away rather than when a word is reused.
#
# The `round-non-skippable` patterns are phrases UNIQUE to the missing-round park
# block. A generic `AFK:checks-failed` / `gh pr comment` / `gh pr ready --undo`
# would be satisfied by the older, unrelated escalation paths that already live
# in both skills (pr-watch exhaustion, revise-failed), so deleting the park block
# would leave the check green. The park comment's own wording, and the sentence
# pinning the DRAFT flip (without which PR Triage re-picks the parked PR every
# fire), appear nowhere else.
rule_table() {
    printf '%s\n' \
        "agent-invocable	verify-frontmatter	forbid	disable-model-invocation" \
        "no-human-only	verify	forbid	reserved for (explicit )?(user|human) invocation" \
        "no-human-only	verify	forbid	cannot be invoked via the Skill tool" \
        "no-human-only	verify	forbid	ask the user to run /verify-pr (themselves|yourself)" \
        "any-caller	verify	require	an agent calling the .{0,4}Skill.{0,4} tool" \
        "any-caller	verify	require	subagent spawned via the .{0,4}Agent.{0,4} tool" \
        "any-caller	verify	require	afk-pickup.{0,10}6a\.2" \
        "any-caller	verify	require	pr-reconcile.{0,8}3" \
        "any-caller	verify	require	do not refuse, defer, or downgrade a round because the caller is a model" \
        "round-non-skippable	pickup	require	the round is .{0,4}not.{0,4} skippable" \
        "round-non-skippable	pickup	require	never be reported as .{0,4}result: PASS" \
        "round-non-skippable	pickup	require	Manual verification round did not run" \
        "round-non-skippable	pickup	require	no verification evidence exists" \
        "round-non-skippable	pickup	require	drafting is what takes the PR out of the .{0,4}incomplete.{0,4} class" \
        "round-non-skippable	pickup	require	verify: MISSING" \
        "round-non-skippable	reconcile	require	the round is .{0,4}not.{0,4} skippable" \
        "round-non-skippable	reconcile	require	never be reported as .{0,4}result: PASS" \
        "round-non-skippable	reconcile	require	Manual verification round did not run" \
        "round-non-skippable	reconcile	require	no verification evidence exists" \
        "round-non-skippable	reconcile	require	drafting is what takes the PR out of the .{0,4}incomplete.{0,4} class" \
        "round-non-skippable	reconcile	require	verify: MISSING"
}

# Collapse a file to a single whitespace-normalized line so wrapped prose still
# matches a multi-word phrase. Leading blockquote markers are stripped first:
# several rules live inside `>` quoted agent prompts, and Prettier's 80-column
# rewrap can drop a `> ` into the middle of any phrase.
normalize_text() {
    sed -E 's/^[[:space:]]*>[[:space:]]?//' | tr '\n' ' ' | tr -s '[:space:]' ' '
}

normalize_file() {
    normalize_text < "$1"
}

# Echo just the YAML frontmatter block of a markdown file (the lines between the
# leading `---` fence and the next one). A file with no leading fence has no
# frontmatter, so nothing is echoed and `forbid` rules trivially hold.
frontmatter_of() {
    awk 'NR==1 && $0!="---" { exit } NR==1 { next } $0=="---" { exit } { print }' "$1" \
        | normalize_text
}

main() {
    if [ "${1:-}" = "--list" ]; then
        rule_table
        return 0
    fi

    local verify_file="${1:-${DEFAULT_VERIFY_SKILL}}"
    local pickup_file="${2:-${DEFAULT_PICKUP_SKILL}}"
    local reconcile_file="${3:-${DEFAULT_RECONCILE_SKILL}}"

    local f
    for f in "${verify_file}" "${pickup_file}" "${reconcile_file}"; do
        if [ ! -f "${f}" ]; then
            echo "check-verify-invocable: skill file not found: ${f}" >&2
            return 2
        fi
    done

    local verify_fm_text verify_text pickup_text reconcile_text
    verify_fm_text="$(frontmatter_of "${verify_file}")"
    verify_text="$(normalize_file "${verify_file}")"
    pickup_text="$(normalize_file "${pickup_file}")"
    reconcile_text="$(normalize_file "${reconcile_file}")"

    local checks=0 violations=0 rule target mode pattern text label
    while IFS=$'\t' read -r rule target mode pattern; do
        [ -n "${rule}" ] || continue
        case "${target}" in
            verify-frontmatter) text="${verify_fm_text}"; label="${verify_file} (frontmatter)" ;;
            verify)             text="${verify_text}";    label="${verify_file}" ;;
            pickup)             text="${pickup_text}";    label="${pickup_file}" ;;
            reconcile)          text="${reconcile_text}"; label="${reconcile_file}" ;;
            *)
                echo "check-verify-invocable: unknown target '${target}' for rule ${rule}" >&2
                return 2
                ;;
        esac

        checks=$((checks + 1))
        # Here-string, not `printf | grep`: `grep -q` exits on its first match,
        # which SIGPIPEs the writer, and under `set -o pipefail` that surfaces as
        # status 141 — a satisfied rule reported as MISSING once a normalized
        # skill body outgrows the 64KB pipe buffer.
        if grep -Eqi -- "${pattern}" <<< "${text}"; then
            if [ "${mode}" = "forbid" ]; then
                violations=$((violations + 1))
                echo "FORBIDDEN rule=${rule} file=${label} pattern=${pattern}"
            fi
        else
            if [ "${mode}" = "require" ]; then
                violations=$((violations + 1))
                echo "MISSING rule=${rule} file=${label} pattern=${pattern}"
            fi
        fi
    done < <(rule_table)

    echo "check-verify-invocable: ${checks} assertions, ${violations} violation(s)"

    if [ "${violations}" -gt 0 ]; then
        echo "These rules keep the manual-verification round runnable by the pipeline"
        echo "and non-skippable (issue #467). Restore the skill text rather than"
        echo "relaxing this check."
        return 1
    fi
    return 0
}

main "$@"
