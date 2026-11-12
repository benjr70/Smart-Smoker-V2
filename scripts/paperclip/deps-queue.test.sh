#!/usr/bin/env bash
# Tests for scripts/paperclip/deps-queue.sh
#
# Run: bash scripts/paperclip/deps-queue.test.sh
#
# Strategy: every HTTP call (GitHub REST and Paperclip) goes through one
# CURL_BIN stub that records method, host, path and body to a log and answers
# from fixtures. Each test asserts the recorded writes and the report, the
# contract the board depends on, never the script's internals.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${SCRIPT_DIR}/deps-queue.sh"

TESTS_RUN=0
TESTS_FAILED=0
FAILED_NAMES=()

pass() { TESTS_RUN=$((TESTS_RUN + 1)); echo "  PASS: $1"; }
fail() {
    TESTS_RUN=$((TESTS_RUN + 1)); TESTS_FAILED=$((TESTS_FAILED + 1)); FAILED_NAMES+=("$1")
    echo "  FAIL: $1"; [ -n "${2:-}" ] && echo "    $2"
}
check() { if eval "$2"; then pass "$1"; else fail "$1" "${3:-}"; fi; }

DEV=feddb854-9923-4150-9446-04627cea4c60
PROJECT=1e110bfa-99e3-486d-a471-651ae20a0bdf
REPO=benjr70/Smart-Smoker-V2
MASTER=9e1abf4aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

# make_env — stub + fixtures for a quiet board: no tasks, no PRs, green deploy.
make_env() {
    local dir; dir="$(mktemp -d)"
    cat > "${dir}/curl-stub" <<STUB
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
host="\${url#*://}"; host="\${host%%/*}"
path="\${url#*://*/}"; path="/\${path}"
printf '%s\t%s\t%s\t%s\n' "\${method}" "\${host}" "\${path}" "\$(printf '%s' "\${body}" | tr '\n' ' ')" >> "${dir}/calls.log"
code=200
case "\${host} \${method} \${path}" in
    "gh GET /repos/${REPO}/pulls?"*) cat "${dir}/pulls.json" ;;
    "gh GET /repos/${REPO}/pulls/"*) cat "${dir}/pull-\${path##*/}.json" ;;
    "gh GET /repos/${REPO}/commits/master")
        if [ -f "${dir}/gh-down" ]; then printf '{"message":"rate limited"}'; code=403; else printf '{"sha":"%s"}' "${MASTER}"; fi ;;
    "gh GET /repos/${REPO}/actions/workflows/nightly.yml/"*) cat "${dir}/build.json" ;;
    "gh GET /repos/${REPO}/actions/workflows/dev-deploy.yml/"*) cat "${dir}/deploy.json" ;;
    "pc GET /api/companies/"*"/issues?"*) cat "${dir}/list.json" ;;
    "pc POST /api/companies/"*"/issues") echo '{"id":"new-1","identifier":"SMA-99"}' ;;
    *) echo '{}' ;;
esac
printf '\n%s' "\${code}"
STUB
    chmod +x "${dir}/curl-stub"
    echo '[]' > "${dir}/list.json"; echo '[]' > "${dir}/pulls.json"
    runs "${dir}" build completed success; runs "${dir}" deploy completed success
    echo "${dir}"
}

# runs <dir> build|deploy <status> <conclusion|null> [sha]
runs() {
    jq -n --arg st "$3" --arg c "$4" --arg sha "${5:-${MASTER}}" '
        {workflow_runs: [{head_sha: $sha, status: $st, created_at: "2026-11-12T00:00:00Z",
                          conclusion: (if $c == "null" then null else $c end)}]}' > "$1/$2.json"
}
no_runs() { echo '{"workflow_runs":[]}' > "$1/$2.json"; }

# task <dir> <pr-number> <identifier> <status> — add a deps task to the board.
task() {
    jq --arg n "$2" --arg ident "$3" --arg st "$4" --arg p "${PROJECT}" --arg repo "${REPO}" '
        . + [{id: ("t-" + $n), identifier: $ident, status: $st, projectId: $p, createdAt: ("2026-11-1" + ($n | .[-1:])),
              description: ("Source: https://github.com/" + $repo + "/pull/" + $n + "\n\nbody")}]' \
        "$1/list.json" > "$1/list.tmp" && mv "$1/list.tmp" "$1/list.json"
}

# pr <dir> <number> <mergeable_state> [author] [ref] [draft] [label] [state] [merged]
pr() {
    local dir="$1" n="$2" obj
    obj="$(jq -n --argjson n "$n" --arg ms "$3" --arg author "${4:-dependabot[bot]}" --arg ref "${5:-dependabot/npm_and_yarn/pkg-$n}" \
        --argjson draft "${6:-false}" --arg label "${7:-}" --arg state "${8:-open}" --argjson merged "${9:-false}" --arg repo "${REPO}" '
        {number: $n, html_url: ("https://github.com/" + $repo + "/pull/" + ($n | tostring)), title: ("chore(deps): bump pkg-" + ($n | tostring)),
         user: {login: $author}, head: {ref: $ref, sha: "abcdef0123456789"}, draft: $draft, state: $state, merged: $merged,
         mergeable_state: $ms, labels: (if $label == "" then [] else [{name: $label}] end)}')"
    echo "${obj}" > "${dir}/pull-${n}.json"
    if [ "${8:-open}" = open ]; then
        jq --argjson o "${obj}" '. + [$o]' "${dir}/pulls.json" > "${dir}/pulls.tmp" && mv "${dir}/pulls.tmp" "${dir}/pulls.json"
    fi
}

run_script() {
    local dir="$1"; shift
    : > "${dir}/calls.log"
    PAPERCLIP_TOKEN=test PAPERCLIP_URL=http://pc GITHUB_API=http://gh CURL_BIN="${dir}/curl-stub" \
        bash "${SCRIPT}" "$@" > "${dir}/out.txt" 2> "${dir}/err.txt"
    echo $? > "${dir}/rc"
}
writes() { grep -c -v $'^GET\t' "$1/calls.log" || true; }
created() { grep -F $'POST\tpc\t/api/companies/' "$1/calls.log" | cut -f4; }
out() { cat "$1/out.txt"; }

echo "picks the oldest ready Dependabot PR"
d="$(make_env)"; pr "$d" 770 clean; pr "$d" 756 clean; pr "$d" 761 behind
run_script "$d"
check "exit 0" '[ "$(cat "$d/rc")" = 0 ]' "$(cat "$d/err.txt")"
check "exactly one write" '[ "$(writes "$d")" = 1 ]' "$(cat "$d/calls.log")"
check "task is for PR #756" 'created "$d" | jq -e ".title | startswith(\"Deps: PR #756 — \")" >/dev/null'
check "first line is the Source key" 'created "$d" | jq -e ".description | startswith(\"Source: https://github.com/'"${REPO}"'/pull/756\n\")" >/dev/null'
check "assigned to the Developer, todo, low" 'created "$d" | jq -e ".assigneeAgentId == \"'"${DEV}"'\" and .status == \"todo\" and .priority == \"low\" and .projectId == \"'"${PROJECT}"'\"" >/dev/null'
check "names the branch" 'created "$d" | jq -e ".description | contains(\"dependabot/npm_and_yarn/pkg-756\")" >/dev/null'
check "report says queued" 'out "$d" | grep -q "queued .*SMA-99 .*PR #756"'

echo "ignores what is not a ready Dependabot PR"
d="$(make_env)"
pr "$d" 700 clean benjr70 feat/x
pr "$d" 701 clean "dependabot[bot]" feature/not-dependabot
pr "$d" 702 clean "dependabot[bot]" dependabot/npm_and_yarn/a true
pr "$d" 703 clean "dependabot[bot]" dependabot/npm_and_yarn/b false AFK:deps-failed
pr "$d" 704 dirty; pr "$d" 705 unknown
run_script "$d"
check "no write" '[ "$(writes "$d")" = 0 ]' "$(cat "$d/calls.log")"
check "dirty PR waits for Dependabot" 'out "$d" | grep -q "skip .*PR #704 .*conflicts with master"'
check "unknown PR is skipped" 'out "$d" | grep -q "skip .*PR #705"'
check "reports idle" 'out "$d" | grep -q "idle "'
check "human PR never fetched" '! grep -q "/pulls/700" "$d/calls.log"'

echo "skips a PR that already has a task, re-picks after a cancelled one"
d="$(make_env)"; pr "$d" 756 clean; pr "$d" 757 clean; pr "$d" 760 clean
task "$d" 756 SMA-40 in_review; task "$d" 757 SMA-41 cancelled
run_script "$d"
check "parked task does not hold the lane; cancelled one is re-picked" 'created "$d" | jq -e ".title | startswith(\"Deps: PR #757 \")" >/dev/null' "$(out "$d")"

echo "one at a time"
for st in todo in_progress blocked; do
    d="$(make_env)"; pr "$d" 756 clean; pr "$d" 760 clean; task "$d" 756 SMA-40 "$st"
    run_script "$d"
    check "$st task holds the lane" '[ "$(writes "$d")" = 0 ] && out "$d" | grep -q "busy .*SMA-40"' "$(out "$d")"
done

echo "sync closes tasks whose PR is no longer open"
d="$(make_env)"; task "$d" 756 SMA-40 in_progress; task "$d" 757 SMA-41 in_review; task "$d" 758 SMA-42 done
pr "$d" 756 clean "dependabot[bot]" dependabot/x false "" closed true
pr "$d" 757 clean "dependabot[bot]" dependabot/y false "" closed false
run_script "$d"
check "merged PR → done" 'grep -F $'"'"'PATCH\tpc\t/api/issues/t-756\t'"'"' "$d/calls.log" | cut -f4 | jq -e ".status == \"done\"" >/dev/null' "$(cat "$d/calls.log")"
check "closed PR → cancelled" 'grep -F $'"'"'PATCH\tpc\t/api/issues/t-757\t'"'"' "$d/calls.log" | cut -f4 | jq -e ".status == \"cancelled\"" >/dev/null'
check "each close is commented" '[ "$(grep -c $'"'"'^POST\tpc\t/api/issues/t-75[67]/comments'"'"' "$d/calls.log")" = 2 ]'
check "done task is not re-read" '! grep -q "/pulls/758" "$d/calls.log"'
check "a task closed this tick frees the lane" 'out "$d" | grep -q "idle "' "$(out "$d")"

echo "deploy gate"
d="$(make_env)"; pr "$d" 756 clean; runs "$d" deploy in_progress null
run_script "$d"
check "deploy running → wait, no write" '[ "$(writes "$d")" = 0 ] && out "$d" | grep -q "wait .*Dev Deploy for master 9e1abf4 is in_progress"' "$(out "$d")"
d="$(make_env)"; pr "$d" 756 clean; runs "$d" deploy completed failure
run_script "$d"
check "deploy red → hold, no write" '[ "$(writes "$d")" = 0 ] && out "$d" | grep -q "hold .*ended failure"' "$(out "$d")"
d="$(make_env)"; pr "$d" 756 clean; runs "$d" deploy completed success 0000000old; runs "$d" build in_progress null
run_script "$d"
check "deploy is for an older commit, build running → wait" '[ "$(writes "$d")" = 0 ] && out "$d" | grep -q "wait .*image build for master 9e1abf4 is in_progress"' "$(out "$d")"
d="$(make_env)"; pr "$d" 756 clean; no_runs "$d" deploy; runs "$d" build completed success
run_script "$d"
check "build done, deploy not started → wait" '[ "$(writes "$d")" = 0 ] && out "$d" | grep -q "wait .*has not started yet"' "$(out "$d")"
d="$(make_env)"; pr "$d" 756 clean; no_runs "$d" deploy; runs "$d" build completed failure
run_script "$d"
check "build red → hold" '[ "$(writes "$d")" = 0 ] && out "$d" | grep -q "hold .*image build .*ended failure"' "$(out "$d")"

echo "dry run and errors"
d="$(make_env)"; pr "$d" 756 clean
run_script "$d" --dry-run
check "dry run writes nothing, prints the POST" '[ "$(writes "$d")" = 0 ] && out "$d" | grep -q "would POST /api/companies/" && out "$d" | grep -q "dry run"' "$(out "$d")"
run_script "$d" --bogus
check "unknown argument → exit 1" '[ "$(cat "$d/rc")" = 1 ]'
d="$(make_env)"; pr "$d" 756 clean; touch "$d/gh-down"
run_script "$d"
check "GitHub failure → exit 2 with its text" '[ "$(cat "$d/rc")" = 2 ] && grep -q "rate limited" "$d/err.txt"' "$(cat "$d/err.txt")"

echo
echo "${TESTS_RUN} tests, ${TESTS_FAILED} failed"
if [ "${TESTS_FAILED}" -gt 0 ]; then printf '  - %s\n' "${FAILED_NAMES[@]}"; exit 1; fi
