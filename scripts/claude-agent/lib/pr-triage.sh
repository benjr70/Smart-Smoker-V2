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
# A Dependabot PR (see below) is verdicted in the same call but a wider shape,
# because the deps lane needs its whole classification up front:
#
#     { "pr": N, "branch": "dependabot/…", "issue": null, "reason": "dependabot",
#       "security": <bool>, "major": <bool>, "sha": "<headRefOid>",
#       "tierA": <bool>, "tierB": <bool>, "attempts": <int> }
#
# and a CONFLICTING one keeps reason "conflict" with one extra key,
# "agentCommits" — true when the branch carries a commit Dependabot did not
# author, which is what decides between an `@dependabot rebase` nudge and the
# agent rebasing the branch itself.
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
#   - the author matches. Which author depends on the branch: a `dependabot/`
#     branch must be authored by the Dependabot app (login `app/dependabot` on a
#     listing), every other shape by PR_TRIAGE_AUTHOR when that env is non-empty.
#     The two tests are exclusive, so a human-named `dependabot/…` branch and a
#     fork PR reusing the shape both fail — the branch prefix is a shape, never
#     a licence — while a Dependabot PR is never rejected for not being the
#     agent's login.
#
# Dependabot PRs — a PR is one only when its author is the Dependabot app AND
# its head branch starts with `dependabot/`. They are the Gate-and-merge lane's
# input and are triaged apart from Agent PRs:
#   - they only ever earn reason "conflict" or "dependabot"; the tail signals
#     (revise / docs-merge / incomplete) describe an Agent PR's review rounds and
#     say nothing about a bot branch, so an `AFK:revise` label on one is ignored;
#   - reason "dependabot" ranks LAST, below every Agent-PR reason: a human
#     waiting on their own PR is never queued behind a bot. Within the reason,
#     security bumps come before version bumps, then oldest createdAt, one per
#     fire;
#   - a bot PR carrying `HITL` (a major bump handed to the maintainer) is
#     invisible until GitHub's reviewDecision is APPROVED — the native approval
#     is how a human re-admits it;
#   - `AFK:deps-failed` (and the draft state that accompanies it) parks a bot PR
#     for good, exactly as the other escalation labels park an Agent PR.
# The lane that acts on a "dependabot" verdict — retitle, tier A/B, fix loop,
# gate, merge — lands in later slices (#656/#657); this module only classifies.
# Until the lane exists BOTH callers deliberately drop EITHER bot verdict on the
# floor, keyed on the `dependabot/` branch (pickup-triage.sh falls through to the
# issue pick, work-probe.sh does not wake): reason "dependabot" has no recipe
# yet, and a bot PR under reason "conflict" would otherwise take the generic
# recipe, which force-pushes a rebase onto a Dependabot-owned branch. A verdict
# nobody can act on correctly must never block the queue behind it.
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
#   gh pr list --state open --json \
#     number,headRefName,title,isDraft,mergeable,labels,createdAt,author,\
#     headRefOid,reviewDecision
#
# Env:
#   PR_TRIAGE_AUTHOR   agent's GitHub login; empty (default) disables the check
#                      for Agent PRs (never for Dependabot PRs)
#   PR_TRIAGE_DEPENDABOT_YML
#                      path whose ABSENCE means "every Dependabot PR is a
#                      security update"; defaults to the repo's
#                      .github/dependabot.yml
#   PR_TRIAGE_DEPS_PROBE_MAX
#                      how many open Dependabot PRs one enrich may probe,
#                      oldest first (default 10) — the rate-limit bound
#
# Exit codes:
#   0 — a PR was picked (verdict has a number)
#   1 — nothing needs attention (verdict {"pr":null}); also for empty/malformed
#       input — a broken sensor must fall through to the normal pick, not crash.

# shellcheck source=scripts/claude-agent/lib/docs-research-paths.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/docs-research-paths.sh"
# The Dependabot lane owns its marker vocabulary (deps_lane_marker_parse); the
# triage only reads markers, never writes them. deps-lane.sh sets `-u` and
# `pipefail` for its own CLI form, and this library is sourced into other
# people's shells (pickup-triage.sh, work-probe.sh, skill steps) — so the
# caller's shell options are captured and restored around the source, or a
# harmless triage read would silently arm `set -u` on everything downstream.
_pr_triage_shell_opts="$(set +o)"
# shellcheck source=scripts/claude-agent/lib/deps-lane.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/deps-lane.sh"
eval "${_pr_triage_shell_opts}"
unset _pr_triage_shell_opts

# The one definition of an "ours"-shaped head branch (see the header). Both
# afk-pickup's slice branches and /afk-resolve's research branches must match,
# and nothing a human hand-names should.
: "${PR_TRIAGE_OURS_RE:=^(feat/issue-[0-9]+|research/[A-Za-z0-9._-]+\
|dependabot/[A-Za-z0-9._/-]+)$}"

# Where the repo's Dependabot config would live. Its ABSENCE is the security
# default (see pr_triage_enrich): with no config every Dependabot PR is a
# security update. Injectable so the tests can point at a path that does or does
# not exist without touching the repo.
_PR_TRIAGE_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
: "${PR_TRIAGE_DEPENDABOT_YML:=${_PR_TRIAGE_REPO_ROOT}/.github/dependabot.yml}"
unset _PR_TRIAGE_REPO_ROOT

# jq prelude shared by the three programs below: the ours-shaped test and the
# tolerant ticket-number extraction. A research branch may or may not carry the
# ticket number; `capture` raises on no-match, so every branch is guarded with
# `?` and the whole chain falls back to null rather than collapsing the pick.
# shellcheck disable=SC2016  # jq program text: $ours/$title are jq vars.
PR_TRIAGE_JQ_DEFS='
    def ours: .headRefName // "" | test($ours);
    def deps_branch: (.headRefName // "") | startswith("dependabot/");
    def deps_author:
      ((.author.login // "") | ascii_downcase)
      | (. == "app/dependabot" or . == "dependabot[bot]" or . == "dependabot");
    def dependabot_pr: deps_branch and deps_author;
    def author_ok:
      if deps_branch then deps_author
      else ($author == "") or ((.author.login // "") == $author) end;
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
    local i prs unknown fields

    # The listing's fields, in one place: the shapes/labels the triage filters
    # on, plus the two the Dependabot verdict is built from (headRefOid keys the
    # lane's markers, reviewDecision re-admits a HITL major).
    fields='number,headRefName,title,isDraft,mergeable,labels,createdAt,author'
    fields="${fields},headRefOid,reviewDecision"

    for ((i = 0; i <= tries; i++)); do
        prs="$("${gh}" pr list --state open --json "${fields}" \
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

# _pr_triage_bump_major <from> <to>: exit 0 when the version move is a MAJOR
# bump in the sense the deps lane cares about — i.e. "a human must look at
# this". That is a leading-component increase, plus the semver-0 rule: below
# 1.0.0 the minor is the breaking-change component (0.4.x → 0.5.0 may break
# everything), so a 0.x minor bump is promoted to major. Anything the parser
# cannot read as two numeric components is a major too: the lane must never
# call an unknown move safe.
_pr_triage_bump_major() {
    local from="$1" to="$2" f_maj f_min t_maj t_min
    f_maj="${from%%.*}"; f_maj="${f_maj%%[!0-9]*}"
    t_maj="${to%%.*}";   t_maj="${t_maj%%[!0-9]*}"
    [ -n "${f_maj}" ] && [ -n "${t_maj}" ] || return 0
    [ "${t_maj}" -gt "${f_maj}" ] && return 0
    if [ "${t_maj}" -eq "${f_maj}" ] && [ "${f_maj}" -eq 0 ]; then
        f_min="${from#*.}"; f_min="${f_min%%.*}"; f_min="${f_min%%[!0-9]*}"
        t_min="${to#*.}";   t_min="${t_min%%.*}"; t_min="${t_min%%[!0-9]*}"
        [ -n "${f_min}" ] && [ -n "${t_min}" ] || return 0
        [ "${t_min}" -gt "${f_min}" ] && return 0
    fi
    return 1
}

# _pr_triage_deps_major <commit-message>: print true|false — the highest bump
# level across every `from A to B` pair in the bot's first commit message.
#
# The commit message, not the PR title: a grouped/multi-dependency PR's title
# carries no versions at all, while the message body lists every dependency it
# moved. Any single major pair makes the whole PR major, and a message with no
# readable pair prints true — an unparseable bump is never landed unattended.
_pr_triage_deps_major() {
    local msg="${1:-}" pairs line from to
    pairs="$(printf '%s' "${msg}" \
        | grep -oE 'from [0-9][0-9A-Za-z.+_-]* to [0-9][0-9A-Za-z.+_-]*')" || pairs=''
    if [ -z "${pairs}" ]; then
        printf 'true'
        return 0
    fi
    while IFS= read -r line; do
        [ -n "${line}" ] || continue
        from="${line#from }"; from="${from%% to *}"
        to="${line##* to }"
        if _pr_triage_bump_major "${from}" "${to}"; then
            printf 'true'
            return 0
        fi
    done <<< "${pairs}"
    printf 'false'
    return 0
}

# _pr_triage_enrich_deps_one <pr-number> < payload > payload
#
# The Dependabot half of pr_triage_enrich: ONE
# `gh pr view <N> --json comments,files,commits,body` round trip per bot PR,
# merged into the payload as the fields the pick and the lane consume:
#
#   depsSecurity — Dependabot's security-update footer in the PR body. The body
#                  rides this round trip rather than the listing on purpose: the
#                  listing is shared with the issue picker, whose contract is
#                  that no gh call it makes ever pulls a body. While the repo
#                  carries no dependabot.yml every Dependabot PR IS a security
#                  update, so an absent footer defaults to true and only flips
#                  to false once that config exists (PR_TRIAGE_DEPENDABOT_YML).
#   depsMajor    — highest bump level over the FIRST commit message's
#                  `from A to B` pairs (see _pr_triage_deps_major).
#   agentCommits — true when any commit on the branch was NOT authored by
#                  Dependabot. Dependabot refuses to rebase a branch carrying
#                  foreign commits, so a conflicting PR with agent commits must
#                  be rebased by the agent itself rather than nudged. Read for
#                  every bot PR, including CONFLICTING ones, which is exactly
#                  why they are probed at all.
#   tierA/tierB/fixAttempts — the lane's own sha-keyed markers, parsed out of
#                  the comment bodies by lib/deps-lane.sh. Markers are keyed to
#                  the CURRENT head sha, so a force-pushed PR reads as fresh and
#                  is fully re-verified.
#
# Fails SAFE: on any gh/jq error the fields stay absent, and pr_triage_pick only
# ever names reason "dependabot" for a PR that carries them — a broken sensor
# yields no bot pick at all rather than a guessed classification.
_pr_triage_enrich_deps_one() {
    local num="$1" gh="${GH_BIN:-gh}" payload view
    local security major agent_commits sha markers fields merged

    payload="$(cat)"

    if ! view="$("${gh}" pr view "${num}" --json comments,files,commits,body 2>/dev/null)"; then
        printf '%s' "${payload}"
        return 0
    fi
    if ! printf '%s' "${view}" | jq -e '(.commits | type) == "array"' >/dev/null 2>&1; then
        printf '%s' "${payload}"
        return 0
    fi

    local body first_msg
    body="$(printf '%s' "${view}" | jq -r '.body // ""' 2>/dev/null)" || body=''
    first_msg="$(printf '%s' "${view}" | jq -r \
        '(.commits[0].messageHeadline // "") + "\n" + (.commits[0].messageBody // "")' \
        2>/dev/null)" || first_msg=''

    security=true
    if ! printf '%s' "${body}" | grep -qiF "automated security fix"; then
        [ -f "${PR_TRIAGE_DEPENDABOT_YML}" ] && security=false
    fi

    major="$(_pr_triage_deps_major "${first_msg}")"

    # A commit is the bot's when any of its authors names dependabot; anything
    # else on the branch is an agent (or human) commit.
    agent_commits="$(printf '%s' "${view}" | jq -c '
        any(.commits[]?;
            (any(.authors[]?;
                 ((.login // "") + " " + (.name // "") + " " + (.email // ""))
                 | ascii_downcase | test("dependabot"))) | not)' 2>/dev/null)"
    [ "${agent_commits}" = "true" ] || [ "${agent_commits}" = "false" ] || agent_commits=false

    fields="$(jq -cn --argjson s "${security}" --argjson m "${major}" \
        --argjson a "${agent_commits}" \
        '{depsSecurity: $s, depsMajor: $m, agentCommits: $a}' 2>/dev/null)" || {
        printf '%s' "${payload}"
        return 0
    }

    # Marker state is meaningful only against the current head sha; with no sha
    # in the listing there is nothing to key on and the PR simply reads fresh.
    sha="$(printf '%s' "${payload}" | jq -r --argjson n "${num}" \
        '.[] | select(.number == $n) | .headRefOid // ""' 2>/dev/null)" || sha=''
    if [ -n "${sha}" ]; then
        markers="$(printf '%s' "${view}" | jq -r '.comments[]?.body // ""' 2>/dev/null \
            | deps_lane_marker_parse "${sha}" 2>/dev/null)" || markers=''
        if [ -n "${markers}" ]; then
            fields="$(printf '%s' "${fields}" | jq -c --argjson m "${markers}" \
                '. + {tierA: $m.tierA, tierB: $m.tierB, fixAttempts: $m.fixAttempts}' \
                2>/dev/null || printf '%s' "${fields}")"
        fi
    fi

    merged="$(printf '%s' "${payload}" | jq -c --argjson n "${num}" --argjson f "${fields}" \
        'map(if .number == $n then . + $f else . end)' 2>/dev/null)" || merged=''
    if [ -n "${merged}" ]; then
        printf '%s' "${merged}"
    else
        printf '%s' "${payload}"
    fi
    return 0
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
    local gh="${GH_BIN:-gh}" payload nums deps_nums num view review_done verify_done
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
        | select(author_ok)
        | select(dependabot_pr | not)
        | (labels_of) as $lbls
        | select(($lbls | index("AFK:revise") | not)
             and ($lbls | index("AFK:revise-failed") | not)
             and ($lbls | index("AFK:rebase-failed") | not))
        | select((.mergeable // "UNKNOWN") != "CONFLICTING")
        | .number' 2>/dev/null || echo '')"

    # Dependabot candidates are selected separately: they are ours by a
    # different author test, they are worth probing even when CONFLICTING (the
    # lane needs to know whether the branch carries foreign commits before it
    # can decide between an `@dependabot rebase` nudge and rebasing itself), and
    # their round trip asks for different json. A parked (AFK:deps-failed) PR
    # and a HITL PR the maintainer has not approved are both invisible to the
    # pick, so they are not probed either — an invisible PR costs no API call.
    #
    # A listing with no headRefOid cannot support a Dependabot verdict at all
    # (the markers are keyed to the head sha, and the lane merges that exact
    # sha), so such an item is not probed: paying a round trip for a
    # classification that can never be picked is pure API cost.
    #
    # The probe is also BOUNDED (PR_TRIAGE_DEPS_PROBE_MAX, default 10): this
    # repo can carry dozens of open bot PRs, only one of which any fire can
    # work, and this sensor runs on every 5-minute work probe as well as every
    # fire. Candidates are taken oldest-first — the queue's own tie-break — so
    # the window is the front of the queue and drains as PRs land. An unprobed
    # PR stays unclassified and is simply not picked.
    deps_nums="$(printf '%s' "${payload}" | jq -r --arg ours "${PR_TRIAGE_OURS_RE}" \
        "${PR_TRIAGE_JQ_DEFS}"'
        def labels_of: [.labels[]?.name // empty];
        [ .[]
          | select((.state // "OPEN") == "OPEN")
          | select((.isDraft // false) | not)
          | select(ours)
          | select(dependabot_pr)
          | select((.headRefOid // "") != "")
          | (labels_of) as $lbls
          | select($lbls | index("AFK:deps-failed") | not)
          | select(($lbls | index("HITL") | not)
               or ((.reviewDecision // "") == "APPROVED")) ]
        | sort_by(.createdAt // "")
        | .[].number' 2>/dev/null | head -n "${PR_TRIAGE_DEPS_PROBE_MAX:-10}" \
        || echo '')"

    for num in ${deps_nums}; do
        payload="$(printf '%s' "${payload}" | _pr_triage_enrich_deps_one "${num}")"
    done

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
          | select(author_ok)
          | (labels_of) as $lbls
          | select(($lbls | index("AFK:revise-failed") | not)
                and ($lbls | index("AFK:rebase-failed") | not)
                and ($lbls | index("AFK:deps-failed") | not))
          | select((dependabot_pr | not)
               or ($lbls | index("HITL") | not)
               or ((.reviewDecision // "") == "APPROVED"))
          | . + { reason:
                    (if dependabot_pr then
                       (if (.mergeable // "UNKNOWN") == "CONFLICTING" then "conflict"
                        elif ((.depsSecurity | type) == "boolean")
                         and ((.depsMajor | type) == "boolean") then "dependabot"
                        else null end)
                     elif ($lbls | index("AFK:revise")) then "revise"
                     elif (.mergeable // "UNKNOWN") == "CONFLICTING" then "conflict"
                     elif (.docsOnly == true) then "docs-merge"
                     elif (((.reviewDone != false) and (.verifyDone != false)) | not) then "incomplete"
                     else null end) }
          | select(.reason != null) ]
        | sort_by([(if .reason == "revise" then 0
                    elif .reason == "conflict" then 1
                    elif .reason == "docs-merge" then 2
                    elif .reason == "incomplete" then 3
                    else 4 end),
                   (if .reason == "dependabot" and (.depsSecurity != true)
                    then 1 else 0 end),
                   .createdAt])
        | first
        | if . == null then {pr: null}
          elif .reason == "dependabot" then
            # issue is pinned to null, never issue_of: a Bot PR has no backing
            # ticket, and a #123 appearing in bot text (a changelog entry, the
            # upstream PR that fixed the CVE) belongs to another repo or another
            # ticket entirely. A caller that took it would lock and comment on
            # an unrelated issue.
            { pr: .number,
              branch: .headRefName,
              issue: null,
              reason: .reason,
              security: (.depsSecurity == true),
              major: (.depsMajor == true),
              sha: (.headRefOid // null),
              tierA: (.tierA == true),
              tierB: (.tierB == true),
              attempts: (.fixAttempts // 0) }
          elif dependabot_pr then
            # Same rule as above: a Bot PR has no backing ticket, so issue is
            # null whichever reason it earned.
            { pr: .number,
              branch: .headRefName,
              issue: null,
              reason: .reason,
              agentCommits: (.agentCommits == true) }
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
