#!/usr/bin/env bash
# Tests for scripts/claude-agent/lib/token-usage.sh
#
# Run: bash scripts/claude-agent/lib/token-usage.test.sh
#
# Strategy: build a throwaway transcripts dir (main-session jsonl + a
# subagents/ subdir, usage-bearing and noise lines, multiple branches) and
# assert the aggregated scan JSON, the markdown body, and the create-vs-update
# post flow through a GH_BIN stub.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=token-usage.sh
. "${SCRIPT_DIR}/token-usage.sh"

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

# usage_line <branch> <out> <cacheRead> <cacheWrite>
usage_line() {
    jq -cn --arg b "$1" --argjson o "$2" --argjson cr "$3" --argjson cw "$4" \
        '{gitBranch: $b, message: {usage: {output_tokens: $o,
          cache_read_input_tokens: $cr, cache_creation_input_tokens: $cw,
          input_tokens: 5}}}'
}

make_transcripts() {
    local dir; dir="$(mktemp -d)"
    mkdir -p "${dir}/aaa/subagents"
    {   # main session: 2 usage turns on issue 42, 1 on master, plus noise
        usage_line "feat/issue-42" 100 1000 10
        usage_line "feat/issue-42" 200 2000 20
        usage_line "master"        50  500  5
        echo '{"type":"mode","gitBranch":null}'
        echo 'not json at all'
    } > "${dir}/aaa.jsonl"
    {   # subagent of same session: issue 42 + a different issue
        usage_line "feat/issue-42" 300 3000 30
        usage_line "feat/issue-7"  40  400  4
    } > "${dir}/aaa/subagents/agent-1.jsonl"
    echo "${dir}"
}

# ── Test 1: scan aggregates per issue across main + subagent files ───────────
test_scan_aggregation() {
    local dir out row
    dir="$(make_transcripts)"
    out="$(TOKEN_USAGE_DIR="${dir}" tu_scan)"
    row="$(printf '%s' "${out}" | jq -c '.issues["42"]')"
    if [ "$(printf '%s' "${row}" | jq -r '.outputTokens')" = "600" ] \
        && [ "$(printf '%s' "${row}" | jq -r '.cacheReadTokens')" = "6000" ] \
        && [ "$(printf '%s' "${row}" | jq -r '.turns')" = "3" ] \
        && [ "$(printf '%s' "${row}" | jq -r '.sessions')" = "2" ] \
        && [ "$(printf '%s' "${out}" | jq -r '.issues["7"].outputTokens')" = "40" ]; then
        pass "scan sums per issue across main + subagent files"
    else
        fail "scan sums per issue across main + subagent files" "out=${out}"
    fi
}

# ── Test 2: non-issue branches land in overhead, never in issues ─────────────
test_scan_overhead() {
    local dir out
    dir="$(make_transcripts)"
    out="$(TOKEN_USAGE_DIR="${dir}" tu_scan)"
    if [ "$(printf '%s' "${out}" | jq -r '.overhead.outputTokens')" = "50" ] \
        && [ "$(printf '%s' "${out}" | jq -r '.issues | has("master")')" = "false" ]; then
        pass "master lines → overhead bucket"
    else
        fail "master lines → overhead bucket" "out=${out}"
    fi
}

# ── Test 3: --issue filters the issues map ───────────────────────────────────
test_scan_issue_filter() {
    local dir out
    dir="$(make_transcripts)"
    out="$(TOKEN_USAGE_DIR="${dir}" tu_scan 7)"
    if [ "$(printf '%s' "${out}" | jq -r '.issues | keys | join(",")')" = "7" ]; then
        pass "scan --issue 7 filters to that issue only"
    else
        fail "scan --issue 7 filters to that issue only" "out=${out}"
    fi
}

# ── Test 4: markdown body carries marker + humanized numbers ─────────────────
test_markdown_body() {
    local dir body
    dir="$(make_transcripts)"
    body="$(TOKEN_USAGE_DIR="${dir}" tu_markdown 42)"
    if printf '%s' "${body}" | grep -q '<!-- token-usage -->' \
        && printf '%s' "${body}" | grep -q '| output       | 600 |' \
        && printf '%s' "${body}" | grep -q '| cache reads  | 6.0k |' \
        && printf '%s' "${body}" | grep -q 'feat/issue-42'; then
        pass "markdown has marker, humanized counts, branch name"
    else
        fail "markdown has marker, humanized counts, branch name" "body=${body}"
    fi
}

# ── Test 5: markdown for an unknown issue errors (never posts empty) ─────────
test_markdown_unknown_issue() {
    local dir code
    dir="$(make_transcripts)"
    TOKEN_USAGE_DIR="${dir}" tu_markdown 999 >/dev/null 2>&1; code=$?
    if [ "${code}" -eq 2 ]; then
        pass "no data for issue → exit 2, nothing to post"
    else
        fail "no data for issue → exit 2, nothing to post" "code=${code}"
    fi
}

# gh stub for post tests: records method+path, serves the comment list.
make_gh_stub() {
    local dir="$1"
    cat > "${dir}/gh-stub" <<EOF
#!/usr/bin/env bash
args="\$*"
echo "\${args%%-f body=*}" >> "${dir}/gh-calls"
case "\${args}" in
    *"--method PATCH"*|*"--method POST"*) exit 0 ;;
    *"/comments --paginate"*) cat "${dir}/comments.out" ;;
esac
EOF
    chmod +x "${dir}/gh-stub"
}

# ── Test 6: post creates when no marked comment exists ───────────────────────
test_post_creates() {
    local dir out
    dir="$(make_transcripts)"
    make_gh_stub "${dir}"
    echo '' > "${dir}/comments.out"
    out="$(TOKEN_USAGE_DIR="${dir}" GH_BIN="${dir}/gh-stub" TOKEN_USAGE_REPO=o/r tu_post 42)"
    if printf '%s' "${out}" | grep -q 'posted comment on #42' \
        && grep -q -- '--method POST repos/o/r/issues/42/comments' "${dir}/gh-calls"; then
        pass "no marked comment → POST create"
    else
        fail "no marked comment → POST create" "out=${out} calls=$(cat "${dir}/gh-calls")"
    fi
}

# ── Test 7: post updates in place when the marked comment exists ─────────────
test_post_updates() {
    local dir out
    dir="$(make_transcripts)"
    make_gh_stub "${dir}"
    echo '31337' > "${dir}/comments.out"   # stub emulates gh --jq output: the id
    out="$(TOKEN_USAGE_DIR="${dir}" GH_BIN="${dir}/gh-stub" TOKEN_USAGE_REPO=o/r tu_post 42)"
    if printf '%s' "${out}" | grep -q 'updated comment on #42' \
        && grep -q -- '--method PATCH repos/o/r/issues/comments/31337' "${dir}/gh-calls"; then
        pass "marked comment exists → PATCH same comment"
    else
        fail "marked comment exists → PATCH same comment" "out=${out} calls=$(cat "${dir}/gh-calls")"
    fi
}

echo "token-usage.sh tests:"
test_scan_aggregation
test_scan_overhead
test_scan_issue_filter
test_markdown_body
test_markdown_unknown_issue
test_post_creates
test_post_updates

echo ""
echo "${TESTS_RUN} tests, ${TESTS_FAILED} failed"
if [ "${TESTS_FAILED}" -gt 0 ]; then
    printf '  failed: %s\n' "${FAILED_NAMES[@]}"
    exit 1
fi
exit 0
