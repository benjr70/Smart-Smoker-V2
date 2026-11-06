#!/usr/bin/env bash
# Tests for scripts/paperclip/mirror-slices.sh
#
# Run: bash scripts/paperclip/mirror-slices.test.sh
#
# Strategy: GitHub reads go through a GH_BIN stub serving a canned GraphQL
# tree; Paperclip calls go through a CURL_BIN stub that records every request
# (method, path, body) to a log and answers from fixtures. Each test asserts the
# recorded requests — the contract the Developer pipeline depends on — never
# the script's internals.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${SCRIPT_DIR}/mirror-slices.sh"

TESTS_RUN=0
TESTS_FAILED=0
FAILED_NAMES=()

pass() { TESTS_RUN=$((TESTS_RUN + 1)); echo "  PASS: $1"; }
fail() {
    TESTS_RUN=$((TESTS_RUN + 1)); TESTS_FAILED=$((TESTS_FAILED + 1)); FAILED_NAMES+=("$1")
    echo "  FAIL: $1"; [ -n "${2:-}" ] && echo "    $2"
}

DEV=feddb854-9923-4150-9446-04627cea4c60
HUMAN=tj67AGmlwzUsScEAFewX9guPTOvfR2mm
PROJECT=1e110bfa-99e3-486d-a471-651ae20a0bdf
REPO_URL=https://github.com/benjr70/Smart-Smoker-V2/issues

# make_env — stubs + empty fixtures. Echoes the dir.
make_env() {
    local dir; dir="$(mktemp -d)"
    cat > "${dir}/gh-stub" <<EOF
#!/usr/bin/env bash
# the query embeds "issue(number: N)"; serve tree-N.json
n="\$(printf '%s' "\$*" | grep -o 'issue(number: [0-9]*)' | grep -o '[0-9]*')"
cat "${dir}/tree-\${n}.json"
EOF
    cat > "${dir}/curl-stub" <<EOF
#!/usr/bin/env bash
method=GET; body=''; url=''
while [ \$# -gt 0 ]; do
    case "\$1" in
        -X) method="\$2"; shift 2 ;;
        -d) body="\$2"; shift 2 ;;
        -H|-w) shift 2 ;;
        -sS|-s) shift ;;
        *) url="\$1"; shift ;;
    esac
done
path="\${url#*://*/}"; path="/\${path}"
printf '%s\t%s\t%s\n' "\${method}" "\${path}" "\$(printf '%s' "\${body}" | tr '\n' ' ')" >> "${dir}/calls.log"
case "\${method} \${path}" in
    "GET /api/companies/"*"/issues?"*) cat "${dir}/list.json" ;;
    "GET /api/issues/"*)
        id="\${path##*/}"
        if [ -f "${dir}/issue-\${id}.json" ]; then cat "${dir}/issue-\${id}.json"; else echo '{"blockedBy":[]}'; fi ;;
    "POST "*)
        c=\$(cat "${dir}/counter"); c=\$((c+1)); echo \$c > "${dir}/counter"
        printf '{"id":"id-%s","identifier":"SMA-%s"}' "\$c" "\$c" ;;
    *) echo '{}' ;;
esac
printf '\n200'
EOF
    chmod +x "${dir}/gh-stub" "${dir}/curl-stub"
    echo '[]' > "${dir}/list.json"
    echo 0 > "${dir}/counter"
    : > "${dir}/calls.log"
    echo "${dir}"
}

# node <number> <title> <labels-json> <state> <stateReason|null> <blockedBy-json> <priority|null>
node() {
    jq -cn --argjson n "$1" --arg t "$2" --argjson labels "$3" --arg state "$4" \
        --argjson reason "$5" --argjson blocked "$6" --argjson prio "$7" --arg base "${REPO_URL}" '
        { number: $n, databaseId: (6000000000 + $n), url: ($base + "/" + ($n|tostring)),
          title: $t, body: ("## What to build\n\nbody of #" + ($n|tostring)),
          state: $state, stateReason: $reason,
          labels: { nodes: ($labels | map({name: .})) },
          blockedBy: { nodes: $blocked },
          projectItems: { nodes: (if $prio == null then []
              else [{ project: { number: 1 }, fieldValueByName: { name: $prio } }] end) } }'
}

# tree <dir> <root-node> [sub-node ...] — write the GraphQL fixture for the root.
tree() {
    local dir="$1" root="$2"; shift 2
    local subs; subs="$(printf '%s\n' "$@" | jq -cs .)"
    jq -cn --argjson root "${root}" --argjson subs "${subs}" \
        '{ data: { repository: { issue: ($root + { subIssues: { nodes: $subs } }) } } }' \
        > "${dir}/tree-$(jq -r .number <<<"${root}").json"
}

# existing <id> <number> <status> <parentId|""> — a task row for list.json.
existing() {
    jq -cn --arg id "$1" --arg n "$2" --arg s "$3" --arg p "$4" --arg project "${PROJECT}" --arg base "${REPO_URL}" '
        { id: $id, identifier: ("SMA-" + $id), status: $s, projectId: $project,
          parentId: (if $p == "" then null else $p end),
          description: ("Source: " + $base + "/" + $n + "\n\nold body") }'
}

# child <id> <parentId> — a Developer-made child task (no Source line) for list.json.
child() {
    jq -cn --arg id "$1" --arg p "$2" --arg project "${PROJECT}" \
        '{ id: $id, identifier: ("SMA-" + $id), status: "done", projectId: $project, parentId: $p, description: "Code review: …" }'
}

run_script() {
    local dir="$1"; shift
    GH_BIN="${dir}/gh-stub" CURL_BIN="${dir}/curl-stub" PAPERCLIP_TOKEN=test-token \
        bash "${SCRIPT}" "$@" 2> "${dir}/stderr.log"
}

# calls <dir> <method-filter> — tab-separated "method path body" rows.
calls() { grep "^$2" "$1/calls.log" || true; }
# body_of <dir> <method> <nth> → json body
body_of() { calls "$1" "$2" | sed -n "$3p" | cut -f3; }

spec_fixture() {
    # Spec 749 → C(752 HITL closed) ← A(750 AFK, P0) ← B(751 AFK)
    local dir="$1"
    tree "${dir}" \
        "$(node 749 'Active Cook' '["spec"]' OPEN null '[]' null)" \
        "$(node 750 'Slice A' '["AFK"]' OPEN null '[{"number":752,"state":"CLOSED"}]' '"P0"')" \
        "$(node 751 'Slice B' '["AFK"]' OPEN null '[{"number":750,"state":"OPEN"}]' null)" \
        "$(node 752 'Slice C' '["HITL"]' CLOSED '"COMPLETED"' '[]' null)"
}

echo "mirror-slices.sh"

# ---------------------------------------------------------------- first run --
echo "first run of a Spec"
dir="$(make_env)"; spec_fixture "${dir}"
out="$(run_script "${dir}" 749)"

posts="$(calls "${dir}" POST | cut -f3)"
if [ "$(wc -l <<<"${posts}")" = 4 ] && [ -z "$(calls "${dir}" PATCH)" ]; then
    pass "creates the Spec parent and three Slices, patches nothing"
else fail "creates the Spec parent and three Slices, patches nothing" "$(cat "${dir}/calls.log")"; fi

order="$(jq -r '.title' <<<"${posts}" | tr '\n' '|')"
if [ "${order}" = "Spec #749: Active Cook|#752 Slice C|#750 Slice A|#751 Slice B|" ]; then
    pass "orders Slices blockers-first (C, A, B)"
else fail "orders Slices blockers-first (C, A, B)" "${order}"; fi

spec="$(body_of "${dir}" POST 1)"
if [ "$(jq -r '.status' <<<"${spec}")" = backlog ] && [ "$(jq -r '.assigneeAgentId // .assigneeUserId // "none"' <<<"${spec}")" = none ] \
   && [ "$(jq -r '.parentId // "none"' <<<"${spec}")" = none ]; then
    pass "Spec parent is unassigned backlog with no parent"
else fail "Spec parent is unassigned backlog with no parent" "${spec}"; fi

c="$(body_of "${dir}" POST 2)"
if [ "$(jq -r '.status' <<<"${c}")" = done ] && [ "$(jq -r '.assigneeUserId' <<<"${c}")" = "${HUMAN}" ] \
   && [ "$(jq -r '.assigneeAgentId // "none"' <<<"${c}")" = none ] && [ "$(jq -r '.parentId' <<<"${c}")" = id-1 ]; then
    pass "closed HITL Slice: done, assigned to the human, child of the Spec task"
else fail "closed HITL Slice: done, assigned to the human, child of the Spec task" "${c}"; fi

a="$(body_of "${dir}" POST 3)"
if [ "$(jq -r '.status' <<<"${a}")" = todo ] && [ "$(jq -r '.assigneeAgentId' <<<"${a}")" = "${DEV}" ] \
   && [ "$(jq -r '.priority' <<<"${a}")" = critical ] && [ "$(jq -c '.blockedByIssueIds' <<<"${a}")" = '["id-2"]' ]; then
    pass "AFK Slice with only closed blockers: todo, Developer, P0→critical, blocker mirrored"
else fail "AFK Slice with only closed blockers: todo, Developer, P0→critical, blocker mirrored" "${a}"; fi

b="$(body_of "${dir}" POST 4)"
if [ "$(jq -r '.status' <<<"${b}")" = blocked ] && [ "$(jq -r '.priority' <<<"${b}")" = medium ] \
   && [ "$(jq -c '.blockedByIssueIds' <<<"${b}")" = '["id-3"]' ] && [ "$(jq -r '.idempotencyKey' <<<"${b}")" = gh-6000000751 ]; then
    pass "AFK Slice with an open blocker: blocked on A's task, missing Priority→medium, idempotency key"
else fail "AFK Slice with an open blocker: blocked on A's task, missing Priority→medium, idempotency key" "${b}"; fi

if [ "$(jq -r '.description' <<<"${b}" | head -1)" = "Source: ${REPO_URL}/751" ] \
   && jq -e '.description | contains("body of #751")' >/dev/null <<<"${b}" && [ "$(jq -r '.allowDuplicate' <<<"${b}")" = true ]; then
    pass "description starts with the Source line and carries the GitHub body"
else fail "description starts with the Source line and carries the GitHub body" "${b}"; fi

if grep -q 'frontier (todo, takeable now): #750' <<<"${out}"; then
    pass "report names the frontier"
else fail "report names the frontier" "${out}"; fi
rm -rf "${dir}"

# ------------------------------------------------------------------ re-run --
echo "re-run against existing tasks"
dir="$(make_env)"
# B's issue is now closed (merged); A is mid-pipeline with review/QA children as blockers.
tree "${dir}" \
    "$(node 749 'Active Cook' '["spec"]' OPEN null '[]' null)" \
    "$(node 750 'Slice A renamed' '["AFK"]' OPEN null '[{"number":752,"state":"CLOSED"}]' '"P1"')" \
    "$(node 751 'Slice B' '["AFK"]' CLOSED '"COMPLETED"' '[{"number":750,"state":"OPEN"}]' null)" \
    "$(node 752 'Slice C' '["HITL"]' CLOSED '"COMPLETED"' '[]' null)"
{ existing t-spec 749 backlog ""; existing t-a 750 blocked t-spec; existing t-b 751 blocked t-spec; existing t-c 752 done t-spec; \
  existing t-other 1 todo ""; child t-review t-a; child t-qa t-a; } | jq -s . > "${dir}/list.json"
# the blocker entries Paperclip returns carry no parentId; parentage comes from the list above
jq -n '{ blockedBy: [ {id: "t-review"}, {id: "t-qa"}, {id: "t-stale"} ] }' > "${dir}/issue-t-a.json"
run_script "${dir}" 749 >/dev/null

if [ -z "$(calls "${dir}" POST)" ] && [ "$(calls "${dir}" PATCH | wc -l)" = 4 ] && [ -z "$(grep -P '^PATCH\t/api/issues/t-(review|qa|other)\t' "${dir}/calls.log")" ]; then
    pass "re-run creates nothing and patches the four mirrored tasks"
else fail "re-run creates nothing and patches the four mirrored tasks" "$(cat "${dir}/calls.log")"; fi

pa="$(grep -P '^PATCH\t/api/issues/t-a\t' "${dir}/calls.log" | cut -f3)"
if [ "$(jq -c '.blockedByIssueIds' <<<"${pa}")" = '["t-c","t-qa","t-review"]' ] && [ "$(jq -r '.status // "untouched"' <<<"${pa}")" = untouched ] \
   && [ "$(jq -r '.title // "untouched"' <<<"${pa}")" = untouched ] && [ "$(jq -r '.description // "untouched"' <<<"${pa}")" = untouched ] \
   && [ "$(jq -r '.assigneeAgentId // .assigneeUserId // "untouched"' <<<"${pa}")" = untouched ]; then
    pass "started task (has children): own child blockers kept, stale blocker dropped, content, status and assignee untouched"
else fail "started task (has children): own child blockers kept, stale blocker dropped, content, status and assignee untouched" "${pa}"; fi

pb="$(grep -P '^PATCH\t/api/issues/t-b\t' "${dir}/calls.log" | cut -f3)"
if [ "$(jq -r '.status' <<<"${pb}")" = done ] && [ "$(jq -r '.title' <<<"${pb}")" = '#751 Slice B' ] \
   && [ "$(jq -c '.blockedByIssueIds' <<<"${pb}")" = '["t-a"]' ]; then
    pass "GitHub-closed planning-stage Slice: task done, content refreshed, blockers mirrored"
else fail "GitHub-closed planning-stage Slice: task done, content refreshed, blockers mirrored" "${pb}"; fi

pc="$(grep -P '^PATCH\t/api/issues/t-c\t' "${dir}/calls.log" | cut -f3)"
ps="$(grep -P '^PATCH\t/api/issues/t-spec\t' "${dir}/calls.log" | cut -f3)"
if [ "$(jq -r '.status // "untouched"' <<<"${pc}")" = untouched ] && [ "$(jq -r '.blockedByIssueIds // "none"' <<<"${ps}")" = none ]; then
    pass "already-done task is not re-closed; Spec parent gets no blockers"
else fail "already-done task is not re-closed; Spec parent gets no blockers" "${pc} ${ps}"; fi
rm -rf "${dir}"

# ----------------------------------------------------------------- dry run --
echo "dry run"
dir="$(make_env)"; spec_fixture "${dir}"
out="$(run_script "${dir}" --dry-run 749)"
if [ -z "$(calls "${dir}" POST)" ] && [ -z "$(calls "${dir}" PATCH)" ] && grep -q 'would POST /api/companies/' <<<"${out}" \
   && grep -q 'dry run' <<<"${out}"; then
    pass "--dry-run writes nothing and prints the planned requests"
else fail "--dry-run writes nothing and prints the planned requests" "$(cat "${dir}/calls.log")"; fi
rm -rf "${dir}"

# ------------------------------------------------------------- standalone --
echo "standalone issue"
dir="$(make_env)"
tree "${dir}" "$(node 755 'First reading bug' '["AFK","bug"]' OPEN null '[]' '"P2"')"
tree "${dir}" "$(node 760 'Untriaged' '["bug"]' OPEN null '[]' null)"
run_script "${dir}" "https://github.com/benjr70/Smart-Smoker-V2/issues/755" 760 >/dev/null

p="$(body_of "${dir}" POST 1)"
if [ "$(calls "${dir}" POST | wc -l)" = 1 ] && [ "$(jq -r '.parentId // "none"' <<<"${p}")" = none ] \
   && [ "$(jq -r '.status' <<<"${p}")" = todo ] && [ "$(jq -r '.title' <<<"${p}")" = '#755 First reading bug' ]; then
    pass "a standalone AFK issue (URL form) becomes one parentless todo task"
else fail "a standalone AFK issue (URL form) becomes one parentless todo task" "$(cat "${dir}/calls.log")"; fi
if grep -q '#760 is neither AFK nor HITL' "${dir}/stderr.log"; then
    pass "an issue with neither label is skipped with a warning"
else fail "an issue with neither label is skipped with a warning" "$(cat "${dir}/stderr.log")"; fi
rm -rf "${dir}"

# -------------------------------------------------------------- arg errors --
echo "argument handling"
dir="$(make_env)"
if ! run_script "${dir}" abc 2>/dev/null; then pass "rejects a non-numeric argument"; else fail "rejects a non-numeric argument"; fi
if ! GH_BIN="${dir}/gh-stub" CURL_BIN="${dir}/curl-stub" bash "${SCRIPT}" 749 2>/dev/null; then
    pass "refuses to run without PAPERCLIP_TOKEN"
else fail "refuses to run without PAPERCLIP_TOKEN"; fi
rm -rf "${dir}"

echo
echo "${TESTS_RUN} tests, ${TESTS_FAILED} failed"
if [ "${TESTS_FAILED}" -gt 0 ]; then printf '  - %s\n' "${FAILED_NAMES[@]}"; exit 1; fi
