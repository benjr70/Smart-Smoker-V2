#!/usr/bin/env bash
# deps-land-runbook-check.sh — assert the Dependabot gate-and-merge lane still
# carries its load-bearing rules, across the three files that define it
# (#658 / Spec #651):
#
#   skill     .claude/skills/deps-land/SKILL.md     — the lane itself
#   pickup    .claude/skills/afk-pickup/SKILL.md    — §1.2's dispatch + merge site
#   glossary  CONTEXT.md                            — the lane's vocabulary
#
# Why this exists: a SKILL.md is not documentation, it is the program an Opus
# agent executes, and nothing compiles it. A well-meant rewrite can delete the
# sentence telling the maintainer that a GitHub approval is what lands a major
# bump — and the bump then sits `HITL` forever, waiting on a ritual nobody
# documented. The same is true of the `superseded` outcome (delete it and the
# lane fixes a closed PR), the `AFK:deps-failed` exhaustion (delete it and an
# unfixable bump is re-picked every fire), the `@dependabot rebase` nudge (delete
# it and the lane force-pushes a branch Dependabot owns), the step order (delete
# it and a PR is merged on markers from a sha it has moved past), and the `deps:`
# report line (delete it and the dashboard goes blind). This check makes those
# deletions loud. The glossary rules are here for the same reason one level up:
# a term that leaves CONTEXT.md is a term the next spec re-invents.
#
# Usage:
#   deps-land-runbook-check.sh [--skill FILE] [--pickup FILE] [--glossary FILE]
#   deps-land-runbook-check.sh --list
#
# Defaults resolve relative to this script, so it works from any cwd
# (scripts/claude-agent/run-tests.sh runs from several). The per-file overrides
# exist for the tests, which point the checker at mutated copies.
#
# `--list` prints the enforced rule table as `rule-id<TAB>file-key<TAB>pattern`
# lines — the machine-readable interface tests (and humans) use to enumerate the
# rules.
#
# Matching is done over a whitespace-normalized copy of each file, so Prettier's
# 80-column prose re-wrapping can never break a multi-word rule phrase. Patterns
# are case-insensitive extended regular expressions.
#
# Exit codes:
#   0  every rule present
#   1  at least one rule missing (each miss is reported)
#   2  usage error / a file not found

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

SKILL_FILE="${REPO_ROOT}/.claude/skills/deps-land/SKILL.md"
PICKUP_FILE="${REPO_ROOT}/.claude/skills/afk-pickup/SKILL.md"
GLOSSARY_FILE="${REPO_ROOT}/CONTEXT.md"

# The load-bearing rules, one `rule-id<TAB>file-key<TAB>pattern` per line. A rule
# with several patterns must satisfy ALL of them. Each pattern is a phrase from
# the runbook, not a lone keyword, so the check fails when the *rule* goes away
# rather than when a word is reused elsewhere.
rule_table() {
    printf '%s\n' \
        "pickup-dispatch	pickup	reason .{0,3}dependabot" \
        "pickup-dispatch	pickup	/deps-land skill with --pr <RECON_PR> --branch <RECON_BRANCH> --sha" \
        "pickup-merge-site	pickup	same call site .{0,80}docs-merge" \
        "step-order	skill	1\) retitle; \(2\) inject the Bot-PR checklist; \(3\) Tier A" \
        "step-order	skill	re-read the PR.{0,60}before every step" \
        "superseded	skill	closed or superseded.{0,90}outcome .{0,3}superseded" \
        "handoff-sentence	skill	Approve this PR \(GitHub review\) to let the daemon land it; close to reject" \
        "report-line	skill	deps: PR #<N> .{0,4}<title>.{0,4} — security=<y/n> major=<y/n> tierA=<green\|fixed\(k\)\|failed> tierB=<6/6\|k/6\|skipped> outcome=<merged sha\|HITL\|deps-failed\|superseded>" \
        "report-line	pickup	deps: PR #<N>" \
        "exhaustion-label	skill	--add-label AFK:deps-failed" \
        "exhaustion-label	skill	gh pr ready .{0,20} --undo" \
        "conflict-dispatch	pickup	two bot reasons carry different verdict fields" \
        "conflict-dispatch	pickup	--agent-commits" \
        "conflict-dispatch	skill	--security. and .--major. are .{0,20}required for reason .{0,3}dependabot.{0,3} and absent for reason .{0,3}conflict" \
        "merge-cmd-line	skill	merge-cmd: <gate \.mergeCmd verbatim>" \
        "merge-cmd-line	pickup	merge-cmd: <gate \.mergeCmd verbatim>" \
        "tier-a-fresh-sha	skill	re-read the head sha before recording anything" \
        "dependabot-rebase	skill	@dependabot rebase" \
        "dependabot-rebase	skill	rebase-driver\.sh" \
        "tier-a-bot	skill	/pr-watch .{0,60}--bot" \
        "tier-b-force-tour	skill	/verify-pr .{0,40}--force-tour" \
        "tier-b-force-tour	skill	deferred > 0" \
        "gate-verdict	skill	deps-gate\.sh --pr" \
        "gate-verdict	skill	mergeCmd" \
        "fix-cap	skill	3 attempts" \
        "glossary-bot-pr-checklist	glossary	\*\*Bot-PR checklist\*\*" \
        "glossary-dependabot-pr	glossary	\*\*Dependabot PR\*\*"
}

# Collapse a file to a single whitespace-normalized line so wrapped prose still
# matches a multi-word phrase. Leading blockquote markers are stripped first:
# rules quoted inside `>` blocks would otherwise carry a `> ` into the middle of
# a phrase after a Prettier rewrap.
normalize_file() {
    sed -E 's/^[[:space:]]*>[[:space:]]?//' "$1" | tr '\n' ' ' | tr -s '[:space:]' ' '
}

file_for_key() {
    case "$1" in
        skill) printf '%s' "${SKILL_FILE}" ;;
        pickup) printf '%s' "${PICKUP_FILE}" ;;
        glossary) printf '%s' "${GLOSSARY_FILE}" ;;
        *) return 1 ;;
    esac
}

main() {
    if [ "${1:-}" = "--list" ]; then
        rule_table
        return 0
    fi

    while [ "$#" -gt 0 ]; do
        # Every flag here takes a value, and a value-less one is a usage error,
        # not a retry: with `set -uo pipefail` and no `set -e`, `shift 2` on a
        # single remaining argument fails and shifts NOTHING, so the loop would
        # re-process the same flag forever. A mistyped invocation in CI or in
        # run-tests.sh must fail the job, never hang it.
        case "$1" in
            --skill | --pickup | --glossary)
                if [ "$#" -lt 2 ]; then
                    echo "deps-land-runbook-check: $1 requires a file path" >&2
                    return 2
                fi
                ;;
        esac
        case "$1" in
            --skill) SKILL_FILE="${2:-}"; shift 2 ;;
            --pickup) PICKUP_FILE="${2:-}"; shift 2 ;;
            --glossary) GLOSSARY_FILE="${2:-}"; shift 2 ;;
            *)
                echo "deps-land-runbook-check: unknown argument: $1" >&2
                return 2
                ;;
        esac
    done

    local key path
    for key in skill pickup glossary; do
        path="$(file_for_key "${key}")"
        if [ ! -f "${path}" ]; then
            echo "deps-land-runbook-check: file not found (${key}): ${path}" >&2
            return 2
        fi
    done

    # Normalize each file once — the table asks the same file many times.
    local skill_text pickup_text glossary_text
    skill_text="$(normalize_file "${SKILL_FILE}")"
    pickup_text="$(normalize_file "${PICKUP_FILE}")"
    glossary_text="$(normalize_file "${GLOSSARY_FILE}")"

    local checks=0 missing=0 rule fkey pattern text
    while IFS=$'\t' read -r rule fkey pattern; do
        [ -n "${rule}" ] || continue
        case "${fkey}" in
            skill) text="${skill_text}" ;;
            pickup) text="${pickup_text}" ;;
            glossary) text="${glossary_text}" ;;
            *)
                echo "deps-land-runbook-check: unknown file key in table: ${fkey}" >&2
                return 2
                ;;
        esac
        checks=$((checks + 1))
        if ! printf '%s' "${text}" | grep -Eqi -- "${pattern}"; then
            missing=$((missing + 1))
            echo "MISSING rule=${rule} file=$(file_for_key "${fkey}") pattern=${pattern}"
        fi
    done < <(rule_table)

    echo "deps-land-runbook-check: ${checks} assertions, ${missing} missing"

    if [ "${missing}" -gt 0 ]; then
        echo "The deps-land lane rules above are load-bearing (Spec #651, issue #658)."
        echo "Restore them in the skill/glossary text rather than relaxing this check."
        return 1
    fi
    return 0
}

main "$@"
