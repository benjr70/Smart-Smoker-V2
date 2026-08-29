#!/usr/bin/env bash
# pr-triage.sh — the PR Triage: which open PR (if any) needs reconciling.
#
# Sourceable library exposing one pure function, `pr_triage_pick`. It consumes a
# `gh pr list --json ...` payload on stdin and emits, on stdout, a compact JSON
# verdict — either the single PR the reconcile phase should work this fire, or a
# no-pick:
#
#     { "pr": <number>, "branch": "feat/issue-<M>", "issue": <M>,
#       "reason": "revise|conflict|docs-merge|incomplete" }
#     { "pr": null }
#
# `issue` is null when no ticket number can be derived from the head branch or
# the PR title (possible on a hand-named research branch) — the caller must
# handle that: no issue lock, no ticket comment, the PR is still worked.
#
# "Ours" filter — a PR is only ever considered when ALL hold:
#   - state OPEN and not a draft (drafts are the escalation parking state —
#     AFK:checks-failed / exhausted fix loops — and must never be auto-picked);
#   - head branch matches one of the two shapes the harness creates —
#     `feat/issue-<M>` (afk-pickup slices) or `research/<ticket-slug>`
#     (/afk-resolve research PRs, which are exactly the docs-only PRs reason
#     "docs-merge" exists for). Defends against reconciling a human's hand-made
#     PR. The shape lives in one place, PR_TRIAGE_OURS_RE, because three jq
#     programs below must agree on it;
#   - author login equals PR_TRIAGE_AUTHOR when that env is non-empty (defends
#     against a fork/mirror PR that happens to reuse the branch naming).
#
# Needs-attention — a filtered PR is picked when EITHER holds:
#   - it carries the `AFK:revise` label (a human reviewed and explicitly handed
#     it back to the agent) → reason "revise";
#   - its mergeable state is CONFLICTING (master moved under it) → reason
#     "conflict". MERGEABLE and UNKNOWN both skip: UNKNOWN means GitHub is still
#     computing mergeability async — the next fire re-checks rather than guessing;
#   - it is otherwise clean but every file it changes lives under
#     docs/research/ → reason "docs-merge": a research PR carries no code risk
#     and never earns review/verify rounds, so it is squash-merged by
#     lib/docs-only-gate.sh instead of being reconciled. The file list comes
#     from pr_triage_enrich too; an absent docsOnly reads as false, so a broken
#     sensor can never auto-merge anything;
#   - it is otherwise clean but its bot tail never finished — the one-time
#     review marker (<!-- pr-review-done -->) and/or any manual-verification
#     round comment is missing (a prior fire died mid-§6a) → reason
#     "incomplete". These signals live in PR comments, so pr_triage_enrich
#     (below) merges them into the payload first; an un-enriched payload reads
#     every PR as complete (only an explicit false flags incomplete — jq's //
#     would swallow false, so the pick tests != false).
#   PRs already escalated (AFK:revise-failed / AFK:rebase-failed) are skipped —
#   they are parked for a human; re-picking them would loop on a known-stuck PR.
#
# Pick order: `AFK:revise` beats plain CONFLICTING (a human is actively waiting
# on their own review), which beats "docs-merge" (a docs PR cannot be merged
# while it conflicts anyway), which beats "incomplete" (nothing blocks a merge
# yet — the tail just needs finishing). "docs-merge" is tested BEFORE the
# incomplete markers precisely because a docs PR never gets those rounds and
# would otherwise be reconciled forever. Within the same reason rank, oldest
# createdAt wins.
#
# The function is pure: it reads only stdin + env. The caller owns the gh call:
#
#   gh pr list --state open \
#     --json number,headRefName,title,isDraft,mergeable,labels,createdAt,author
#
# Env:
#   PR_TRIAGE_AUTHOR   agent's GitHub login; empty (default) disables the check
#
# Exit codes:
#   0 — a PR was picked (verdict has a number)
#   1 — nothing needs attention (verdict {"pr":null}); also for empty/malformed
#       input — a broken sensor must fall through to the normal pick, not crash.

# shellcheck source=scripts/claude-agent/lib/docs-research-paths.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/docs-research-paths.sh"

# The one definition of an "ours"-shaped head branch (see the header). Both
# afk-pickup's slice branches and /afk-resolve's research branches must match,
# and nothing a human hand-names should.
: "${PR_TRIAGE_OURS_RE:=^(feat/issue-[0-9]+|research/[A-Za-z0-9._-]+)$}"

# jq prelude shared by the three programs below: the ours-shaped test and the
# tolerant ticket-number extraction. A research branch may or may not carry the
# ticket number; `capture` raises on no-match, so every branch is guarded with
# `?` and the whole chain falls back to null rather than collapsing the pick.
# shellcheck disable=SC2016  # jq program text: $ours/$title are jq vars.
PR_TRIAGE_JQ_DEFS='
    def ours: .headRefName // "" | test($ours);
    def issue_of:
      ((.headRefName // "" | capture("^feat/issue-(?<n>[0-9]+)$") | .n | tonumber)?
       // (.headRefName // "" | capture("^research/(?<n>[0-9]+)") | .n | tonumber)?
       // ((.title // "") | capture("#(?<n>[0-9]+)") | .n | tonumber)?
       // null);
'

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
            --json number,headRefName,title,isDraft,mergeable,labels,createdAt,author \
            2>/dev/null || echo '[]')"

        unknown="$(printf '%s' "${prs}" | jq --arg ours "${PR_TRIAGE_OURS_RE}" \
            "${PR_TRIAGE_JQ_DEFS}"'
            [ .[]
              | select((.isDraft // false) | not)
              | select(ours)
              | select((.mergeable // "UNKNOWN") == "UNKNOWN") ]
            | length' 2>/dev/null || echo '0')"

        if [ "${unknown:-0}" = "0" ] || [ "${i}" -ge "${tries}" ]; then
            printf '%s' "${prs}" | pr_triage_enrich | pr_triage_pick
            return $?
        fi
        "${sleep_bin}" "${interval}"
    done
}

# pr_triage_enrich: merge the "bot tail finished?" comment signals and the
# "docs-only?" file signal into the PR-list payload so pr_triage_pick can
# triage reasons "incomplete" and "docs-merge".
#
# Reads the `gh pr list --json ...` array on stdin and, for every PR that is
# ours-shaped and otherwise attention-free (open, non-draft, ours branch shape,
# author match, no AFK:revise, not parked, not CONFLICTING), fetches its
# conversation comments AND its changed-file list in ONE
# `gh pr view --json comments,files` round trip (two calls per PR would double
# this sensor's API cost and its rate-limit exposure) and merges:
#   reviewDone — any comment contains the <!-- pr-review-done --> marker
#                (posted by /pr-review via lib/review-poster.sh)
#   verifyDone — any comment matches "Manual verification — .*round"
#                (posted by /verify-pr, one per round; post-reconcile counts)
#   docsOnly   — the PR changes at least one file and every one of them is
#                under docs/research/ (see lib/docs-only-gate.sh, which re-runs
#                the same rule against the real diff before merging)
# Everything else passes through untouched.
#
# Fails SAFE toward "complete": on any gh/jq error the fields stay absent and
# pr_triage_pick's `// true` defaults read the PR as complete, and an absent
# docsOnly is not true so nothing is auto-merged — a broken sensor must never
# start a pick/wake loop, nor land a merge. Known accepted gap: a fire that
# crashed after posting round 1 leaves a FAIL-latest PR looking bot-complete
# (status quo before this class existed).
#
# Env: GH_BIN, PR_TRIAGE_AUTHOR (same semantics as pr_triage_pick).
# Exit: always 0; stdout is the (possibly enriched) payload.
pr_triage_enrich() {
    local gh="${GH_BIN:-gh}" payload nums num view review_done verify_done
    local docs_only fields merged

    payload="$(cat)"

    if ! printf '%s' "${payload}" | jq -e 'type == "array"' >/dev/null 2>&1; then
        printf '%s' "${payload}"
        return 0
    fi

    nums="$(printf '%s' "${payload}" | jq -r --arg author "${PR_TRIAGE_AUTHOR:-}" \
        --arg ours "${PR_TRIAGE_OURS_RE}" "${PR_TRIAGE_JQ_DEFS}"'
        def labels_of: [.labels[]?.name // empty];
        .[]
        | select((.state // "OPEN") == "OPEN")
        | select((.isDraft // false) | not)
        | select(ours)
        | select(($author == "") or ((.author.login // "") == $author))
        | (labels_of) as $lbls
        | select(($lbls | index("AFK:revise") | not)
             and ($lbls | index("AFK:revise-failed") | not)
             and ($lbls | index("AFK:rebase-failed") | not))
        | select((.mergeable // "UNKNOWN") != "CONFLICTING")
        | .number' 2>/dev/null || echo '')"

    for num in ${nums}; do
        fields='{}'

        # ONE round trip for both signals: bot-tail comments (reason
        # "incomplete") and the changed-file list (reason "docs-merge").
        view="$("${gh}" pr view "${num}" --json comments,files 2>/dev/null)" || continue

        review_done="$(printf '%s' "${view}" | jq \
            'any(.comments[]?; .body | contains("<!-- pr-review-done"))' 2>/dev/null)"
        verify_done="$(printf '%s' "${view}" | jq \
            'any(.comments[]?; .body | test("Manual verification — .*round"))' 2>/dev/null)"
        if [ -n "${review_done}" ] && [ -n "${verify_done}" ]; then
            fields="$(printf '%s' "${fields}" | jq -c \
                --argjson r "${review_done}" --argjson v "${verify_done}" \
                '. + {reviewDone: $r, verifyDone: $v}' 2>/dev/null || printf '%s' "${fields}")"
        fi

        # Docs-only signal (reason "docs-merge"): every changed file under the
        # shared research prefix, and at least one. Absent on any gh/jq error →
        # the pick reads it as false, so a broken sensor never auto-merges.
        docs_only="$(printf '%s' "${view}" | jq --arg p "${DOCS_RESEARCH_PREFIX}" \
            'if (.files | type) == "array"
             then ((.files | length) > 0) and all(.files[]; .path | startswith($p))
             else empty end' 2>/dev/null)"
        if [ "${docs_only}" = "true" ] || [ "${docs_only}" = "false" ]; then
            fields="$(printf '%s' "${fields}" | jq -c --argjson d "${docs_only}" \
                '. + {docsOnly: $d}' 2>/dev/null || printf '%s' "${fields}")"
        fi

        [ "${fields}" = "{}" ] && continue
        merged="$(printf '%s' "${payload}" | jq -c             --argjson n "${num}" --argjson f "${fields}"             'map(if .number == $n then . + $f else . end)' 2>/dev/null)" || continue
        [ -n "${merged}" ] && payload="${merged}"
    done

    printf '%s\n' "${payload}"
    return 0
}

# pr_triage_pick: read the PR-list JSON on stdin, print the verdict JSON.
pr_triage_pick() {
    local payload verdict

    payload="$(cat)"

    if ! printf '%s' "${payload}" | jq -e 'type == "array"' >/dev/null 2>&1; then
        printf '{"pr":null}\n'
        return 1
    fi

    verdict="$(printf '%s' "${payload}" | jq -c --arg author "${PR_TRIAGE_AUTHOR:-}" \
        --arg ours "${PR_TRIAGE_OURS_RE}" "${PR_TRIAGE_JQ_DEFS}"'
        def labels_of: [.labels[]?.name // empty];
        [ .[]
          | select((.state // "OPEN") == "OPEN")
          | select((.isDraft // false) | not)
          | select(ours)
          | select(($author == "") or ((.author.login // "") == $author))
          | (labels_of) as $lbls
          | select(($lbls | index("AFK:revise-failed") | not)
                and ($lbls | index("AFK:rebase-failed") | not))
          | . + { reason:
                    (if ($lbls | index("AFK:revise")) then "revise"
                     elif (.mergeable // "UNKNOWN") == "CONFLICTING" then "conflict"
                     elif (.docsOnly == true) then "docs-merge"
                     elif (((.reviewDone != false) and (.verifyDone != false)) | not) then "incomplete"
                     else null end) }
          | select(.reason != null) ]
        | sort_by([(if .reason == "revise" then 0
                    elif .reason == "conflict" then 1
                    elif .reason == "docs-merge" then 2
                    else 3 end), .createdAt])
        | first
        | if . == null then {pr: null}
          else { pr: .number,
                 branch: .headRefName,
                 issue: issue_of,
                 reason: .reason }
          end' 2>/dev/null)"

    if [ -z "${verdict}" ] || [ "$(printf '%s' "${verdict}" | jq -r '.pr')" = "null" ]; then
        printf '{"pr":null}\n'
        return 1
    fi

    printf '%s\n' "${verdict}"
    return 0
}
