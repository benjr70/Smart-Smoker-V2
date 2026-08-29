#!/usr/bin/env bash
# docs-only-gate.sh — decide whether a PR may be merged as docs-only.
#
# Why this exists: research PRs touch nothing but `docs/research/**`. They carry
# no code risk, so they must not spend a /pr-review + /verify-pr tail (or a
# human's review round) before they land — but "merge it, it's only docs" is a
# judgement call, and a judgement call made by an agent mid-fire is exactly the
# kind of thing that eventually merges a stray `apps/backend` edit. This script
# owns the rule instead: one tested gate, one command shape, no discretion.
#
# The gate DECIDES; it never mutates. It reads a diff (and, with
# `--check-state`, the PR's check list) and prints the verdict plus the exact
# merge command the caller must run — afk-pickup §1.2 owns the merge itself, so
# the one call site that can land a commit on master stays reviewable in the
# skill. No code path in this file can merge anything.
#
# Usage:
#   scripts/claude-agent/lib/docs-only-gate.sh --base <ref> --head <sha> \
#       --pr <N> [--repo <owner/repo>] [--check-state]
#
# Output (stdout): one compact JSON verdict, nothing else —
#   { "docsOnly": <bool>, "sha": "<head>", "changed": [ "<path>", … ],
#     "mergeCmd": "gh pr merge <N> [--repo <owner/repo>] --squash --admin \
#                  --match-head-commit <sha>",
#     "reason": "<why refused>" }   # absent when the verdict approves
#
# The verdict is "docs-only" only when the diff is non-empty AND every changed
# path is under `docs/research/` (the prefix is shared with pr-triage.sh via
# lib/docs-research-paths.sh). The diff is a three-dot (merge-base) diff with
# `--no-renames`, so a file *moved into* docs/research/ still shows its original
# path outside it and is refused — renames are exactly how a code change would
# otherwise sneak past a prefix test.
#
# Merge recipe (from the #577 research): the repo has auto-merge disabled and
# master requires one code-owner approval, but `enforce_admins` is off — so an
# admin token squash-merges directly. `--match-head-commit` pins the merge to
# the sha the gate inspected: if anything is pushed between gate and merge, the
# merge fails rather than landing unreviewed code. `--repo` is carried in
# `mergeCmd` when given, so the emitted command is runnable from any cwd.
#
# Exit codes (two, as the caller contract says — the JSON `reason` says why):
#   0  approved: docs-only (and, with --check-state, every check green)
#   1  refused. `.reason` is one of
#        not-docs-only     — a changed path lives outside docs/research/
#        checks-not-green  — a check is failing or still pending
#        checks-missing    — the check list is EMPTY: nothing ran, so nothing
#                            vouches for the PR (an admin merge also bypasses
#                            branch protection's required-check list)
#        checks-unreadable — the check list could not be read
#        head-missing      — the head object is not in this clone (fetch it and
#                            re-run) — the gate could not run; says nothing
#                            about the PR's contents
#        git-failed        — git could not produce the diff (gate could not run)
#        usage             — bad/missing arguments (gate could not run)
#      The caller MUST report the last three as harness errors, not as verdicts
#      about the PR: see afk-pickup §1.2's reason table.
#
# Env:
#   GIT_BIN  git CLI (default: git) — injectable for tests
#   GH_BIN   gh CLI  (default: gh)  — injectable for tests

set -uo pipefail

# shellcheck source=scripts/claude-agent/lib/docs-research-paths.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/docs-research-paths.sh"

BASE=''
HEAD_SHA=''
PR=''
REPO=''
CHECK_STATE=0

MERGE_CMD=''

emit() { # emit <docsOnly> <changedJson> <reason|''>
    jq -cn --argjson docsOnly "$1" --argjson changed "$2" \
        --arg sha "${HEAD_SHA}" --arg cmd "${MERGE_CMD}" --arg reason "$3" \
        '{docsOnly: $docsOnly, sha: $sha, changed: $changed, mergeCmd: $cmd}
         + (if $reason == "" then {} else {reason: $reason} end)'
}

refuse() { # refuse <docsOnly> <changedJson> <reason> <stderr line>
    echo "docs-only-gate: $4" >&2
    emit "$1" "$2" "$3"
    exit 1
}

while [ $# -gt 0 ]; do
    case "$1" in
        --base)        BASE="${2:-}"; shift 2 ;;
        --head)        HEAD_SHA="${2:-}"; shift 2 ;;
        --pr)          PR="${2:-}"; shift 2 ;;
        --repo)        REPO="${2:-}"; shift 2 ;;
        --check-state) CHECK_STATE=1; shift ;;
        *) refuse false '[]' usage "unknown arg $1" ;;
    esac
done

if [ -z "${BASE}" ] || [ -z "${HEAD_SHA}" ] || [ -z "${PR}" ]; then
    refuse false '[]' usage '--base, --head and --pr are required'
fi

GIT="${GIT_BIN:-git}"
GH="${GH_BIN:-gh}"

REPO_ARGS=()
REPO_CMD=''
if [ -n "${REPO}" ]; then
    REPO_ARGS=(--repo "${REPO}")
    REPO_CMD="--repo ${REPO} "
fi
MERGE_CMD="gh pr merge ${PR} ${REPO_CMD}--squash --admin --match-head-commit ${HEAD_SHA}"

# The head object is often absent locally: agent-run fetches only origin/master,
# and the PR branch may have been pruned or pushed from another checkout. A
# three-dot diff against an unknown sha fails (or, with a partially-fetched ref,
# lies) — so probe first and refuse with reason head-missing. The caller fetches
# the head and re-runs; it must never read this as a verdict about the PR's
# contents.
if ! "${GIT}" cat-file -e "${HEAD_SHA}^{commit}" 2>/dev/null; then
    refuse false '[]' head-missing \
        "head object ${HEAD_SHA} not present locally — fetch it first"
fi

DIFF="$("${GIT}" diff --name-only --no-renames "${BASE}...${HEAD_SHA}" 2>/dev/null)" \
    || refuse false '[]' git-failed "git diff failed for ${BASE}...${HEAD_SHA}"

CHANGED_JSON="$(printf '%s' "${DIFF}" \
    | jq -R -s 'split("\n") | map(select(length > 0))' 2>/dev/null)"
[ -n "${CHANGED_JSON}" ] || CHANGED_JSON='[]'

DOCS_ONLY="$(printf '%s' "${CHANGED_JSON}" | jq -r --arg p "${DOCS_RESEARCH_PREFIX}" \
    '(length > 0) and all(.[]; startswith($p))')"

if [ "${DOCS_ONLY}" != "true" ]; then
    refuse false "${CHANGED_JSON}" not-docs-only \
        "a changed path lives outside ${DOCS_RESEARCH_PREFIX}"
fi

if [ "${CHECK_STATE}" -eq 0 ]; then
    emit true "${CHANGED_JSON}" ''
    exit 0
fi

# --check-state: green checks are the only thing standing in for the review the
# PR is skipping, so read them and fail SAFE — an unreadable list, an EMPTY list
# (nothing ran), a pending check or a red one all refuse. `skipping` is benign.
# Bucket vocabulary note: `pass`/`skipping` are green here, everything else is
# not; lib/ci-wait.sh applies the same GitHub bucket vocabulary from the other
# side (it counts `pending`/`fail`). Change one, check the other.
CHECKS="$("${GH}" pr checks "${PR}" ${REPO_ARGS[@]+"${REPO_ARGS[@]}"} \
    --json name,bucket 2>/dev/null)" || CHECKS=''

if ! printf '%s' "${CHECKS}" | jq -e 'type == "array"' >/dev/null 2>&1; then
    refuse true "${CHANGED_JSON}" checks-unreadable "check state for PR ${PR} is unreadable"
fi

if [ "$(printf '%s' "${CHECKS}" | jq 'length')" = "0" ]; then
    refuse true "${CHANGED_JSON}" checks-missing \
        "PR ${PR} has no checks at all — nothing vouches for it"
fi

NOT_GREEN="$(printf '%s' "${CHECKS}" | jq \
    '[.[] | select((.bucket // "") != "pass" and (.bucket // "") != "skipping")] | length')"

if [ "${NOT_GREEN}" != "0" ]; then
    refuse true "${CHANGED_JSON}" checks-not-green \
        "${NOT_GREEN} check(s) on PR ${PR} are failing or pending"
fi

emit true "${CHANGED_JSON}" ''
exit 0
