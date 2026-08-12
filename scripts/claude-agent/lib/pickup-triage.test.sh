#!/usr/bin/env bash
# Tests for scripts/claude-agent/lib/pickup-triage.sh
#
# Run: bash scripts/claude-agent/lib/pickup-triage.test.sh
#
# Strategy: pickup_triage's gh calls go through an injected GH_BIN stub serving
# canned per-query fixtures from a temp workspace (same pattern as
# work-probe.test.sh). Each test builds the GitHub-side state and asserts the
# single JSON verdict — the external contract the team-pickup skill branches
# on — never the internals.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=pickup-triage.sh
. "${SCRIPT_DIR}/pickup-triage.sh"

TESTS_RUN=0
TESTS_FAILED=0
FAILED_NAMES=()

pass() {
    TESTS_RUN=$((TESTS_RUN + 1))
    echo "  PASS: $1"
}

fail() {
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILED_NAMES+=("$1")
    echo "  FAIL: $1"
    if [ -n "${2:-}" ]; then
        echo "    $2"
    fi
}

# Build a workspace: gh stub + default "authed, scoped, nothing happening"
# fixtures + a settings.json with the agent-teams flag. Echoes the dir.
make_env() {
    local dir; dir="$(mktemp -d)"
    cat > "${dir}/gh-stub" <<EOF
#!/usr/bin/env bash
args="\$*"
case "\${args}" in
    "auth status")               # bare probe: exit code decides authed-or-not
        cat "${dir}/auth.out"
        exit \$(cat "${dir}/auth.code") ;;
    *"api user"*)                cat "${dir}/login.out" ;;
    *"--label team:in-progress"*) cat "${dir}/locked.out" ;;
    *"--label team:paused"*)     cat "${dir}/paused.out" ;;
    *"pr list"*)                 cat "${dir}/prs.out" ;;
    *"pr view"*)                 cat "${dir}/prview.out" ;;
    *"--json labels"*)           cat "${dir}/haddone.out" ;;
    *"--json comments"*)         cat "${dir}/pausecomments.out" ;;
    *"--json state"*)            # blocker state, per-issue fixture wins
        n="\$(printf '%s' "\${args}" | grep -oE 'issue view [0-9]+' | grep -oE '[0-9]+')"
        if [ -f "${dir}/state-\${n}.out" ]; then cat "${dir}/state-\${n}.out"; else echo CLOSED; fi ;;
    *"api graphql"*)             cat "${dir}/graphql.out" ;;
    *) echo "gh-stub: unmatched: \${args}" >&2; exit 1 ;;
esac
EOF
    chmod +x "${dir}/gh-stub"

    printf '%s\n' '{"env": {"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"}}' > "${dir}/settings.json"
    echo "Token scopes: 'project', 'repo'" > "${dir}/auth.out"
    echo 0 > "${dir}/auth.code"
    echo 'agent-bot' > "${dir}/login.out"
    echo 0 > "${dir}/locked.out"
    echo '' > "${dir}/paused.out"
    echo '[]' > "${dir}/prs.out"
    echo '{"comments": []}' > "${dir}/prview.out"
    echo 'false' > "${dir}/haddone.out"
    echo 0 > "${dir}/pausecomments.out"
    graphql_fixture "${dir}"   # no candidates by default
    echo "${dir}"
}

# graphql_fixture <dir> [issueJson ...] — wrap issue nodes in the query shape.
graphql_fixture() {
    local dir="$1"; shift
    local nodes=''
    local sep=''
    local n
    for n in "$@"; do
        nodes="${nodes}${sep}${n}"
        sep=','
    done
    printf '{"data":{"repository":{"issues":{"nodes":[%s]}}}}\n' "${nodes}" > "${dir}/graphql.out"
}

# issue_node <number> <title> <priority|null> <inProject:true/false> <createdAt> [body] [labels-csv]
issue_node() {
    local number="$1" title="$2" prio="$3" in_project="$4" created="$5" body="${6:-}" labels_csv="${7:-team}"
    local labels prio_json project_items
    labels="$(printf '%s' "${labels_csv}" | jq -R 'split(",") | map({name: .})')"
    if [ "${prio}" = "null" ]; then prio_json='null'; else prio_json="{\"name\": \"${prio}\"}"; fi
    if [ "${in_project}" = "true" ]; then
        project_items="[{\"project\": {\"number\": 1}, \"fieldValueByName\": ${prio_json}}]"
    else
        project_items="[{\"project\": {\"number\": 9}, \"fieldValueByName\": ${prio_json}}]"
    fi
    jq -cn --argjson n "${number}" --arg t "${title}" --arg c "${created}" \
        --arg b "${body}" --argjson l "${labels}" --argjson pi "${project_items}" \
        '{number: $n, title: $t, body: $b, createdAt: $c,
          labels: {nodes: $l}, projectItems: {nodes: $pi}}'
}

run_triage() { # run_triage <dir> — echoes JSON, returns pickup_triage's code
    local dir="$1"
    GH_BIN="${dir}/gh-stub" PICKUP_SETTINGS_FILE="${dir}/settings.json" \
        PR_TRIAGE_UNKNOWN_RETRIES=0 pickup_triage
}

# ── Test 1: missing agent-teams flag → abort, exit 2, no gh calls needed ─────
test_abort_on_missing_flag() {
    local dir out code
    dir="$(make_env)"
    printf '%s\n' '{"env": {}}' > "${dir}/settings.json"
    out="$(run_triage "${dir}")"; code=$?
    if [ "${code}" -eq 2 ] && [ "$(printf '%s' "${out}" | jq -r '.verdict')" = "abort" ]; then
        pass "missing agent-teams flag → verdict abort, exit 2"
    else
        fail "missing agent-teams flag → verdict abort, exit 2" "code=${code} out=${out}"
    fi
}

# ── Test 2: gh unauthenticated → no-gh, exit 3, useMcpForProject true ────────
test_no_gh_on_auth_failure() {
    local dir out code
    dir="$(make_env)"
    echo 1 > "${dir}/auth.code"
    out="$(run_triage "${dir}")"; code=$?
    if [ "${code}" -eq 3 ] \
        && [ "$(printf '%s' "${out}" | jq -r '.verdict')" = "no-gh" ] \
        && [ "$(printf '%s' "${out}" | jq -r '.useMcpForProject')" = "true" ]; then
        pass "gh unauthenticated → verdict no-gh, exit 3"
    else
        fail "gh unauthenticated → verdict no-gh, exit 3" "code=${code} out=${out}"
    fi
}

# ── Test 3: lock held → in-flight with the count ─────────────────────────────
test_in_flight_lock() {
    local dir out
    dir="$(make_env)"
    echo 2 > "${dir}/locked.out"
    out="$(run_triage "${dir}")"
    if [ "$(printf '%s' "${out}" | jq -r '.verdict')" = "in-flight" ] \
        && [ "$(printf '%s' "${out}" | jq -r '.inflight')" = "2" ]; then
        pass "team:in-progress held → verdict in-flight"
    else
        fail "team:in-progress held → verdict in-flight" "out=${out}"
    fi
}

# ── Test 4: lock read error fails SAFE toward in-flight ──────────────────────
test_lock_error_fails_safe() {
    local dir out
    dir="$(make_env)"
    echo 'ERR' > "${dir}/locked.out"
    out="$(run_triage "${dir}")"
    if [ "$(printf '%s' "${out}" | jq -r '.verdict')" = "in-flight" ]; then
        pass "unreadable lock → fails safe to in-flight"
    else
        fail "unreadable lock → fails safe to in-flight" "out=${out}"
    fi
}

# ── Test 5: revise-labeled PR → reconcile with hadDone merged in ─────────────
test_reconcile_pick() {
    local dir out rec
    dir="$(make_env)"
    jq -cn '[{number: 501, headRefName: "feat/issue-441", isDraft: false,
              mergeable: "MERGEABLE", createdAt: "2026-08-01T00:00:00Z",
              labels: [{name: "team:revise"}], author: {login: "agent-bot"}}]' \
        > "${dir}/prs.out"
    echo 'true' > "${dir}/haddone.out"
    out="$(run_triage "${dir}")"
    rec="$(printf '%s' "${out}" | jq -c '.reconcile')"
    if [ "$(printf '%s' "${out}" | jq -r '.verdict')" = "reconcile" ] \
        && [ "$(printf '%s' "${rec}" | jq -r '.pr')" = "501" ] \
        && [ "$(printf '%s' "${rec}" | jq -r '.issue')" = "441" ] \
        && [ "$(printf '%s' "${rec}" | jq -r '.reason')" = "revise" ] \
        && [ "$(printf '%s' "${rec}" | jq -r '.hadDone')" = "true" ]; then
        pass "revise PR → verdict reconcile {pr,issue,reason,hadDone}"
    else
        fail "revise PR → verdict reconcile {pr,issue,reason,hadDone}" "out=${out}"
    fi
}

# ── Test 6: paused issue below cap → resume ──────────────────────────────────
test_resume_below_cap() {
    local dir out
    dir="$(make_env)"
    echo 77 > "${dir}/paused.out"
    echo 1 > "${dir}/pausecomments.out"
    out="$(run_triage "${dir}")"
    if [ "$(printf '%s' "${out}" | jq -r '.verdict')" = "resume" ] \
        && [ "$(printf '%s' "${out}" | jq -r '.paused.issue')" = "77" ] \
        && [ "$(printf '%s' "${out}" | jq -r '.paused.pauseCount')" = "1" ]; then
        pass "paused below cap → verdict resume"
    else
        fail "paused below cap → verdict resume" "out=${out}"
    fi
}

# ── Test 7: paused issue at cap → resume-cap ─────────────────────────────────
test_resume_cap() {
    local dir out
    dir="$(make_env)"
    echo 77 > "${dir}/paused.out"
    echo 3 > "${dir}/pausecomments.out"
    out="$(run_triage "${dir}")"
    if [ "$(printf '%s' "${out}" | jq -r '.verdict')" = "resume-cap" ] \
        && [ "$(printf '%s' "${out}" | jq -r '.paused.action')" = "fail" ]; then
        pass "paused at cap → verdict resume-cap"
    else
        fail "paused at cap → verdict resume-cap" "out=${out}"
    fi
}

# ── Test 8: pick honors priority rank then age, and blocker skip ─────────────
test_pick_priority_and_blockers() {
    local dir out
    dir="$(make_env)"
    # #10 is P0 but blocked by open #99; #20 is P1 → the pick. #30 P0 but not
    # in project 1 → invisible.
    graphql_fixture "${dir}" \
        "$(issue_node 10 'blocked-p0' P0 true  '2026-01-01T00:00:00Z' 'Blocked by #99')" \
        "$(issue_node 20 'clean-p1'   P1 true  '2026-02-01T00:00:00Z')" \
        "$(issue_node 30 'orphan-p0'  P0 false '2026-01-01T00:00:00Z')"
    echo OPEN > "${dir}/state-99.out"
    out="$(run_triage "${dir}")"
    if [ "$(printf '%s' "${out}" | jq -r '.verdict')" = "pick" ] \
        && [ "$(printf '%s' "${out}" | jq -r '.pick.issue')" = "20" ] \
        && [ "$(printf '%s' "${out}" | jq -r '.pick.priority')" = "P1" ]; then
        pass "open blocker skips P0; off-project skipped; P1 picked"
    else
        fail "open blocker skips P0; off-project skipped; P1 picked" "out=${out}"
    fi
}

# ── Test 9: closed blocker does not block ────────────────────────────────────
test_pick_closed_blocker() {
    local dir out
    dir="$(make_env)"
    graphql_fixture "${dir}" \
        "$(issue_node 10 'unblocked-p0' P0 true '2026-01-01T00:00:00Z' 'Blocked by #99')"
    echo CLOSED > "${dir}/state-99.out"
    out="$(run_triage "${dir}")"
    if [ "$(printf '%s' "${out}" | jq -r '.verdict')" = "pick" ] \
        && [ "$(printf '%s' "${out}" | jq -r '.pick.issue')" = "10" ]; then
        pass "closed blocker → candidate picked"
    else
        fail "closed blocker → candidate picked" "out=${out}"
    fi
}

# ── Test 10: missing project scope → pick-mcp (never guesses the pick) ───────
test_pick_mcp_on_missing_scope() {
    local dir out
    dir="$(make_env)"
    echo "Token scopes: 'repo'" > "${dir}/auth.out"
    out="$(run_triage "${dir}")"
    if [ "$(printf '%s' "${out}" | jq -r '.verdict')" = "pick-mcp" ] \
        && [ "$(printf '%s' "${out}" | jq -r '.useMcpForProject')" = "true" ]; then
        pass "missing project scope → verdict pick-mcp"
    else
        fail "missing project scope → verdict pick-mcp" "out=${out}"
    fi
}

# ── Test 11: nothing anywhere → idle, exit 0 ─────────────────────────────────
test_idle() {
    local dir out code
    dir="$(make_env)"
    out="$(run_triage "${dir}")"; code=$?
    if [ "${code}" -eq 0 ] && [ "$(printf '%s' "${out}" | jq -r '.verdict')" = "idle" ]; then
        pass "empty queue → verdict idle, exit 0"
    else
        fail "empty queue → verdict idle, exit 0" "code=${code} out=${out}"
    fi
}

echo "pickup-triage.sh tests:"
test_abort_on_missing_flag
test_no_gh_on_auth_failure
test_in_flight_lock
test_lock_error_fails_safe
test_reconcile_pick
test_resume_below_cap
test_resume_cap
test_pick_priority_and_blockers
test_pick_closed_blocker
test_pick_mcp_on_missing_scope
test_idle

echo ""
echo "${TESTS_RUN} tests, ${TESTS_FAILED} failed"
if [ "${TESTS_FAILED}" -gt 0 ]; then
    printf '  failed: %s\n' "${FAILED_NAMES[@]}"
    exit 1
fi
exit 0
