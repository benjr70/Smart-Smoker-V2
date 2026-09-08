#!/usr/bin/env bash
# pr-watch-runbook-check.sh — assert the pr-watch skill still carries the
# load-bearing rules of its Dependabot (`--bot`) mode (#657 / Spec #651).
#
# Why this exists: `.claude/skills/pr-watch/SKILL.md` is not documentation, it
# is the program an Opus agent executes. Nothing compiles it, so a well-meant
# rewrite can delete the sentence that says a bot PR is labeled
# `AFK:deps-failed` — and the lane will then label a Dependabot PR
# `AFK:checks-failed`, where the deps lane never looks for it, and the bump sits
# drafted and unowned. The same is true of the cap arithmetic (delete it and the
# fix loop grinds a bump it cannot fix), the `[dependabot skip]` trailer (delete
# it and Dependabot abandons the branch), and each terminal verdict line (the
# caller parses them verbatim). This check makes those deletions loud.
#
# Usage:
#   pr-watch-runbook-check.sh [SKILL_FILE]
#   pr-watch-runbook-check.sh --list
#
# Default: .claude/skills/pr-watch/SKILL.md resolved relative to this script, so
# it works from any cwd (scripts/claude-agent/run-tests.sh runs from several).
#
# `--list` prints the enforced rule table as `rule-id<TAB>pattern` lines — the
# machine-readable interface tests (and humans) use to enumerate the rules.
#
# Matching is done over a whitespace-normalized copy of the file, so Prettier's
# 80-column prose re-wrapping can never break a multi-word rule phrase. Patterns
# are case-insensitive extended regular expressions.
#
# Exit codes:
#   0  every rule present
#   1  at least one rule missing (each miss is reported)
#   2  usage error / skill file not found

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

DEFAULT_SKILL_FILE="${REPO_ROOT}/.claude/skills/pr-watch/SKILL.md"

# The load-bearing rules, one `rule-id<TAB>pattern` per line. A rule with several
# patterns must satisfy ALL of them. Each pattern is a phrase from the runbook,
# not a lone keyword, so the check fails when the *rule* goes away rather than
# when a word is reused elsewhere.
#
# `default-label` and `default-verdict` are here for the same reason as the bot
# rules, in the opposite direction: adding a bot mode must not disturb the path
# afk-pickup has always taken (issue #657 AC 4).
#
# Those two must be phrases the BOT text cannot also satisfy, or they guard
# nothing: the bare label `AFK:checks-failed` also appears in the bot-mode
# sentence "never apply AFK:checks-failed to a Dependabot PR", and the default
# PASS verdict is a prefix of the bot one (`… at attempt <K> (bot)`). So the
# default label is pinned to §6's `--add-label` COMMAND, and the default PASS
# verdict to its closing backtick — a character the bot line does not carry in
# that position. Deleting only the default line now fails the check.
rule_table() {
    printf '%s\n' \
        "bot-flag	--bot" \
        "bot-flag	dependabot/" \
        "bot-verdict-pass	pr-watch: PASS — all checks green at attempt <K> \(bot\)" \
        "bot-verdict-draft	pr-watch: DRAFT — exhausted 3 attempts, marked draft, AFK:deps-failed" \
        "bot-label	--add-label AFK:deps-failed" \
        "bot-label	never .{0,60}AFK:checks-failed" \
        "default-label	--add-label AFK:checks-failed" \
        'default-verdict	pr-watch: PASS — all checks green at attempt <K>`' \
        "default-verdict	pr-watch: DRAFT — exhausted 10 rounds, marked draft, AFK:checks-failed" \
        "head-sha-key	Markers are keyed to the .{0,4}PR head sha" \
        "no-fallback-budget	never a full budget" \
        "bot-cap	deps-lane\.sh marker-parse" \
        "bot-cap	deps-lane\.sh rounds-left" \
        "bot-cap	MAX_ROUNDS.{0,2} is 0" \
        "fix-marker	marker-emit fix-attempt" \
        "fix-marker	one marker comment per fix round" \
        "skip-trailer	\[dependabot skip\]" \
        "skip-trailer	deps-lane\.sh commit-trailer" \
        "lockfile-recipe	npm install --legacy-peer-deps --package-lock-only --ignore-scripts"
}

# Collapse the file to a single whitespace-normalized line so wrapped prose still
# matches a multi-word phrase. Leading blockquote markers are stripped first:
# rules quoted inside `>` blocks would otherwise carry a `> ` into the middle of
# a phrase after a Prettier rewrap.
normalize_file() {
    sed -E 's/^[[:space:]]*>[[:space:]]?//' "$1" | tr '\n' ' ' | tr -s '[:space:]' ' '
}

main() {
    if [ "${1:-}" = "--list" ]; then
        rule_table
        return 0
    fi

    local skill_file="${1:-${DEFAULT_SKILL_FILE}}"

    if [ ! -f "${skill_file}" ]; then
        echo "pr-watch-runbook-check: skill file not found: ${skill_file}" >&2
        return 2
    fi

    local text
    text="$(normalize_file "${skill_file}")"

    local checks=0 missing=0 rule pattern
    while IFS=$'\t' read -r rule pattern; do
        [ -n "${rule}" ] || continue
        checks=$((checks + 1))
        if ! printf '%s' "${text}" | grep -Eqi -- "${pattern}"; then
            missing=$((missing + 1))
            echo "MISSING rule=${rule} file=${skill_file} pattern=${pattern}"
        fi
    done < <(rule_table)

    echo "pr-watch-runbook-check: ${checks} assertions, ${missing} missing"

    if [ "${missing}" -gt 0 ]; then
        echo "The pr-watch bot-mode rules above are load-bearing (Spec #651, issue #657)."
        echo "Restore them in the skill text rather than relaxing this check."
        return 1
    fi
    return 0
}

main "$@"
