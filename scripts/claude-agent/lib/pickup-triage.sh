#!/usr/bin/env bash
# pickup-triage.sh — one-call triage for /afk-pickup §0–§2.
#
# Why this exists: each Bash call the pickup agent makes is one API turn, and
# every turn re-reads the session's full cached context (~1–2M cache-read
# tokens). The §0–§2 preamble used to be 15–20 separate probe turns per fire
# (auth check, login, in-progress gate, PR triage, paused probe, GraphQL pick,
# blocker loop). This script runs the whole read-only decision tree in ONE call
# and emits a single JSON verdict the skill branches on.
#
# READ-ONLY by design: the script never edits labels, comments, branches, or
# PRs. Mutations (lock flips, label moves) stay with the agent — one mutation
# turn per fire is cheap; it is the probe turns that burned the budget.
#
# Sourceable library exposing `pickup_triage`; also runnable directly:
#
#   scripts/claude-agent/lib/pickup-triage.sh          # prints the verdict JSON
#
# Verdict JSON (one line, jq-compact):
#
#   { "verdict": "abort|no-gh|in-flight|reconcile|resume|resume-cap|pick|pick-mcp|idle",
#     "agentLogin": "<login|''>",
#     "useMcpForProject": <bool>,       # gh token missing `project` scope
#     "inflight": <int>,                # open AFK:in-progress count
#     "reconcile": { "pr": N, "branch": "feat/issue-M", "issue": M,
#                    "reason": "revise|conflict|incomplete",
#                    "hadDone": <bool> } | null,
#     "paused":    { "issue": N, "pauseCount": <int>,
#                    "action": "resume|fail" } | null,
#     "pick":      { "issue": N, "title": "...", "priority": "P0|P1|P2" } | null }
#
# Verdict semantics (priority order — first match wins, same as the skill):
#   abort      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS flag missing → skill exits 1
#   no-gh      gh unauthenticated → skill falls back to its GitHub MCP path
#   in-flight  AFK:in-progress lock held → skill exits silent
#   reconcile  a PR needs attention (pr-triage.sh verdict) → skill §1.2
#   resume     paused issue below the resume cap → skill §4 resume path
#   resume-cap paused issue AT the cap → skill applies AFK:failed + comment
#   pick       eligible issue found (blockers closed, unclaimed) → skill §4
#   pick-mcp   token lacks `project` scope → skill runs §2 via GitHub MCP
#   idle       nothing to do → skill exits silent
#
# Exit codes: 0 verdict emitted (any verdict incl. idle); 2 abort; 3 no-gh.
# The JSON is emitted on stdout in ALL cases — branch on .verdict, not just
# the exit code.
#
# §2 pick query shape (one `gh api graphql` call — eligibility is decided
# entirely inside the jq filter, so no per-candidate follow-up calls):
#
#   repository.issues(first: 100, labels: ["AFK"], states: OPEN) { nodes {
#     number title createdAt
#     labels(first: 30) { nodes { name } }
#     blockedBy(first: 50) { nodes { number state } }
#     assignees(first: 10) { nodes { login } }
#     projectItems(first: 10) { nodes { project { number }
#       fieldValueByName(name: "Priority") { ... on
#         ProjectV2ItemFieldSingleSelectValue { name } } } } } }
#
# Eligibility rules applied to those nodes:
#   blockers   GitHub's NATIVE issue dependencies only — every `blockedBy` node
#              must be CLOSED. Body text such as "Blocked by #123" is prose and
#              has no effect on the pick.
#   assignee   never race a human: the issue must be unassigned, or assigned to
#              the daemon's own login (`gh api user`). If that login is unknown
#              (empty), only unassigned issues are eligible.
#   project    must be an item of PICKUP_PROJECT_NUMBER; `Priority` field sorts
#              P0 > P1 > P2 (missing/null = P2), then oldest `createdAt`.
#   labels     none of AFK:in-progress / AFK:done / AFK:failed / AFK:paused.
#
# Env:
#   GH_BIN                  gh CLI (default: gh) — injectable for tests
#   PICKUP_SETTINGS_FILE    settings.json path (default: .claude/settings.json)
#   PICKUP_REPO_OWNER       (default: benjr70)
#   PICKUP_REPO_NAME        (default: Smart-Smoker-V2)
#   PICKUP_PROJECT_NUMBER   GitHub Project number (default: 1)
#   PAUSE_RESUME_CAP        forwarded to pause-resume.sh (default: 3)

_PICKUP_TRIAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=pr-triage.sh
. "${_PICKUP_TRIAGE_DIR}/pr-triage.sh"
# shellcheck source=pause-resume.sh
. "${_PICKUP_TRIAGE_DIR}/pause-resume.sh"

# _pt_emit <verdict> <login> <useMcp> <inflight> <reconcileJson> <pausedJson> <pickJson>
_pt_emit() {
    jq -cn \
        --arg verdict "$1" \
        --arg login "$2" \
        --argjson useMcp "$3" \
        --argjson inflight "$4" \
        --argjson reconcile "$5" \
        --argjson paused "$6" \
        --argjson pick "$7" \
        '{verdict: $verdict, agentLogin: $login, useMcpForProject: $useMcp,
          inflight: $inflight, reconcile: $reconcile, paused: $paused, pick: $pick}'
}

pickup_triage() {
    local gh="${GH_BIN:-gh}"
    local settings="${PICKUP_SETTINGS_FILE:-.claude/settings.json}"
    local owner="${PICKUP_REPO_OWNER:-benjr70}"
    local name="${PICKUP_REPO_NAME:-Smart-Smoker-V2}"
    local project_num="${PICKUP_PROJECT_NUMBER:-1}"
    local login='' use_mcp=false inflight=0

    # §0 — agent-teams env flag. Missing flag means dispatch would refuse
    # anyway; abort before any network call.
    if ! grep -q '"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS"[[:space:]]*:[[:space:]]*"1"' "${settings}" 2>/dev/null; then
        _pt_emit abort '' false 0 null null null
        return 2
    fi

    # §0 — gh auth. Unauthenticated → the skill's MCP fallback owns the fire.
    if ! "${gh}" auth status >/dev/null 2>&1; then
        _pt_emit no-gh '' true 0 null null null
        return 3
    fi
    if ! "${gh}" auth status 2>&1 | grep -q "'project'"; then
        use_mcp=true
    fi
    login="$("${gh}" api user -q .login 2>/dev/null || echo '')"

    # §1 — concurrency lock. A gh error here fails SAFE toward locked (same
    # rule as work-probe.sh): never let a flake start a second in-flight run.
    inflight="$("${gh}" issue list --label AFK:in-progress --state open \
        --json number --jq 'length' 2>/dev/null || echo '')"
    if ! printf '%s' "${inflight}" | grep -qE '^[0-9]+$'; then
        inflight=1
    fi
    if [ "${inflight}" -gt 0 ]; then
        _pt_emit in-flight "${login}" "${use_mcp}" "${inflight}" null null null
        return 0
    fi

    # §1.2 — PR needing attention (pr-triage deep module owns the gh call and
    # the UNKNOWN-mergeability re-list).
    local pick_json reconcile=null
    pick_json="$(PR_TRIAGE_AUTHOR="${login}" pr_triage_scan)" || pick_json=''
    if [ -n "${pick_json}" ] && [ "$(printf '%s' "${pick_json}" | jq -r '.pr' 2>/dev/null)" != "null" ]; then
        local recon_n had_done
        recon_n="$(printf '%s' "${pick_json}" | jq -r '.issue')"
        had_done="$("${gh}" issue view "${recon_n}" --json labels \
            --jq '[.labels[].name] | index("AFK:done") != null' 2>/dev/null || echo 'false')"
        reconcile="$(printf '%s' "${pick_json}" | jq -c --argjson hd "${had_done}" '. + {hadDone: $hd}')"
        _pt_emit reconcile "${login}" "${use_mcp}" 0 "${reconcile}" null null
        return 0
    fi

    # §1.5 — paused work resumes before any new pick. Cap decision belongs to
    # pause-resume.sh; we only gather its inputs.
    local paused_n pause_count action_json action paused=null
    paused_n="$("${gh}" issue list --label AFK:paused --state open \
        --json number --jq '.[0].number // empty' 2>/dev/null || echo '')"
    if [ -n "${paused_n}" ]; then
        pause_count="$("${gh}" issue view "${paused_n}" --json comments \
            --jq '[.comments[] | select(.body | test("Run paused at .*usage exhausted"))] | length' \
            2>/dev/null || echo 0)"
        action_json="$(pause_resume_action "${paused_n}" "${pause_count:-0}")"
        action="$(printf '%s' "${action_json}" | jq -r '.action')"
        paused="$(jq -cn --argjson n "${paused_n}" --argjson c "${pause_count:-0}" --arg a "${action}" \
            '{issue: $n, pauseCount: $c, action: $a}')"
        if [ "${action}" = "resume" ]; then
            _pt_emit resume "${login}" "${use_mcp}" 0 null "${paused}" null
            return 0
        fi
        if [ "${action}" = "fail" ]; then
            _pt_emit resume-cap "${login}" "${use_mcp}" 0 null "${paused}" null
            return 0
        fi
        # pick-new falls through to §2 with the paused context attached.
    fi

    # §2 — fresh pick. The project Priority field needs the `project` scope;
    # without it the agent runs §2 via the GitHub MCP tools instead.
    if [ "${use_mcp}" = "true" ]; then
        _pt_emit pick-mcp "${login}" "${use_mcp}" 0 null "${paused}" null
        return 0
    fi

    local rows
    rows="$("${gh}" api graphql -f query='
query {
  repository(owner: "'"${owner}"'", name: "'"${name}"'") {
    issues(first: 100, labels: ["AFK"], states: OPEN) {
      nodes {
        number
        title
        createdAt
        labels(first: 30) { nodes { name } }
        blockedBy(first: 50) { nodes { number state } }
        assignees(first: 10) { nodes { login } }
        projectItems(first: 10) {
          nodes {
            project { number }
            fieldValueByName(name: "Priority") {
              ... on ProjectV2ItemFieldSingleSelectValue { name }
            }
          }
        }
      }
    }
  }
}' 2>/dev/null \
        | jq -r --argjson pn "${project_num}" --arg login "${login}" '
            def prio_rank:
              if   . == "P0" then 0
              elif . == "P1" then 1
              elif . == "P2" then 2
              else 2 end;
            [.data.repository.issues.nodes[]
              | . as $i
              | ($i.labels.nodes | map(.name)) as $lbls
              | select(($lbls | index("AFK:in-progress") | not)
                    and ($lbls | index("AFK:done") | not)
                    and ($lbls | index("AFK:failed") | not)
                    and ($lbls | index("AFK:paused") | not))
              | select([$i.blockedBy.nodes[] | select(.state != "CLOSED")] | length == 0)
              | ($i.assignees.nodes | map(.login)) as $asgn
              | select(($asgn | length) == 0
                    or (($login != "") and ($asgn | index($login) != null)))
              | ($i.projectItems.nodes | map(select(.project.number == $pn)) | first) as $pi
              | select($pi != null)
              | ($pi.fieldValueByName.name // "P2") as $prio
              | {number, title, createdAt, priority: $prio,
                 prio_rank: ($prio | prio_rank)}]
            | sort_by([.prio_rank, .createdAt])
            | .[] | @base64' 2>/dev/null)" || rows=''

    # Eligibility (blockers, assignee) is decided inside the jq filter above, so
    # the first surviving row IS the pick — no follow-up gh calls.
    local row cand_json cand_n cand_title cand_prio
    for row in ${rows}; do
        cand_json="$(printf '%s' "${row}" | base64 -d 2>/dev/null)" || continue
        cand_n="$(printf '%s' "${cand_json}" | jq -r '.number')"
        cand_title="$(printf '%s' "${cand_json}" | jq -r '.title')"
        cand_prio="$(printf '%s' "${cand_json}" | jq -r '.priority')"
        _pt_emit pick "${login}" "${use_mcp}" 0 null "${paused}" \
            "$(jq -cn --argjson n "${cand_n}" --arg t "${cand_title}" --arg p "${cand_prio}" \
                '{issue: $n, title: $t, priority: $p}')"
        return 0
    done

    _pt_emit idle "${login}" "${use_mcp}" 0 null "${paused}" null
    return 0
}

# Runnable directly: print the verdict and propagate the return code.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    pickup_triage
    exit $?
fi
