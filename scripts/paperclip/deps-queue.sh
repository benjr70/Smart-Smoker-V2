#!/usr/bin/env bash
# deps-queue.sh — feed Dependabot PRs to the Developer, one at a time.
#
# A Dependabot PR has no GitHub issue, so mirror-slices.sh never sees it. This
# script gives each one a Paperclip task (first description line
# `Source: <pr url>`, title `Deps: PR #N — …`) and keeps the lane serial:
#
#   1. Sync: a deps task whose PR merged becomes `done`; one whose PR was
#      closed unmerged (Dependabot superseded it, or a human rejected the
#      bump) becomes `cancelled`.
#   2. Busy: while a deps task is with an agent (`todo`, `in_progress`,
#      `blocked`), nothing new is picked. A task parked with the human
#      (`in_review`: a major bump, or a bump that failed) does not hold the
#      lane.
#   3. Deploy gate: every merge to master builds the nightly images and deploys
#      them to dev-cloud and the virtual smoker. Nothing new is picked until
#      the Dev Deploy for the current master commit has finished green, so
#      each bump lands on a proven deploy and a red deploy stops the lane.
#   4. Pick: the oldest open, non-draft, mergeable Dependabot PR that has no
#      task yet and no `AFK:deps-failed` label gets a task assigned to the
#      Developer. Paperclip wakes the Developer on that assignment.
#
# The Developer verifies, merges and closes the task (its instructions,
# "Dependabot PRs"); this script only queues and tidies.
#
# Usage:
#   scripts/paperclip/deps-queue.sh [--dry-run]
#
# Env:
#   PAPERCLIP_TOKEN               board API key (required)
#   PAPERCLIP_URL                 default http://100.87.112.50:3100
#   PAPERCLIP_COMPANY_ID          default: Smart Smoker company
#   PAPERCLIP_PROJECT_ID          default: Smart Smoker V2 project
#   PAPERCLIP_DEVELOPER_AGENT_ID  default: Developer agent
#   GITHUB_REPO                   default benjr70/Smart-Smoker-V2
#   GITHUB_API                    default https://api.github.com
#   GH_TOKEN                      optional; public reads work without it
#   BUILD_WORKFLOW                default nightly.yml
#   DEPLOY_WORKFLOW               default dev-deploy.yml
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
BUILD_WORKFLOW="${BUILD_WORKFLOW:-nightly.yml}"
DEPLOY_WORKFLOW="${DEPLOY_WORKFLOW:-dev-deploy.yml}"

DRY_RUN=""   # "1" under --dry-run; empty otherwise (so ${DRY_RUN:+…} works)

usage() {
    sed -n '2,42p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

log()  { printf '%s\n' "$*"; }
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

REPORT=()
report() { REPORT+=("$(printf '  %-10s %-8s %-9s %s' "$1" "$2" "$3" "$4")"); }

finish() {
    log "Deps queue report${DRY_RUN:+ (dry run — nothing written)}"
    log "$(printf '  %-10s %-8s %-9s %s' action task pr note)"
    printf '%s\n' "${REPORT[@]}"
    exit 0
}

# ------------------------------------------------------------------- state --

# PR number → task fields, for every task whose first description line is
# `Source: https://github.com/<repo>/pull/<n>`. A PR can have several tasks
# over time (a cancelled one, then a fresh one); the newest wins.
declare -A TASK_ID TASK_IDENT TASK_STATUS

load_tasks() {
    local list
    list="$(pc_api GET "/api/companies/${PAPERCLIP_COMPANY_ID}/issues?projectId=${PAPERCLIP_PROJECT_ID}")"
    while IFS=$'\t' read -r number id ident status; do
        [ -n "${number}" ] || continue
        TASK_ID["${number}"]="${id}"
        TASK_IDENT["${number}"]="${ident}"
        TASK_STATUS["${number}"]="${status}"
    done < <(jq -r --arg p "${PAPERCLIP_PROJECT_ID}" --arg repo "${GITHUB_REPO}" '
        [ .[] | select(.projectId == $p) ] | sort_by(.createdAt // "") | .[]
        | ((.description // "") | split("\n")[0]
            | [match("^Source: https://github.com/" + $repo + "/pull/([0-9]+)\\s*$")?.captures[0].string][0]
          ) as $n
        | select($n != null)
        | [$n, .id, .identifier, .status] | @tsv' <<<"${list}")
}

close_task() {
    local number="$1" status="$2" why="$3"
    local id="${TASK_ID[${number}]}"
    pc_api POST "/api/issues/${id}/comments" "$(jq -n --arg b "${why}" '{body: $b}')" >/dev/null
    pc_api PATCH "/api/issues/${id}" "$(jq -n --arg s "${status}" '{status: $s}')" >/dev/null
    TASK_STATUS["${number}"]="${status}"
}

# --------------------------------------------------------------- the steps --

# sync_tasks — close tasks whose PR is no longer open.
sync_tasks() {
    local number pr
    for number in "${!TASK_ID[@]}"; do
        case "${TASK_STATUS[${number}]}" in done|cancelled) continue ;; esac
        pr="$(gh_api "/repos/${GITHUB_REPO}/pulls/${number}")"
        if [ "$(jq -r '.merged // false' <<<"${pr}")" = true ]; then
            close_task "${number}" done "PR #${number} merged."
            report "done" "${TASK_IDENT[${number}]}" "PR #${number}" "merged"
        elif [ "$(jq -r '.state' <<<"${pr}")" = closed ]; then
            close_task "${number}" cancelled "PR #${number} was closed without merging (superseded or rejected)."
            report "cancelled" "${TASK_IDENT[${number}]}" "PR #${number}" "closed unmerged"
        fi
    done
}

# The two checks below set a flag instead of returning a status: a function
# called as an `if`/`||` condition runs with `set -e` off, which would swallow
# a failed GitHub or Paperclip read inside it.
BUSY=""        # "1" when an agent holds a deps task
GATE=""        # "open" when master's deploy is green

# lane_busy — report and set BUSY when an agent holds a deps task.
lane_busy() {
    local number
    for number in "${!TASK_ID[@]}"; do
        case "${TASK_STATUS[${number}]}" in
            todo|in_progress|blocked)
                report "busy" "${TASK_IDENT[${number}]}" "PR #${number}" "in flight (${TASK_STATUS[${number}]}); nothing picked"
                BUSY=1
                return 0 ;;
        esac
    done
}

# latest_run <workflow> <sha> — "status conclusion" of the newest run of the
# workflow for that master commit, or "none -".
latest_run() {
    gh_api "/repos/${GITHUB_REPO}/actions/workflows/$1/runs?branch=master&per_page=20" | jq -r --arg sha "$2" '
        [ .workflow_runs[]? | select(.head_sha == $sha) ] | sort_by(.created_at) | last
        | if . == null then "none -" else "\(.status) \(.conclusion // "-")" end'
}

# deploy_gate — set GATE=open when master's deploy is green; otherwise report
# why the lane waits.
deploy_gate() {
    local sha build deploy
    sha="$(gh_api "/repos/${GITHUB_REPO}/commits/master" | jq -r '.sha // ""')"
    deploy="$(latest_run "${DEPLOY_WORKFLOW}" "${sha}")"
    case "${deploy}" in
        "completed success") GATE=open; return 0 ;;
        "completed "*)
            report "hold" - - "Dev Deploy for master ${sha:0:7} ended ${deploy#completed }; fix the deploy first"
            return 0 ;;
        "none -") ;;
        *)
            report "wait" - - "Dev Deploy for master ${sha:0:7} is ${deploy%% *}"
            return 0 ;;
    esac
    build="$(latest_run "${BUILD_WORKFLOW}" "${sha}")"
    case "${build}" in
        "completed success"|"none -")
            report "wait" - - "Dev Deploy for master ${sha:0:7} has not started yet" ;;
        "completed "*)
            report "hold" - - "image build for master ${sha:0:7} ended ${build#completed }; fix the build first" ;;
        *)
            report "wait" - - "image build for master ${sha:0:7} is ${build%% *}" ;;
    esac
}

# pick_next — create a task for the oldest eligible Dependabot PR.
pick_next() {
    local prs number url title ref sha state payload created
    prs="$(gh_api "/repos/${GITHUB_REPO}/pulls?state=open&per_page=100")"
    while IFS=$'\t' read -r number url ref sha title; do
        [ -n "${number}" ] || continue
        case "${TASK_STATUS[${number}]:-none}" in none|cancelled) ;; *) continue ;; esac
        state="$(gh_api "/repos/${GITHUB_REPO}/pulls/${number}" | jq -r '.mergeable_state // "unknown"')"
        case "${state}" in
            dirty)   report "skip" - "PR #${number}" "conflicts with master; waiting for Dependabot to rebase it"; continue ;;
            unknown) report "skip" - "PR #${number}" "GitHub is still computing mergeability"; continue ;;
        esac
        payload="$(jq -n --arg title "Deps: PR #${number} — ${title}" --arg url "${url}" --arg n "${number}" \
            --arg ref "${ref}" --arg sha "${sha:0:7}" --arg project "${PAPERCLIP_PROJECT_ID}" \
            --arg dev "${PAPERCLIP_DEVELOPER_AGENT_ID}" '
            { title: $title, projectId: $project, status: "todo", priority: "low", assigneeAgentId: $dev,
              description: ("Source: " + $url + "\n\n"
                + "Dependabot PR #" + $n + ", branch `" + $ref + "`, head `" + $sha + "` when queued.\n\n"
                + "Follow **Dependabot PRs** in your instructions: verify it, merge it when it passes, close this task.") }')"
        created="$(pc_api POST "/api/companies/${PAPERCLIP_COMPANY_ID}/issues" "${payload}")"
        report "queued" "$(jq -r '.identifier // "(new)"' <<<"${created}")" "PR #${number}" "Developer woken"
        return 0
    done < <(jq -r '
        [ .[] | select(.user.login == "dependabot[bot]")
          | select(.head.ref | startswith("dependabot/"))
          | select(.draft != true)
          | select([.labels[]?.name] | index("AFK:deps-failed") | not) ]
        | sort_by(.number) | .[]
        | [ .number, .html_url, .head.ref, .head.sha, .title ] | @tsv' <<<"${prs}")
    report "idle" - - "no Dependabot PR is ready to queue"
}

main() {
    load_tasks
    sync_tasks
    lane_busy
    [ -z "${BUSY}" ] || finish
    deploy_gate
    [ "${GATE}" = open ] || finish
    pick_next
    finish
}

main
