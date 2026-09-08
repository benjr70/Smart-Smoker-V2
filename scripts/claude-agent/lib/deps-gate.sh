#!/usr/bin/env bash
# deps-gate.sh — decide whether a Dependabot PR may be squash-merged.
#
# Why this exists: the gate-and-merge lane lands dependency bumps on master with
# an admin squash and no human in the loop. "It's just a bump, merge it" is a
# judgement call, and a judgement call made by an agent mid-fire is exactly the
# kind of thing that eventually merges a major version bump with red CI, or a
# stray commit somebody pushed onto the bot's branch. This script owns the rule
# instead: one tested gate, one command shape, no discretion. It is a sibling of
# docs-only-gate.sh and deliberately shares its contract, vocabulary and exit
# codes — the two gates are read side by side in afk-pickup §1.2.
#
# The gate DECIDES; it never mutates. It reads the PR (one `gh pr view`) and its
# check list (one `gh pr checks`) and prints the verdict plus the exact merge
# command the caller must run — the lane owns the merge itself, so the one call
# site that can land a commit on master stays reviewable in the skill. No code
# path in this file can merge, edit or comment on anything.
#
# Usage:
#   scripts/claude-agent/lib/deps-gate.sh --pr <N> --head <sha> \
#       [--major true|false] [--security true|false] [--repo <owner/repo>]
#
# `--major` defaults to false. `--security` is accepted for the caller's
# convenience (its per-fire report line carries security=y/n) and NEVER changes
# the verdict: a security bump is merged on the same evidence as any other, it
# is only titled differently, which the title test below already covers.
#
# Output (stdout): one compact JSON verdict, nothing else —
#   { "approved": <bool>, "sha": "<head>",
#     "mergeCmd": "gh pr merge <N> [--repo <owner/repo>] --squash --admin \
#                  --match-head-commit <sha>",
#     "reason": "<why refused>" }   # absent when the verdict approves
#
# The verdict approves only when ALL of these hold:
#   * the PR is open and not a draft — a draft bot PR is one a human parked;
#   * author AND branch pass the Dependabot test: login (lowercased) exactly
#     `app/dependabot` and a head branch starting `dependabot/`. This must agree
#     with pr-triage.sh's `dependabot_pr` (#655): a user account can be renamed
#     `dependabot`, and a `dependabot/…` branch is a shape anyone can push, so
#     only both together buy the lane's admin merge;
#   * the head sha carries BOTH a `tierA=green` and a `tierB=PASS` marker, and
#     the PR has not moved past it (`headRefOid` still equals `--head`). Markers
#     are parsed by lib/deps-lane.sh, which owns the marker format; a marker for
#     any other sha vouches for code that would not merge;
#   * every check is green and at least one ran (same bucket vocabulary as the
#     docs gate: `pass`/`skipping` are green, everything else is not);
#   * the title starts `fix(deps):` or `chore(deps):` AND the PR-title lint
#     check ("Conventional PR title", .github/workflows/pr-title-lint.yml) ran
#     and is green. The title decides whether release-please cuts a patch
#     release for a security fix, so a title nothing vouched for is refused;
#   * the bump is not major, or `reviewDecision == APPROVED` — a breaking change
#     needs a human.
#
# Merge recipe (shared with the docs gate, from the #577 research): the repo has
# auto-merge disabled and master requires a code-owner approval, but
# `enforce_admins` is off — so an admin token squash-merges directly.
# `--match-head-commit` pins the merge to the sha the markers vouch for: if
# anything is pushed between gate and merge, the merge fails rather than landing
# unverified code. `--repo` is carried in `mergeCmd` when given, so the emitted
# command is runnable from any cwd.
#
# Exit codes (two, as the caller contract says — the JSON `reason` says why):
#   0  approved: merge it with `.mergeCmd`, verbatim
#   1  refused. `.reason` is one of
#        not-dependabot    — author or branch is not the Dependabot app's
#        draft-or-closed   — the PR is not open, or is a draft
#        markers-stale     — tier A/B markers are absent, carry another sha, or
#                            the PR moved past --head
#        checks-not-green  — a check is failing or still pending
#        checks-missing    — the check list is EMPTY: nothing ran, so nothing
#                            vouches for the PR (an admin merge also bypasses
#                            branch protection's required-check list)
#        title-not-deps    — the title is not a deps title, or the PR-title lint
#                            check did not run on it
#        major-unapproved  — a major bump without an approving review
#        checks-unreadable — PR state or the check list could not be read
#        usage             — bad/missing arguments (gate could not run)
#      The caller MUST report the last two as harness errors, not as verdicts
#      about the PR: see afk-pickup §1.2's deps-gate reason table.
#
# Env:
#   GH_BIN   gh CLI (default: gh) — injectable for tests

set -uo pipefail

# shellcheck source=scripts/claude-agent/lib/deps-lane.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/deps-lane.sh"

# The check the PR-title lint publishes: the JOB name, which is what
# `gh pr checks --json name` reports (the workflow name, "PR Title Lint", never
# appears there). Rename the job in .github/workflows/pr-title-lint.yml and this
# gate stops approving anything until it is updated here too — which is the
# failure mode we want, since the alternative is approving titles nothing checked.
TITLE_LINT_CHECK='Conventional PR title'

PR=''
HEAD_SHA=''
REPO=''
MAJOR='false'
SECURITY='false'

MERGE_CMD=''

emit() { # emit <approved> <reason|''>
    jq -cn --argjson approved "$1" --arg sha "${HEAD_SHA}" \
        --arg cmd "${MERGE_CMD}" --arg reason "$2" \
        '{approved: $approved, sha: $sha, mergeCmd: $cmd}
         + (if $reason == "" then {} else {reason: $reason} end)'
}

refuse() { # refuse <reason> <stderr line>
    echo "deps-gate: $2" >&2
    emit false "$1"
    exit 1
}

while [ $# -gt 0 ]; do
    case "$1" in
        --pr)       PR="${2:-}"; shift 2 ;;
        --head)     HEAD_SHA="${2:-}"; shift 2 ;;
        --repo)     REPO="${2:-}"; shift 2 ;;
        --major)    MAJOR="${2:-}"; shift 2 ;;
        --security) SECURITY="${2:-}"; shift 2 ;;
        *) refuse usage "unknown arg $1" ;;
    esac
done

if [ -z "${PR}" ] || [ -z "${HEAD_SHA}" ]; then
    refuse usage '--pr and --head are required'
fi

# Both flags must be exactly true|false. Reading an unrecognised `True`/`1`/`yes`
# as "not a major bump" would hand a breaking version bump the unreviewed
# auto-merge path — the one refusal in this file a human is meant to resolve.
for _flag in "--major:${MAJOR}" "--security:${SECURITY}"; do
    _name="${_flag%%:*}"
    _val="${_flag#*:}"
    if [ "${_val}" != "true" ] && [ "${_val}" != "false" ]; then
        refuse usage "${_name} must be exactly true|false, got: ${_val:-<none>}"
    fi
done

GH="${GH_BIN:-gh}"

REPO_ARGS=()
REPO_CMD=''
if [ -n "${REPO}" ]; then
    REPO_ARGS=(--repo "${REPO}")
    REPO_CMD="--repo ${REPO} "
fi
MERGE_CMD="gh pr merge ${PR} ${REPO_CMD}--squash --admin --match-head-commit ${HEAD_SHA}"

# ONE read of the PR: every field the verdict needs, including the comment
# bodies the markers live in. A second read could see a different PR (a push
# lands mid-gate), which would let one field's answer vouch for another field's
# code.
VIEW="$("${GH}" pr view "${PR}" ${REPO_ARGS[@]+"${REPO_ARGS[@]}"} \
    --json state,isDraft,author,headRefName,headRefOid,title,reviewDecision,comments \
    2>/dev/null)" || VIEW=''

if ! printf '%s' "${VIEW}" | jq -e 'type == "object"' >/dev/null 2>&1; then
    refuse checks-unreadable "PR ${PR} state is unreadable"
fi

field() { printf '%s' "${VIEW}" | jq -r "$1 // \"\"" 2>/dev/null; }

STATE="$(field '.state')"
IS_DRAFT="$(field '.isDraft')"
AUTHOR="$(field '.author.login | ascii_downcase')"
BRANCH="$(field '.headRefName')"
HEAD_OID="$(field '.headRefOid')"
TITLE="$(field '.title')"
REVIEW="$(field '.reviewDecision')"

if [ "${STATE}" != "OPEN" ] || [ "${IS_DRAFT}" = "true" ]; then
    refuse draft-or-closed "PR ${PR} is ${STATE}$([ "${IS_DRAFT}" = "true" ] && echo ' and a draft')"
fi

case "${BRANCH}" in
    dependabot/*) ;;
    *) refuse not-dependabot "PR ${PR} head branch ${BRANCH:-<none>} is not a dependabot/ branch" ;;
esac

if [ "${AUTHOR}" != "app/dependabot" ]; then
    refuse not-dependabot "PR ${PR} author ${AUTHOR:-<none>} is not the Dependabot app"
fi

# The PR moving is the same staleness as a marker for another sha: what the lane
# verified is no longer what would merge. Caught here rather than left to
# --match-head-commit so the caller gets a verdict instead of a failed merge.
if [ "${HEAD_OID}" != "${HEAD_SHA}" ]; then
    refuse markers-stale \
        "PR ${PR} head is ${HEAD_OID:-<none>}, not the ${HEAD_SHA} the gate was asked about"
fi

MARKERS="$(printf '%s' "${VIEW}" | jq -r '.comments[]?.body // ""' 2>/dev/null \
    | deps_lane_marker_parse "${HEAD_SHA}")" || MARKERS=''

if ! printf '%s' "${MARKERS}" | jq -e 'type == "object"' >/dev/null 2>&1; then
    refuse markers-stale "marker state for PR ${PR} at ${HEAD_SHA} could not be read"
fi

if [ "$(printf '%s' "${MARKERS}" | jq -r '.tierA and .tierB')" != "true" ]; then
    refuse markers-stale \
        "PR ${PR} has no tierA=green + tierB=PASS markers for ${HEAD_SHA}"
fi

# Green checks stand in for the review this merge is skipping, so read them and
# fail SAFE — an unreadable list, an EMPTY list (nothing ran), a pending check or
# a red one all refuse. `skipping` is benign. Bucket vocabulary note: identical
# to docs-only-gate.sh, and lib/ci-wait.sh applies the same GitHub vocabulary
# from the other side (it counts `pending`/`fail`). Change one, check the others.
CHECKS="$("${GH}" pr checks "${PR}" ${REPO_ARGS[@]+"${REPO_ARGS[@]}"} \
    --json name,bucket 2>/dev/null)" || CHECKS=''

if ! printf '%s' "${CHECKS}" | jq -e 'type == "array"' >/dev/null 2>&1; then
    refuse checks-unreadable "check state for PR ${PR} is unreadable"
fi

if [ "$(printf '%s' "${CHECKS}" | jq 'length')" = "0" ]; then
    refuse checks-missing "PR ${PR} has no checks at all — nothing vouches for it"
fi

NOT_GREEN="$(printf '%s' "${CHECKS}" | jq \
    '[.[] | select((.bucket // "") != "pass" and (.bucket // "") != "skipping")] | length')"

if [ "${NOT_GREEN}" != "0" ]; then
    refuse checks-not-green "${NOT_GREEN} check(s) on PR ${PR} are failing or pending"
fi

case "${TITLE}" in
    'fix(deps):'*|'chore(deps):'*) ;;
    *) refuse title-not-deps "PR ${PR} title is not a deps title: ${TITLE:-<none>}" ;;
esac

# The title lint must have actually run on this PR. Its absence from an
# otherwise-green list is not "nothing to worry about": the workflow is
# path-filtered, and a title nobody linted is a title release-please may read
# differently than the lane assumed.
TITLE_LINTED="$(printf '%s' "${CHECKS}" | jq -r --arg n "${TITLE_LINT_CHECK}" \
    'any(.[]; (.name // "") == $n)')"

if [ "${TITLE_LINTED}" != "true" ]; then
    refuse title-not-deps \
        "PR ${PR} has no ${TITLE_LINT_CHECK} check — nothing vouches for its title"
fi

if [ "${MAJOR}" = "true" ] && [ "${REVIEW}" != "APPROVED" ]; then
    refuse major-unapproved \
        "PR ${PR} is a major bump with reviewDecision ${REVIEW:-<none>}"
fi

emit true ''
exit 0
