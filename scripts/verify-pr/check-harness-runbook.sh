#!/usr/bin/env bash
# check-harness-runbook.sh — assert the Electron runbook's load-bearing rules
# are present in BOTH harness definitions (#391 / PRD #387).
#
# Why this exists: the /verify-pr harness only drives the real Electron shell if
# its *brain* — the `verify-pr` skill text and the `manual-verifier` agent
# definition — actually tells it how. On PR #382 the verifier deferred three
# items as "no tool available" while the box had a live desktop session the whole
# time. The runbook rules encode the fixes; this check makes sure a future edit
# to either document cannot silently drop one of them.
#
# Usage:
#   check-harness-runbook.sh [SKILL_FILE] [AGENT_FILE]
#   check-harness-runbook.sh --list
#
# Defaults: .claude/skills/verify-pr/SKILL.md and .claude/agents/manual-verifier.md
# resolved relative to this script (works from any cwd).
#
# `--list` prints the enforced rule table as `rule-id<TAB>pattern` lines — the
# machine-readable interface tests (and humans) use to enumerate the rules.
#
# Matching is done over a whitespace-normalized copy of each file, so Prettier's
# 80-column prose re-wrapping of the markdown can never break a multi-word rule
# phrase. Patterns are case-insensitive extended regular expressions.
#
# Exit codes:
#   0  every rule present in both definitions
#   1  at least one rule missing (each miss is reported)
#   2  usage error / definition file not found

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

DEFAULT_SKILL_FILE="${REPO_ROOT}/.claude/skills/verify-pr/SKILL.md"
DEFAULT_AGENT_FILE="${REPO_ROOT}/.claude/agents/manual-verifier.md"

# The load-bearing rules, one `rule-id<TAB>pattern` per line. A rule with several
# patterns must satisfy ALL of them; every rule must hold in BOTH definitions.
# Each pattern is deliberately a phrase from the runbook, not a lone keyword, so
# the check fails when the *rule* goes away rather than when a word is reused.
rule_table() {
    printf '%s\n' \
        "display-truth	lib/resolve-display-env\.sh" \
        "display-truth	unset shell [^ ]*DISPLAY[^ ]* is never evidence of a headless" \
        "electron-path	electron-launcher\.sh" \
        "electron-path	electron-cdp-mcp-wrapper\.sh" \
        "electron-path	launcher-start [^ ]+ CDP-attach [^ ]+ drive [^ ]+ launcher-stop" \
        "electron-path	electron-launcher\.sh stop.{0,5} runs on every exit path" \
        "shell-drift	provisioned daemon checkout" \
        "shell-drift	note the drift" \
        "shell-drift	defer shell-specific behavior for that round" \
        "shell-drift	apps/smoker/electron-app/" \
        "shell-drift	apps/smoker/src/electron/" \
        "shell-drift	apps/smoker/config\.forge\.js" \
        "shell-drift	apps/smoker/webpack\.renderer\.config\.js" \
        "shell-drift	apps/smoker/webpack\.rules\.js" \
        "shell-drift	apps/smoker/public/thin\.html" \
        "stack-mutation	docker stop" \
        "stack-mutation	docker start" \
        "stack-mutation	strictly within the current per-PR compose project namespace" \
        "stack-mutation	offline batching and reconnect flush" \
        "emulator-feed	device-service emulator mode" \
        "emulator-feed	NODE_ENV=local" \
        "dual-driver	cloud frontend in headful Chrome and the smoker shell in Electron" \
        "dual-driver	both directions" \
        "wifi-bound	wifi adapter stays off in hermetic builds" \
        "wifi-bound	store snapshot flag" \
        "wifi-bound	wifi-screen navigation" \
        "ui-screenshots	screenshot tour" \
        "ui-screenshots	.surface.-NN-.slug.\.png" \
        "ui-screenshots	ui-shot:" \
        "ui-screenshots	tour-viewport\.sh" \
        "ui-screenshots	390x844" \
        "ui-screenshots	800x480" \
        "ui-screenshots	the tour documents the change, it does not verify it"
}

# Collapse a file to a single whitespace-normalized line so wrapped prose still
# matches a multi-word phrase. Leading blockquote markers are stripped first:
# several rules live inside `>` quoted agent prompts, and Prettier's 80-column
# rewrap can drop a `> ` into the middle of any phrase.
normalize_file() {
    sed -E 's/^[[:space:]]*>[[:space:]]?//' "$1" | tr '\n' ' ' | tr -s '[:space:]' ' '
}

main() {
    if [ "${1:-}" = "--list" ]; then
        rule_table
        return 0
    fi

    local skill_file="${1:-${DEFAULT_SKILL_FILE}}"
    local agent_file="${2:-${DEFAULT_AGENT_FILE}}"

    local f
    for f in "${skill_file}" "${agent_file}"; do
        if [ ! -f "${f}" ]; then
            echo "check-harness-runbook: definition file not found: ${f}" >&2
            return 2
        fi
    done

    local skill_text agent_text
    skill_text="$(normalize_file "${skill_file}")"
    agent_text="$(normalize_file "${agent_file}")"

    local checks=0 missing=0 rule pattern
    while IFS=$'\t' read -r rule pattern; do
        [ -n "${rule}" ] || continue
        local target text
        for target in "${skill_file}" "${agent_file}"; do
            if [ "${target}" = "${skill_file}" ]; then
                text="${skill_text}"
            else
                text="${agent_text}"
            fi
            checks=$((checks + 1))
            if ! printf '%s' "${text}" | grep -Eqi -- "${pattern}"; then
                missing=$((missing + 1))
                echo "MISSING rule=${rule} file=${target} pattern=${pattern}"
            fi
        done
    done < <(rule_table)

    echo "check-harness-runbook: ${checks} assertions, ${missing} missing"

    if [ "${missing}" -gt 0 ]; then
        echo "The Electron runbook rules above are load-bearing (PRD #387, issue #391)."
        echo "Restore them in the definition text rather than relaxing this check."
        return 1
    fi
    return 0
}

main "$@"
