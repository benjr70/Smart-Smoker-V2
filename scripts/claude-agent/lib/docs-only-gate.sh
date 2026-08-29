#!/usr/bin/env bash
# docs-only-gate.sh — decide whether a PR is docs-only, and merge it if so.
#
# Why this exists: research PRs touch nothing but `docs/research/**`. They carry
# no code risk, so they must not spend a /pr-review + /verify-pr tail (or a
# human's review round) before they land — but "merge it, it's only docs" is a
# judgement call, and a judgement call made by an agent mid-fire is exactly the
# kind of thing that eventually merges a stray `apps/backend` edit. This script
# owns the rule instead: one tested gate, one command shape, no discretion.
#
# Usage:
#   scripts/claude-agent/lib/docs-only-gate.sh --base <ref> --head <sha> \
#       --pr <N> [--repo <owner/repo>] [--merge]
#
# Without --merge it only decides. With --merge it additionally reads the PR's
# check state and, when every non-skipping check passes, runs the merge command.
#
# Output (stdout): one compact JSON verdict, nothing else —
#   { "docsOnly": <bool>, "sha": "<head>", "changed": [ "<path>", … ],
#     "mergeCmd": "gh pr merge <N> --squash --admin --match-head-commit <sha>",
#     "merged": <bool>,          # only with --merge
#     "reason": "<why not merged>" }   # not-docs-only | checks-not-green |
#                                      # merge-failed | head-missing
#
# The verdict is "docs-only" only when the diff is non-empty AND every changed
# path is under `docs/research/`. The diff is a three-dot (merge-base) diff with
# `--no-renames`, so a file *moved into* docs/research/ still shows its original
# path outside it and is refused — renames are exactly how a code change would
# otherwise sneak past a prefix test.
#
# Merge recipe (from the #577 research): the repo has auto-merge disabled and
# master requires one code-owner approval, but `enforce_admins` is off — so an
# admin token squash-merges directly. `--match-head-commit` pins the merge to
# the sha the gate inspected: if anything is pushed between gate and merge, the
# merge fails rather than landing unreviewed code.
#
# Exit codes:
#   0  docs-only (and, with --merge, merged)
#   1  not docs-only — merge refused
#   2  the gate could not run — usage error (missing/unknown args), the head
#      object is absent locally (JSON reason "head-missing"; fetch it and
#      re-run), or git is unusable. NOT a verdict about the PR's contents.
#   3  docs-only but the merge did not happen (checks not green, or the merge
#      command itself failed)
#
# Env:
#   GIT_BIN  git CLI (default: git) — injectable for tests
#   GH_BIN   gh CLI  (default: gh)  — injectable for tests

set -uo pipefail

BASE=''
HEAD_SHA=''
PR=''
REPO=''
DO_MERGE=0

while [ $# -gt 0 ]; do
    case "$1" in
        --base)  BASE="${2:-}"; shift 2 ;;
        --head)  HEAD_SHA="${2:-}"; shift 2 ;;
        --pr)    PR="${2:-}"; shift 2 ;;
        --repo)  REPO="${2:-}"; shift 2 ;;
        --merge) DO_MERGE=1; shift ;;
        *) echo "docs-only-gate: unknown arg $1" >&2; exit 2 ;;
    esac
done

if [ -z "${BASE}" ] || [ -z "${HEAD_SHA}" ] || [ -z "${PR}" ]; then
    echo "docs-only-gate: --base, --head and --pr are required" >&2
    exit 2
fi

GIT="${GIT_BIN:-git}"
GH="${GH_BIN:-gh}"
MERGE_CMD="gh pr merge ${PR} --squash --admin --match-head-commit ${HEAD_SHA}"

emit() { # emit <docsOnly> <changedJson> [merged] [reason]
    jq -cn --argjson docsOnly "$1" --argjson changed "$2" \
        --arg sha "${HEAD_SHA}" --arg cmd "${MERGE_CMD}" \
        --arg merged "${3:-}" --arg reason "${4:-}" \
        '{docsOnly: $docsOnly, sha: $sha, changed: $changed, mergeCmd: $cmd}
         + (if $merged == "" then {} else {merged: ($merged == "true")} end)
         + (if $reason == "" then {} else {reason: $reason} end)'
}

# The head object is often absent locally: agent-run fetches only origin/master,
# and the PR branch may have been pruned or pushed from another checkout. A
# three-dot diff against an unknown sha fails (or, with a partially-fetched ref,
# lies) — so probe first and report a gate ERROR (exit 2) rather than a "not
# docs-only" refusal. The caller fetches the head and re-runs; it must never
# read this as a verdict about the PR's contents.
if ! "${GIT}" cat-file -e "${HEAD_SHA}^{commit}" 2>/dev/null; then
    echo "docs-only-gate: head object ${HEAD_SHA} not present locally — fetch it first" >&2
    emit false '[]' '' 'head-missing'
    exit 2
fi

DIFF="$("${GIT}" diff --name-only --no-renames "${BASE}...${HEAD_SHA}" 2>/dev/null)" || {
    echo "docs-only-gate: git diff failed for ${BASE}...${HEAD_SHA}" >&2
    exit 2
}

CHANGED_JSON="$(printf '%s' "${DIFF}" \
    | jq -R -s 'split("\n") | map(select(length > 0))' 2>/dev/null)"
[ -n "${CHANGED_JSON}" ] || CHANGED_JSON='[]'

DOCS_ONLY="$(printf '%s' "${CHANGED_JSON}" \
    | jq -r '(length > 0) and all(.[]; startswith("docs/research/"))')"

if [ "${DOCS_ONLY}" != "true" ]; then
    emit false "${CHANGED_JSON}" "$([ "${DO_MERGE}" -eq 1 ] && echo false || echo '')" \
        "$([ "${DO_MERGE}" -eq 1 ] && echo 'not-docs-only' || echo '')"
    exit 1
fi

if [ "${DO_MERGE}" -eq 0 ]; then
    emit true "${CHANGED_JSON}"
    exit 0
fi

# --merge: green checks are the only thing standing in for the review the PR is
# skipping, so read them and fail SAFE — an unreadable list, a pending check or
# a red one all refuse. `skipping` is benign (same rule as ci-wait.sh).
REPO_ARGS=()
[ -n "${REPO}" ] && REPO_ARGS=(--repo "${REPO}")

CHECKS="$("${GH}" pr checks "${PR}" ${REPO_ARGS[@]+"${REPO_ARGS[@]}"} --json name,bucket 2>/dev/null)" || CHECKS=''
NOT_GREEN='unreadable'
if printf '%s' "${CHECKS}" | jq -e 'type == "array"' >/dev/null 2>&1; then
    NOT_GREEN="$(printf '%s' "${CHECKS}" \
        | jq '[.[] | select((.bucket // "") != "pass" and (.bucket // "") != "skipping")] | length')"
fi

if [ "${NOT_GREEN}" != "0" ]; then
    emit true "${CHANGED_JSON}" false 'checks-not-green'
    exit 3
fi

if ! "${GH}" pr merge "${PR}" ${REPO_ARGS[@]+"${REPO_ARGS[@]}"} --squash --admin \
    --match-head-commit "${HEAD_SHA}" >/dev/null 2>&1; then
    emit true "${CHANGED_JSON}" false 'merge-failed'
    exit 3
fi

emit true "${CHANGED_JSON}" true
exit 0
