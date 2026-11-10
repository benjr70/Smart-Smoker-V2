#!/usr/bin/env bash
# Tests for scripts/paperclip/reconcile-prs.sh
#
# Run: bash scripts/paperclip/reconcile-prs.test.sh
#
# Strategy: every HTTP call (GitHub REST and Paperclip) goes through one
# CURL_BIN stub that records method, path and body to a log and answers from
# fixtures keyed by host + path. Each test asserts the recorded requests, the
# contract the Developer depends on, never the script's internals.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${SCRIPT_DIR}/reconcile-prs.sh"

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
REPO=benjr70/Smart-Smoker-V2
MASTER_SHA=5c55d87aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

# make_env — the stub + empty fixtures. Echoes the dir.
make_env() {
    local dir; dir="$(mktemp -d)"
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
host="\${url#*://}"; host="\${host%%/*}"
path="\${url#*://*/}"; path="/\${path}"
printf '%s\t%s\t%s\t%s\n' "\${method}" "\${host}" "\${path}" "\$(printf '%s' "\${body}" | tr '\n' ' ')" >> "${dir}/calls.log"
case "\${host} \${method} \${path}" in
    "gh GET /repos/${REPO}/pulls?"*) cat "${dir}/pulls.json" ;;
    "gh GET /repos/${REPO}/pulls/"*) n="\${path##*/}"; cat "${dir}/pull-\${n}.json" ;;
    "gh GET /repos/${REPO}/commits/master") printf '{"sha":"%s"}' "${MASTER_SHA}" ;;
    "pc GET /api/companies/"*"/issues?"*) cat "${dir}/list.json" ;;
    "pc GET /api/issues/"*"/comments")
        id="\${path#/api/issues/}"; id="\${id%/comments}"
        if [ -f "${dir}/comments-\${id}.json" ]; then cat "${dir}/comments-\${id}.json"; else echo '[]'; fi ;;
    "pc POST "*) echo '{"id":"c-1"}' ;;
    "pc PATCH "*) echo '{}' ;;
    *) echo '{}' ;;
esac
printf '\n200'
EOF
    chmod +x "${dir}/curl-stub"
    echo '[]' > "${dir}/list.json"
    echo '[]' > "${dir}/pulls.json"
    : > "${dir}/calls.log"
    echo "${dir}"
}

# task <id> <identifier> <issue-number> <status> <agent|""> — a mirrored task
task() {
    jq -cn --arg id "$1" --arg ident "$2" --arg n "$3" --arg status "$4" --arg agent "$5" \
        --arg p "${PROJECT}" --arg repo "${REPO}" --arg human "${HUMAN}" '
        { id: $id, identifier: $ident, projectId: $p, status: $status,
          assigneeAgentId: (if $agent == "" then null else $agent end),
          assigneeUserId: (if $agent == "" then $human else null end),
          description: ("Source: https://github.com/" + $repo + "/issues/" + $n + "\n\nbody") }'
}

# pr <number> <body> [draft] [head-repo] — an open PR list entry
pr() {
    jq -cn --argjson n "$1" --arg body "$2" --argjson draft "${3:-false}" \
        --arg head "${4:-${REPO}}" --arg repo "${REPO}" '
        { number: $n, html_url: ("https://github.com/" + $repo + "/pull/" + ($n|tostring)),
          body: $body, draft: $draft,
          head: { repo: { full_name: $head } }, base: { repo: { full_name: $repo } } }'
}

# detail <dir> <number> <mergeable_state> — the single-PR fixture
detail() { printf '{"number":%s,"mergeable_state":"%s"}' "$2" "$3" > "$1/pull-$2.json"; }

run_script() {
    local dir="$1"; shift
    CURL_BIN="${dir}/curl-stub" PAPERCLIP_TOKEN=test-token \
        PAPERCLIP_URL=http://pc GITHUB_API=https://gh \
        "${SCRIPT}" "$@" 2>"${dir}/stderr"
}

writes()  { grep -E $'^(POST|PATCH)\t' "$1/calls.log" || true; }
gh_calls() { grep -E $'^GET\tgh\t' "$1/calls.log" || true; }
body_of() { grep -F "$2"$'\t'"pc"$'\t'"$3"$'\t' "$1/calls.log" | head -1 | cut -f4; }

echo "reconcile-prs.sh"

# ---------------------------------------------------------------------------
echo "dirty PR on an in_review task"
d="$(make_env)"
task t-6 SMA-6 755 in_review "" | jq -s . > "${d}/list.json"
jq -s . > "${d}/pulls.json" <<EOF
$(pr 762 "## Summary\n\nfix things\n\nCloses #755")
EOF
detail "${d}" 762 dirty
out="$(run_script "${d}")"; rc=$?
[ "${rc}" -eq 0 ] && pass "exits 0" || fail "exits 0" "rc=${rc} $(cat "${d}/stderr")"
w="$(writes "${d}")"
[ "$(printf '%s\n' "${w}" | wc -l)" -eq 2 ] && pass "exactly two writes" || fail "exactly two writes" "${w}"
printf '%s\n' "${w}" | sed -n 1p | grep -q $'^POST\tpc\t/api/issues/t-6/comments' \
    && pass "comment is posted first" || fail "comment is posted first" "${w}"
printf '%s\n' "${w}" | sed -n 2p | grep -q $'^PATCH\tpc\t/api/issues/t-6\t' \
    && pass "then the task is patched" || fail "then the task is patched" "${w}"
cb="$(body_of "${d}" POST /api/issues/t-6/comments | jq -r .body)"
printf '%s' "${cb}" | head -1 | grep -qx 'rebase-requested: PR #762' \
    && pass "comment starts with the rebase-requested marker" || fail "comment starts with the rebase-requested marker" "${cb}"
printf '%s' "${cb}" | grep -q "master at \`${MASTER_SHA:0:7}\`" \
    && pass "comment names the master sha" || fail "comment names the master sha" "${cb}"
printf '%s' "${cb}" | grep -q 'force-with-lease' && printf '%s' "${cb}" | grep -q 'QA child task always' \
    && pass "comment carries the rebase + reverify recipe" || fail "comment carries the rebase + reverify recipe" "${cb}"
pb="$(body_of "${d}" PATCH /api/issues/t-6)"
[ "$(jq -r .status <<<"${pb}")" = in_progress ] && [ "$(jq -r .assigneeAgentId <<<"${pb}")" = "${DEV}" ] \
    && [ "$(jq -r '.assigneeUserId' <<<"${pb}")" = null ] \
    && pass "task goes in_progress, Developer assigned, human cleared" || fail "task goes in_progress, Developer assigned, human cleared" "${pb}"
printf '%s\n' "${out}" | grep -q 'rebase requested.*SMA-6.*PR #762' \
    && pass "report says rebase requested" || fail "report says rebase requested" "${out}"

# ---------------------------------------------------------------------------
echo "dirty PR while the Developer holds or reviews the task: no wake"
for status in in_progress blocked; do
    d="$(make_env)"
    task t-6 SMA-6 755 "${status}" "${DEV}" | jq -s . > "${d}/list.json"
    pr 762 "Closes #755" | jq -s . > "${d}/pulls.json"
    detail "${d}" 762 dirty
    out="$(run_script "${d}")"
    [ -z "$(writes "${d}")" ] && pass "${status}: nothing written" || fail "${status}: nothing written" "$(writes "${d}")"
    printf '%s\n' "${out}" | grep -q "conflict, wait.*SMA-6" \
        && pass "${status}: reported as conflict, wait" || fail "${status}: reported as conflict, wait" "${out}"
done

# ---------------------------------------------------------------------------
echo "dirty PR whose last rebase already FAILED: left for the human"
d="$(make_env)"
task t-6 SMA-6 755 in_review "" | jq -s . > "${d}/list.json"
pr 762 "Closes #755" | jq -s . > "${d}/pulls.json"
detail "${d}" 762 dirty
jq -n '[
  {createdAt:"2026-11-10T01:00:00Z", body:"rebase-requested: PR #762\n\n…"},
  {createdAt:"2026-11-10T02:00:00Z", body:"rebase: FAILED — apps/backend/src/temps/temps.service.ts"},
  {createdAt:"2026-11-10T02:01:00Z", body:"unrelated later comment"} ]' > "${d}/comments-t-6.json"
out="$(run_script "${d}")"
[ -z "$(writes "${d}")" ] && pass "nothing written" || fail "nothing written" "$(writes "${d}")"
printf '%s\n' "${out}" | grep -q "conflict, human.*SMA-6" \
    && pass "reported as needing a human" || fail "reported as needing a human" "${out}"

echo "a rebase that was requested, finished and handed back is requested again on a new conflict"
d="$(make_env)"
task t-6 SMA-6 755 in_review "" | jq -s . > "${d}/list.json"
pr 762 "Closes #755" | jq -s . > "${d}/pulls.json"
detail "${d}" 762 dirty
jq -n '[ {createdAt:"2026-11-10T01:00:00Z", body:"rebase-requested: PR #762\n\n…"},
         {createdAt:"2026-11-10T03:00:00Z", body:"Both verdicts in. ready to merge: yes"} ]' > "${d}/comments-t-6.json"
run_script "${d}" >/dev/null
[ "$(writes "${d}" | wc -l)" -eq 2 ] && pass "new request posted" || fail "new request posted" "$(writes "${d}")"

# ---------------------------------------------------------------------------
echo "non-conflicting states"
d="$(make_env)"
{ task t-6 SMA-6 755 in_review ""; task t-15 SMA-15 751 in_review ""; task t-16 SMA-16 752 in_review ""; } | jq -s . > "${d}/list.json"
{ pr 762 "Closes #755"; pr 770 "Fixes #751"; pr 771 "Resolves #752"; } | jq -s . > "${d}/pulls.json"
detail "${d}" 762 clean; detail "${d}" 770 behind; detail "${d}" 771 unknown
out="$(run_script "${d}")"
[ -z "$(writes "${d}")" ] && pass "nothing written" || fail "nothing written" "$(writes "${d}")"
printf '%s\n' "${out}" | grep -q "ok .*SMA-6 .*PR #762 .*clean" && pass "clean reported ok" || fail "clean reported ok" "${out}"
printf '%s\n' "${out}" | grep -q "ok .*SMA-15 .*PR #770 .*behind" && pass "behind reported ok (Developer rebases anyway)" || fail "behind reported ok" "${out}"
printf '%s\n' "${out}" | grep -q "unknown .*SMA-16 .*PR #771" && pass "unknown reported, not acted on" || fail "unknown reported" "${out}"

# ---------------------------------------------------------------------------
echo "PRs that belong to no task are ignored without a detail fetch"
d="$(make_env)"
task t-6 SMA-6 755 in_review "" | jq -s . > "${d}/list.json"
{ pr 760 "Bumps undici from 7.30.0 to 7.30.1"; pr 763 "Closes #999"; pr 765 "Closes #755" true; pr 766 "Closes #755" false someone/fork; } | jq -s . > "${d}/pulls.json"
out="$(run_script "${d}")"; rc=$?
[ "${rc}" -eq 0 ] && pass "exits 0" || fail "exits 0" "$(cat "${d}/stderr")"
[ -z "$(writes "${d}")" ] && pass "nothing written" || fail "nothing written" "$(writes "${d}")"
[ -z "$(gh_calls "${d}" | grep '/pulls/[0-9]')" ] && pass "no per-PR detail fetched" || fail "no per-PR detail fetched" "$(gh_calls "${d}")"
printf '%s\n' "${out}" | grep -q "no open PR is linked" && pass "report says none linked" || fail "report says none linked" "${out}"

echo "a done task is skipped without a detail fetch"
d="$(make_env)"
task t-14 SMA-14 750 done "" | jq -s . > "${d}/list.json"
pr 764 "Closes #750" | jq -s . > "${d}/pulls.json"
out="$(run_script "${d}")"
[ -z "$(gh_calls "${d}" | grep '/pulls/764')" ] && pass "no detail fetch for a done task" || fail "no detail fetch for a done task" "$(gh_calls "${d}")"
printf '%s\n' "${out}" | grep -q "skip .*SMA-14 .*task done" && pass "reported as skipped" || fail "reported as skipped" "${out}"

# ---------------------------------------------------------------------------
echo "dry run"
d="$(make_env)"
task t-6 SMA-6 755 in_review "" | jq -s . > "${d}/list.json"
pr 762 "Closes #755" | jq -s . > "${d}/pulls.json"
detail "${d}" 762 dirty
out="$(run_script "${d}" --dry-run)"
[ -z "$(writes "${d}")" ] && pass "nothing written" || fail "nothing written" "$(writes "${d}")"
printf '%s\n' "${out}" | grep -q 'would POST /api/issues/t-6/comments' && printf '%s\n' "${out}" | grep -q 'would PATCH /api/issues/t-6 ' \
    && pass "prints both intended writes" || fail "prints both intended writes" "${out}"
printf '%s\n' "${out}" | grep -q 'dry run' && pass "report is labelled dry run" || fail "report is labelled dry run" "${out}"

# ---------------------------------------------------------------------------
echo "argument and failure handling"
d="$(make_env)"
run_script "${d}" --bogus >/dev/null 2>&1; [ $? -eq 1 ] && pass "unknown argument exits 1" || fail "unknown argument exits 1"
CURL_BIN="${d}/curl-stub" "${SCRIPT}" >/dev/null 2>&1; [ $? -eq 1 ] && pass "missing token exits 1" || fail "missing token exits 1"
d="$(make_env)"
task t-6 SMA-6 755 in_review "" | jq -s . > "${d}/list.json"
cat > "${d}/curl-stub" <<'EOF'
#!/usr/bin/env bash
url="${@: -1}"
case "${url}" in
    *gh/*) echo '{"message":"API rate limit exceeded"}'; printf '\n403' ;;
    *) echo '[]'; printf '\n200' ;;
esac
EOF
chmod +x "${d}/curl-stub"
run_script "${d}" >/dev/null; rc=$?
[ "${rc}" -eq 2 ] && pass "GitHub failure exits 2" || fail "GitHub failure exits 2" "rc=${rc}"
grep -q "rate limit" "${d}/stderr" && pass "GitHub error text is surfaced" || fail "GitHub error text is surfaced" "$(cat "${d}/stderr")"

# ---------------------------------------------------------------------------
echo
echo "${TESTS_RUN} tests, ${TESTS_FAILED} failed"
if [ "${TESTS_FAILED}" -gt 0 ]; then
    printf '  - %s\n' "${FAILED_NAMES[@]}"
    exit 1
fi
