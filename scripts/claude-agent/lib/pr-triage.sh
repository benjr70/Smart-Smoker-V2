#!/usr/bin/env bash
# pr-triage.sh — the PR Triage: which open PR (if any) needs reconciling.
#
# Sourceable library exposing one pure function, `pr_triage_pick`. It consumes a
# `gh pr list --json ...` payload on stdin and emits, on stdout, a compact JSON
# verdict — either the single PR the reconcile phase should work this fire, or a
# no-pick:
#
#     { "pr": <number>, "branch": "feat/issue-<M>", "issue": <M>,
#       "reason": "revise|conflict" }
#     { "pr": null }
#
# "Ours" filter — a PR is only ever considered when ALL hold:
#   - state OPEN and not a draft (drafts are the escalation parking state —
#     team:checks-failed / exhausted fix loops — and must never be auto-picked);
#   - head branch matches feat/issue-<M> (the only branch shape team-pickup
#     creates; defends against reconciling a human's hand-made PR);
#   - author login equals PR_TRIAGE_AUTHOR when that env is non-empty (defends
#     against a fork/mirror PR that happens to reuse the branch naming).
#
# Needs-attention — a filtered PR is picked when EITHER holds:
#   - it carries the `team:revise` label (a human reviewed and explicitly handed
#     it back to the agent) → reason "revise";
#   - its mergeable state is CONFLICTING (master moved under it) → reason
#     "conflict". MERGEABLE and UNKNOWN both skip: UNKNOWN means GitHub is still
#     computing mergeability async — the next fire re-checks rather than guessing.
#   PRs already escalated (team:revise-failed / team:rebase-failed) are skipped —
#   they are parked for a human; re-picking them would loop on a known-stuck PR.
#
# Pick order: `team:revise` beats plain CONFLICTING (a human is actively waiting
# on their own review); within the same reason rank, oldest createdAt wins.
#
# The function is pure: it reads only stdin + env. The caller owns the gh call:
#
#   gh pr list --state open \
#     --json number,headRefName,isDraft,mergeable,labels,createdAt,author
#
# Env:
#   PR_TRIAGE_AUTHOR   agent's GitHub login; empty (default) disables the check
#
# Exit codes:
#   0 — a PR was picked (verdict has a number)
#   1 — nothing needs attention (verdict {"pr":null}); also for empty/malformed
#       input — a broken sensor must fall through to the normal pick, not crash.

# pr_triage_scan: own the gh call AND ride out GitHub's async mergeability.
#
# A push to master queues a background recompute of every open PR's mergeable
# state; until it lands, the API says UNKNOWN and pr_triage_pick (correctly)
# refuses to guess. But "re-check next fire" strands a conflicted PR for a
# whole no-work sleep when the fire lands seconds after a merge (observed
# 2026-07-10: #312 merged at 18:44, the 18:45 fire saw #305 as UNKNOWN,
# triaged {"pr":null}, and slept). Querying mergeable is itself what triggers
# the recompute, so polling resolves it in seconds: re-list while any
# ours-shaped open non-draft PR is still UNKNOWN, up to
# PR_TRIAGE_UNKNOWN_RETRIES re-lists (default 6) every
# PR_TRIAGE_UNKNOWN_INTERVAL seconds (default 20 — ~2 min worst case), then
# triage whatever the last listing said.
#
# Env (beyond pr_triage_pick's): GH_BIN, PR_TRIAGE_UNKNOWN_RETRIES,
# PR_TRIAGE_UNKNOWN_INTERVAL, PR_TRIAGE_SLEEP (injectable for tests).
# Exit codes: pr_triage_pick's.
pr_triage_scan() {
    local gh="${GH_BIN:-gh}" tries="${PR_TRIAGE_UNKNOWN_RETRIES:-6}"
    local interval="${PR_TRIAGE_UNKNOWN_INTERVAL:-20}" sleep_bin="${PR_TRIAGE_SLEEP:-sleep}"
    local i prs unknown

    for ((i = 0; i <= tries; i++)); do
        prs="$("${gh}" pr list --state open \
            --json number,headRefName,isDraft,mergeable,labels,createdAt,author \
            2>/dev/null || echo '[]')"

        unknown="$(printf '%s' "${prs}" | jq '
            [ .[]
              | select((.isDraft // false) | not)
              | select(.headRefName | test("^feat/issue-[0-9]+$"))
              | select((.mergeable // "UNKNOWN") == "UNKNOWN") ]
            | length' 2>/dev/null || echo '0')"

        if [ "${unknown:-0}" = "0" ] || [ "${i}" -ge "${tries}" ]; then
            printf '%s' "${prs}" | pr_triage_pick
            return $?
        fi
        "${sleep_bin}" "${interval}"
    done
}

# pr_triage_pick: read the PR-list JSON on stdin, print the verdict JSON.
pr_triage_pick() {
    local payload verdict

    payload="$(cat)"

    if ! printf '%s' "${payload}" | jq -e 'type == "array"' >/dev/null 2>&1; then
        printf '{"pr":null}\n'
        return 1
    fi

    verdict="$(printf '%s' "${payload}" | jq -c --arg author "${PR_TRIAGE_AUTHOR:-}" '
        def labels_of: [.labels[]?.name // empty];
        [ .[]
          | select((.state // "OPEN") == "OPEN")
          | select((.isDraft // false) | not)
          | select(.headRefName | test("^feat/issue-[0-9]+$"))
          | select(($author == "") or ((.author.login // "") == $author))
          | (labels_of) as $lbls
          | select(($lbls | index("team:revise-failed") | not)
                and ($lbls | index("team:rebase-failed") | not))
          | . + { reason:
                    (if ($lbls | index("team:revise")) then "revise"
                     elif (.mergeable // "UNKNOWN") == "CONFLICTING" then "conflict"
                     else null end) }
          | select(.reason != null) ]
        | sort_by([(if .reason == "revise" then 0 else 1 end), .createdAt])
        | first
        | if . == null then {pr: null}
          else { pr: .number,
                 branch: .headRefName,
                 issue: (.headRefName | capture("^feat/issue-(?<n>[0-9]+)$").n | tonumber),
                 reason: .reason }
          end' 2>/dev/null)"

    if [ -z "${verdict}" ] || [ "$(printf '%s' "${verdict}" | jq -r '.pr')" = "null" ]; then
        printf '{"pr":null}\n'
        return 1
    fi

    printf '%s\n' "${verdict}"
    return 0
}
