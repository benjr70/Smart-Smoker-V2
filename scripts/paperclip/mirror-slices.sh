#!/usr/bin/env bash
# mirror-slices.sh — mirror GitHub Slices into Paperclip tasks.
#
# Paperclip (the self-hosted agent board on smartsmokersf) executes AFK work;
# GitHub stays the planning surface and the source of truth. This script takes
# a Spec issue (label `spec`) or a standalone Slice/bug and upserts one
# Paperclip task per Slice so the Developer agent runs them in dependency order:
#
#   Spec #749 ─▶ parent task "Spec #749: …" (unassigned, backlog; groups the UI)
#     ├ Slice #750 (AFK)  ─▶ task "#750 …" assigned to Developer, `todo`
#     ├ Slice #751 (AFK, blocked by #750) ─▶ task `blocked`, blockedByIssueIds=[#750's task]
#     └ Slice #752 (HITL) ─▶ task assigned to the human board user (no agent wakes)
#
# Paperclip wakes the Developer on assignment, suppresses the wake while
# blockers are unresolved, and re-wakes it (`issue_blockers_resolved`) when the
# last blocker goes `done`. Closing the GitHub issue (the PR's `Closes #N`
# on merge) drives `done` here: re-run the script after merging.
#
# Usage:
#   scripts/paperclip/mirror-slices.sh [--dry-run] <issue-number-or-url>...
#
# Idempotent: tasks are matched on the first description line
# `Source: https://github.com/<repo>/issues/<n>`; a re-run updates title, body,
# priority and planning blockers and closes tasks whose issue closed. It never
# touches the status or assignee of an open task (the agents own those) and it
# keeps blockers that are the task's own child tasks (the Developer's review/QA
# fan-in).
#
# Env:
#   PAPERCLIP_TOKEN               board API key (required unless --dry-run with
#                                 no Paperclip reads; always needed in practice)
#   PAPERCLIP_URL                 default http://100.87.112.50:3100
#   PAPERCLIP_COMPANY_ID          default: Smart Smoker company
#   PAPERCLIP_PROJECT_ID          default: Smart Smoker V2 project
#   PAPERCLIP_DEVELOPER_AGENT_ID  default: Developer agent
#   PAPERCLIP_HUMAN_USER_ID       default: Ben's board user (HITL assignee)
#   GITHUB_REPO                   default benjr70/Smart-Smoker-V2
#   GH_BIN / CURL_BIN             injectable for tests
#
# Exit codes: 0 ok · 1 usage · 2 GitHub read failed · 3 Paperclip call failed.

set -euo pipefail

GH_BIN="${GH_BIN:-gh}"
CURL_BIN="${CURL_BIN:-curl}"
PAPERCLIP_URL="${PAPERCLIP_URL:-http://100.87.112.50:3100}"
PAPERCLIP_COMPANY_ID="${PAPERCLIP_COMPANY_ID:-e2c1393c-c5be-4c5b-9715-284d2c54e3cc}"
PAPERCLIP_PROJECT_ID="${PAPERCLIP_PROJECT_ID:-1e110bfa-99e3-486d-a471-651ae20a0bdf}"
PAPERCLIP_DEVELOPER_AGENT_ID="${PAPERCLIP_DEVELOPER_AGENT_ID:-feddb854-9923-4150-9446-04627cea4c60}"
PAPERCLIP_HUMAN_USER_ID="${PAPERCLIP_HUMAN_USER_ID:-tj67AGmlwzUsScEAFewX9guPTOvfR2mm}"
GITHUB_REPO="${GITHUB_REPO:-benjr70/Smart-Smoker-V2}"

DRY_RUN=0
ISSUES=()

usage() {
    sed -n '2,32p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

log()  { printf '%s\n' "$*"; }
warn() { printf 'warn: %s\n' "$*" >&2; }
die()  { printf 'error: %s\n' "$2" >&2; exit "$1"; }

for arg in "$@"; do
    case "${arg}" in
        --dry-run) DRY_RUN=1 ;;
        -h|--help) usage; exit 0 ;;
        *)
            n="${arg##*/}"
            n="${n#\#}"
            [[ "${n}" =~ ^[0-9]+$ ]] || die 1 "not an issue number or URL: ${arg}"
            ISSUES+=("${n}") ;;
    esac
done
[ "${#ISSUES[@]}" -gt 0 ] || { usage >&2; exit 1; }
[ -n "${PAPERCLIP_TOKEN:-}" ] || die 1 "PAPERCLIP_TOKEN is not set"

exec 3>&1
OWNER="${GITHUB_REPO%%/*}"
NAME="${GITHUB_REPO##*/}"

# ---------------------------------------------------------------- Paperclip --

# pc_api <method> <path> [json-body] — prints the response body. Writes are
# printed instead of sent under --dry-run.
pc_api() {
    local method="$1" path="$2" body="${3:-}"
    if [ "${DRY_RUN}" = 1 ] && [ "${method}" != GET ]; then
        # fd 3 is the terminal's stdout; callers capture this function's stdout.
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

# gh_tree <number> — the issue plus its sub-issues, blockers and Priority, in one
# GraphQL call. Lists are defaulted in jq so a partial node never aborts a run.
gh_tree() {
    local number="$1"
    local fields='
        number databaseId url title body state stateReason
        labels(first: 30) { nodes { name } }
        blockedBy(first: 50) { nodes { number state } }
        projectItems(first: 10) { nodes { project { number }
          fieldValueByName(name: "Priority") {
            ... on ProjectV2ItemFieldSingleSelectValue { name } } } }'
    local raw
    raw="$("${GH_BIN}" api graphql -f query="
query {
  repository(owner: \"${OWNER}\", name: \"${NAME}\") {
    issue(number: ${number}) {
      ${fields}
      subIssues(first: 50) { nodes { ${fields} } }
    }
  }
}" 2>/dev/null)" || true
    if ! jq -e '.data.repository.issue != null' <<<"${raw}" >/dev/null 2>&1; then
        # gh prints the GraphQL body even on failure; show each distinct message once.
        { jq -r '(.errors // [])[].message' <<<"${raw}" 2>/dev/null | sort -u | grep . || printf '%s\n' "${raw}"; } >&2
        return 1
    fi
    jq -e '
        def node: {
            number, databaseId, url, title,
            body: (.body // ""),
            state: (.state // "OPEN"),
            stateReason: (.stateReason // null),
            labels: [(.labels.nodes // [])[] | .name],
            blockedBy: [(.blockedBy.nodes // [])[] | {number, state}],
            priority: (
                [(.projectItems.nodes // [])[]
                    | select(.project.number == 1)
                    | .fieldValueByName.name // empty][0] // "P2")
        };
        .data.repository.issue | node + { subIssues: [(.subIssues.nodes // [])[] | node] }' <<<"${raw}"
}

# ----------------------------------------------------------------- mapping --

pc_priority() { case "$1" in P0) echo critical ;; P1) echo high ;; *) echo medium ;; esac; }

# pc_closed_status <stateReason> — status for a closed GitHub issue.
pc_closed_status() { case "${1:-}" in NOT_PLANNED|DUPLICATE) echo cancelled ;; *) echo done ;; esac; }

# ------------------------------------------------------------------- state --

declare -A TASK_ID=()      # github number → paperclip task id
declare -A TASK_STATUS=()  # github number → paperclip status
declare -A TASK_PARENT=()  # paperclip task id → parentId
TOUCHED=()                 # github numbers handled in this run
REPORT=()

# load_existing — index this project's tasks by the `Source:` URL on their first
# description line.
load_existing() {
    local list
    list="$(pc_api GET "/api/companies/${PAPERCLIP_COMPANY_ID}/issues?projectId=${PAPERCLIP_PROJECT_ID}")"
    # Parentage of every project task (child tasks carry no Source line).
    while IFS=$'\t' read -r id parent; do
        [ -n "${id}" ] && TASK_PARENT["${id}"]="${parent}"
    done < <(jq -r --arg p "${PAPERCLIP_PROJECT_ID}" '
        .[] | select(.projectId == $p) | [.id, (.parentId // "")] | @tsv' <<<"${list}")
    while IFS=$'\t' read -r number id status parent; do
        [ -n "${number}" ] || continue
        TASK_ID["${number}"]="${id}"
        TASK_STATUS["${number}"]="${status}"
    done < <(jq -r --arg p "${PAPERCLIP_PROJECT_ID}" --arg repo "${GITHUB_REPO}" '
        .[] | select(.projectId == $p)
        | ((.description // "") | split("\n")[0]
            | [match("^Source: https://github.com/" + $repo + "/issues/([0-9]+)\\s*$")?.captures[0].string][0]
          ) as $n
        | select($n != null)
        | [$n, .id, .status, (.parentId // "")] | @tsv' <<<"${list}")
}

# own_child_blockers <task-id> — blockers of the task that are its own children
# (the Developer's review/QA fan-in), which a mirror run must keep. The blocker
# entries carry no parentId, so parentage comes from the project index.
own_child_blockers() {
    local id="$1" b
    while read -r b; do
        [ -n "${b}" ] && [ "${TASK_PARENT[${b}]:-}" = "${id}" ] && echo "${b}"
    done < <(pc_api GET "/api/issues/${id}" | jq -r '(.blockedBy // [])[] | .id')
}

# has_children <task-id> — true once the Developer has opened child tasks on it.
has_children() {
    local id="$1" p
    for p in "${TASK_PARENT[@]}"; do [ "${p}" = "${id}" ] && return 0; done
    return 1
}

# upsert <node-json> <parent-task-id|""> <kind: spec|slice>
upsert() {
    local node="$1" parent="$2" kind="$3"
    local number title url body state reason prio labels
    number="$(jq -r .number <<<"${node}")"
    title="$(jq -r .title <<<"${node}")"
    url="$(jq -r .url <<<"${node}")"
    body="$(jq -r .body <<<"${node}")"
    state="$(jq -r .state <<<"${node}")"
    reason="$(jq -r '.stateReason // ""' <<<"${node}")"
    prio="$(pc_priority "$(jq -r .priority <<<"${node}")")"
    labels="$(jq -r '.labels | join(" ")' <<<"${node}")"

    local pc_title assignee_field assignee_id
    if [ "${kind}" = spec ]; then
        pc_title="Spec #${number}: ${title}"
        assignee_field=""; assignee_id=""
    else
        pc_title="#${number} ${title}"
        case " ${labels} " in
            *" AFK "*)  assignee_field=assigneeAgentId; assignee_id="${PAPERCLIP_DEVELOPER_AGENT_ID}" ;;
            *" HITL "*) assignee_field=assigneeUserId;  assignee_id="${PAPERCLIP_HUMAN_USER_ID}" ;;
            *) warn "#${number} is neither AFK nor HITL; skipped"; return 0 ;;
        esac
    fi
    TOUCHED+=("${number}")
    local description
    description="$(printf 'Source: %s\n\n%s' "${url}" "${body}")"

    # Planning blockers → task ids. Unmirrored blockers are reported, not fatal.
    local blocker_ids=() open_blocker=0
    while IFS=$'\t' read -r bn bs; do
        [ -n "${bn}" ] || continue
        if [ -n "${TASK_ID[${bn}]:-}" ]; then
            blocker_ids+=("${TASK_ID[${bn}]}")
        else
            warn "#${number} is blocked by #${bn}, which has no Paperclip task (mirror it too)"
        fi
        [ "${bs}" = OPEN ] && open_blocker=1
    done < <(jq -r '.blockedBy[] | [.number, .state] | @tsv' <<<"${node}")

    local existing="${TASK_ID[${number}]:-}"
    if [ -z "${existing}" ]; then
        # ---- create
        local status
        if [ "${state}" = CLOSED ]; then status="$(pc_closed_status "${reason}")"
        elif [ "${kind}" = spec ]; then status=backlog
        elif [ "${open_blocker}" = 1 ]; then status=blocked
        else status=todo; fi
        local payload
        payload="$(jq -cn \
            --arg title "${pc_title}" --arg description "${description}" \
            --arg project "${PAPERCLIP_PROJECT_ID}" --arg parent "${parent}" \
            --arg status "${status}" --arg prio "${prio}" \
            --arg afield "${assignee_field}" --arg aid "${assignee_id}" \
            --arg key "gh-$(jq -r .databaseId <<<"${node}")" \
            --argjson blockers "$(printf '%s\n' "${blocker_ids[@]:-}" | jq -R 'select(length>0)' | jq -cs .)" '
            { title: $title, description: $description, projectId: $project,
              status: $status, priority: $prio, idempotencyKey: $key, allowDuplicate: true }
            + (if $parent != "" then { parentId: $parent } else {} end)
            + (if $afield != "" then { ($afield): $aid } else {} end)
            + (if ($blockers | length) > 0 then { blockedByIssueIds: $blockers } else {} end)')"
        local created id
        created="$(pc_api POST "/api/companies/${PAPERCLIP_COMPANY_ID}/issues" "${payload}")"
        id="$(jq -r '.id // empty' <<<"${created}")"
        [ -n "${id}" ] || id="new:#${number}"
        TASK_ID["${number}"]="${id}"; TASK_STATUS["${number}"]="${status}"; TASK_PARENT["${id}"]="${parent}"
        REPORT+=("created  $(jq -r '.identifier // "(dry-run)"' <<<"${created}")  #${number}  ${status}  ${pc_title}")
    else
        # ---- update. Content (title, body, priority) is refreshed only while the
        # task is still at the planning stage; once an agent has started it the
        # task text is theirs. Blockers merge with the task's own children; status
        # changes only on a GitHub close; the assignee is never touched.
        local keep=() current="${TASK_STATUS[${number}]}" started=false
        case "${current}" in todo|backlog|blocked) ;; *) started=true ;; esac
        has_children "${existing}" && started=true
        while read -r k; do [ -n "${k}" ] && keep+=("${k}"); done < <(own_child_blockers "${existing}")
        local status_patch='{}'
        if [ "${state}" = CLOSED ] && [[ "${current}" != done && "${current}" != cancelled ]]; then
            status_patch="$(jq -cn --arg s "$(pc_closed_status "${reason}")" '{status: $s}')"
        fi
        local payload
        payload="$(jq -cn \
            --arg title "${pc_title}" --arg description "${description}" --arg prio "${prio}" \
            --argjson status "${status_patch}" \
            --argjson is_spec "$([ "${kind}" = spec ] && echo true || echo false)" \
            --argjson started "${started}" \
            --argjson blockers "$(printf '%s\n' "${blocker_ids[@]:-}" "${keep[@]:-}" | jq -R 'select(length>0)' | jq -cs 'unique')" '
            (if $started then {} else { title: $title, description: $description, priority: $prio } end)
            + $status
            + (if $is_spec then {} else { blockedByIssueIds: $blockers } end)')"
        pc_api PATCH "/api/issues/${existing}" "${payload}" >/dev/null
        local new_status; new_status="$(jq -r '.status // empty' <<<"${status_patch}")"
        [ -n "${new_status}" ] && TASK_STATUS["${number}"]="${new_status}"
        REPORT+=("updated  ${existing:0:8}  #${number}  ${TASK_STATUS[${number}]}  ${pc_title}")
    fi
}

# topo_sort <tree-json> — sub-issues ordered blockers-first (edges inside the set).
topo_sort() {
    jq -c '
        .subIssues as $all
        | ($all | map(.number)) as $in
        | def internal_blockers: [.blockedBy[].number | select(. as $b | ($in | index($b)) != null)];
          reduce range(0; ($all | length) + 1) as $_ (
            { done: [], rest: $all };
            if (.rest | length) == 0 then .
            else
              (.done | map(.number)) as $seen
              | (.rest | map(select(internal_blockers | all(. as $b | ($seen | index($b)) != null)))) as $ready
              | if ($ready | length) == 0 then { done: (.done + .rest), rest: [] }   # cycle: emit as-is
                else { done: (.done + $ready),
                       rest: (.rest | map(select(.number as $n | ($ready | map(.number) | index($n)) == null))) }
                end
            end)
        | .done[]' <<<"$1"
}

# -------------------------------------------------------------------- main --

load_existing
for number in "${ISSUES[@]}"; do
    tree="$(gh_tree "${number}")" || die 2 "could not read issue #${number} from GitHub (gh needs the repo and read:project scopes: gh auth refresh -s read:project)"
    if jq -e '.labels | index("spec")' >/dev/null <<<"${tree}"; then
        log "Spec #${number}: $(jq -r .title <<<"${tree}")"
        upsert "$(jq -c 'del(.subIssues)' <<<"${tree}")" "" spec
        parent_id="${TASK_ID[${number}]}"
        while read -r slice; do
            upsert "${slice}" "${parent_id}" slice
        done < <(topo_sort "${tree}")
    else
        log "Issue #${number}: $(jq -r .title <<<"${tree}")"
        upsert "$(jq -c 'del(.subIssues)' <<<"${tree}")" "" slice
    fi
done

log ""
log "Mirror report$( [ "${DRY_RUN}" = 1 ] && echo ' (dry run — nothing written)')"
for line in "${REPORT[@]:-}"; do [ -n "${line}" ] && log "  ${line}"; done
frontier=()
for n in "${TOUCHED[@]:-}"; do
    [ -n "${n}" ] && [ "${TASK_STATUS[${n}]:-}" = todo ] && frontier+=("#${n}")
done
log "  frontier (todo, takeable now): ${frontier[*]:-none}"
