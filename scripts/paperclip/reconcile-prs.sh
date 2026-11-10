#!/usr/bin/env bash
# reconcile-prs.sh — wake the Developer when one of its PRs conflicts with master.
#
# A PR based on master only turns conflicting when master moves, and master
# only moves when a PR merges. This script runs right after a merge (the same
# moment mirror-slices.sh runs) and on a timer, finds every open PR that
# belongs to a Paperclip task, and for each one GitHub reports as `dirty`
# (real merge conflict) it:
#
#   1. posts one comment on the task, headed `rebase-requested: PR #N`, with
#      the rebase + reverify recipe the Developer follows;
#   2. hands the task back to the Developer (`in_progress`, assigneeAgentId).
#      Paperclip wakes the Developer on that reassignment.
#
# A PR is linked to a task through its body's `Closes #N` (or Fixes/Resolves):
# issue N is the task whose first description line is `Source: …/issues/N`,
# the same identity key mirror-slices.sh uses. Bot PRs and PRs with no closing
# keyword are ignored.
#
# Only a task waiting on the human (`in_review`) is woken. A task the Developer
# holds (`in_progress`) rebases before it pushes anyway; a task in a review
# round (`blocked` on its child tasks) is rebased by the Developer at fan-in.
# A task whose latest rebase marker is `rebase: FAILED` is left for the human.
#
# Usage:
#   scripts/paperclip/reconcile-prs.sh [--dry-run]
#
# Env:
#   PAPERCLIP_TOKEN               board API key (required)
#   PAPERCLIP_URL                 default http://100.87.112.50:3100
#   PAPERCLIP_COMPANY_ID          default: Smart Smoker company
#   PAPERCLIP_PROJECT_ID          default: Smart Smoker V2 project
#   PAPERCLIP_DEVELOPER_AGENT_ID  default: Developer agent
#   GITHUB_REPO                   default benjr70/Smart-Smoker-V2
#   GITHUB_API                    default https://api.github.com
#   GH_TOKEN                      optional; the repo is public, so reads work
#                                 without it (60 requests/hour unauthenticated)
#   CURL_BIN                      injectable for tests
#
# Exit codes: 0 ok · 1 usage · 2 GitHub read failed · 3 Paperclip call failed.

set -euo pipefail

CURL_BIN="${CURL_BIN:-curl}"
PAPERCLIP_URL="${PAPERCLIP_URL:-http://100.87.112.50:3100}"
PAPERCLIP_COMPANY_ID="${PAPERCLIP_COMPANY_ID:-e2c1393c-c5be-4c5b-9715-284d2c54e3cc}"
PAPERCLIP_PROJECT_ID="${PAPERCLIP_PROJECT_ID:-1e110bfa-99e3-486d-a471-651ae20a0bdf}"
PAPERCLIP_DEVELOPER_AGENT_ID="${PAPERCLIP_DEVELOPER_AGENT_ID:-feddb854-9923-4150-9446-04627cea4c60}"
GITHUB_REPO="${GITHUB_REPO:-benjr70/Smart-Smoker-V2}"
GITHUB_API="${GITHUB_API:-https://api.github.com}"
GH_TOKEN="${GH_TOKEN:-}"

DRY_RUN=""   # "1" under --dry-run; empty otherwise (so ${DRY_RUN:+…} works)

usage() {
    sed -n '2,42p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

log()  { printf '%s\n' "$*"; }
warn() { printf 'warn: %s\n' "$*" >&2; }
die()  { printf 'error: %s\n' "$2" >&2; exit "$1"; }

while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run) DRY_RUN=1; shift ;;
        -h|--help) usage; exit 0 ;;
        *) usage >&2; die 1 "unknown argument: $1" ;;
    esac
done
[ -n "${PAPERCLIP_TOKEN:-}" ] || die 1 "PAPERCLIP_TOKEN is not set"
command -v jq >/dev/null || die 1 "jq is required"

# fd 3 is the terminal's stdout; dry-run "would …" lines go there so callers
# that capture pc_api's stdout still get valid JSON.
exec 3>&1

# --------------------------------------------------------------- Paperclip --

pc_api() {
    local method="$1" path="$2" body="${3:-}"
    if [ "${DRY_RUN}" = 1 ] && [ "${method}" != GET ]; then
        log "  would ${method} ${path} $(jq -c . <<<"${body}")" >&3
        echo '{}'
        return 0
    fi
    local out code
    out="$("${CURL_BIN}" -sS -X "${method}" \
        -H "Authorization: Bearer ${PAPERCLIP_TOKEN}" \
        -H 'Content-Type: application/json' \
        ${body:+-d "${body}"} \
        -w '\n%{http_code}' "${PAPERCLIP_URL}${path}")" || die 3 "${method} ${path}: curl failed"
    code="${out##*$'\n'}"
    out="${out%$'\n'*}"
    [[ "${code}" =~ ^2 ]] || die 3 "${method} ${path} → HTTP ${code}: ${out:0:300}"
    printf '%s' "${out}"
}

# ------------------------------------------------------------------ GitHub --

gh_api() {
    local path="$1" out code
    out="$("${CURL_BIN}" -sS \
        -H 'Accept: application/vnd.github+json' \
        ${GH_TOKEN:+-H "Authorization: Bearer ${GH_TOKEN}"} \
        -w '\n%{http_code}' "${GITHUB_API}${path}")" || die 2 "GET ${path}: curl failed"
    code="${out##*$'\n'}"
    out="${out%$'\n'*}"
    [[ "${code}" =~ ^2 ]] || die 2 "GET ${path} → HTTP ${code}: ${out:0:300}"
    printf '%s' "${out}"
}

# ------------------------------------------------------------------- state --

declare -A TASK_ID TASK_IDENT TASK_STATUS TASK_AGENT

# load_tasks — index the project's mirrored tasks by GitHub issue number.
load_tasks() {
    local list
    list="$(pc_api GET "/api/companies/${PAPERCLIP_COMPANY_ID}/issues?projectId=${PAPERCLIP_PROJECT_ID}")"
    while IFS=$'\t' read -r number id ident status agent; do
        [ -n "${number}" ] || continue
        TASK_ID["${number}"]="${id}"
        TASK_IDENT["${number}"]="${ident}"
        TASK_STATUS["${number}"]="${status}"
        TASK_AGENT["${number}"]="${agent}"
    done < <(jq -r --arg p "${PAPERCLIP_PROJECT_ID}" --arg repo "${GITHUB_REPO}" '
        .[] | select(.projectId == $p)
        | ((.description // "") | split("\n")[0]
            | [match("^Source: https://github.com/" + $repo + "/issues/([0-9]+)\\s*$")?.captures[0].string][0]
          ) as $n
        | select($n != null)
        | [$n, .id, .identifier, .status, (.assigneeAgentId // "")] | @tsv' <<<"${list}")
}

# last_rebase_marker <task-id> — "requested" | "failed" | "" from the newest
# comment that starts with `rebase-requested:` or `rebase: FAILED`.
last_rebase_marker() {
    pc_api GET "/api/issues/$1/comments" | jq -r '
        [ .[] | select((.body // "") | test("^(rebase-requested:|rebase: FAILED)")) ]
        | sort_by(.createdAt) | last
        | if . == null then ""
          elif (.body | startswith("rebase: FAILED")) then "failed"
          else "requested" end'
}

# ---------------------------------------------------------------- the pass --

REPORT=()
report() { REPORT+=("$(printf '  %-18s %-7s PR #%-5s %-8s %s' "$1" "$2" "$3" "$4" "$5")"); }

request_rebase() {
    local number="$1" pr="$2" pr_url="$3" master_sha="$4"
    local id="${TASK_ID[${number}]}" ident="${TASK_IDENT[${number}]}" body
    body="$(jq -n --arg pr "${pr}" --arg url "${pr_url}" --arg sha "${master_sha:0:7}" '
        { body: ("rebase-requested: PR #" + $pr + "\n\n"
            + "PR #" + $pr + " (" + $url + ") conflicts with `master` (GitHub merge state `dirty`, master at `" + $sha + "`).\n\n"
            + "In your worktree: `git fetch origin master && git rebase origin/master`, resolve the conflicts, run the gates, then `git push --force-with-lease`.\n\n"
            + "Then reverify. Open a QA child task always. Open a Code review child task too when resolving the conflicts changed code by hand. "
            + "When both verdicts pass, hand the task back to `in_review` as usual.\n\n"
            + "If the rebase cannot be completed, comment `rebase: FAILED — <files>` and hand the task back to `in_review`.") }')"
    # Comment first: the task is assigned to the human at this point, so the
    # comment wakes nobody. The reassignment below is the single wake.
    pc_api POST "/api/issues/${id}/comments" "${body}" >/dev/null
    pc_api PATCH "/api/issues/${id}" "$(jq -n --arg dev "${PAPERCLIP_DEVELOPER_AGENT_ID}" \
        '{status: "in_progress", assigneeAgentId: $dev, assigneeUserId: null}')" >/dev/null
    report "rebase requested" "${ident}" "${pr}" dirty "Developer woken"
}

main() {
    load_tasks
    local prs master_sha
    prs="$(gh_api "/repos/${GITHUB_REPO}/pulls?state=open&per_page=100")"
    master_sha="$(gh_api "/repos/${GITHUB_REPO}/commits/master" | jq -r '.sha // ""')"

    local pr url closes number
    while IFS=$'\t' read -r pr url closes; do
        [ -n "${pr}" ] || continue
        number="${closes}"
        [ -n "${number}" ] && [ -n "${TASK_ID[${number}]:-}" ] || continue
        local ident="${TASK_IDENT[${number}]}" status="${TASK_STATUS[${number}]}"
        case "${status}" in
            done|cancelled) report "skip" "${ident}" "${pr}" - "task ${status}"; continue ;;
        esac
        local state
        state="$(gh_api "/repos/${GITHUB_REPO}/pulls/${pr}" | jq -r '.mergeable_state // "unknown"')"
        case "${state}" in
            dirty) ;;
            unknown) report "unknown" "${ident}" "${pr}" unknown "GitHub is still computing mergeability"; continue ;;
            *) report "ok" "${ident}" "${pr}" "${state}" ""; continue ;;
        esac
        case "${status}" in
            in_progress)
                report "conflict, wait" "${ident}" "${pr}" dirty "Developer holds it; rebases before pushing" ;;
            blocked)
                report "conflict, wait" "${ident}" "${pr}" dirty "review round in flight; Developer rebases at fan-in" ;;
            in_review)
                case "$(last_rebase_marker "${TASK_ID[${number}]}")" in
                    failed) report "conflict, human" "${ident}" "${pr}" dirty "earlier rebase FAILED; needs a human" ;;
                    *) request_rebase "${number}" "${pr}" "${url}" "${master_sha}" ;;
                esac ;;
            *)
                report "conflict, odd" "${ident}" "${pr}" dirty "task is ${status}; nothing to wake" ;;
        esac
    done < <(jq -r '
        .[] | select(.draft != true)
        | select(.head.repo.full_name == .base.repo.full_name)
        | [ .number, .html_url,
            (((.body // "") | capture("(?i)(close[sd]?|fix(e[sd])?|resolve[sd]?) #(?<n>[0-9]+)")?.n) // "") ]
        | @tsv' <<<"${prs}")

    log "Reconcile report${DRY_RUN:+ (dry run — nothing written)}"
    log "$(printf '  %-18s %-7s %-9s %-8s %s' action task pr state note)"
    if [ "${#REPORT[@]}" -eq 0 ]; then
        log "  (no open PR is linked to a Paperclip task)"
    else
        printf '%s\n' "${REPORT[@]}"
    fi
}

main
