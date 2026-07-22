#!/usr/bin/env bash
# Tests for scripts/claude-agent/lib/review-poster.sh
#
# Run: bash scripts/claude-agent/lib/review-poster.test.sh
#
# Strategy: the poster's job is (a) render a finding into the uniform
# marker-bearing comment body, (b) post it as an inline review comment anchored
# to a diff line, (c) filter the thread-reconciler's enumeration down to
# agent-authored threads via the marker, (d) detect and post the once-per-PR
# done-marker comment. A GH_BIN stub logs every call and plays back a canned
# response, so the tests assert observable behavior — what was asked of gh and
# how responses were distilled — with no network.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="${SCRIPT_DIR}/review-poster.sh"

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

if [ ! -f "${LIB}" ]; then
    echo "FATAL: ${LIB} not found"
    exit 2
fi

# Build a stub gh that logs args and prints the canned response file (if any).
make_stub() {
    local dir; dir="$(mktemp -d)"
    : > "${dir}/gh.log"
    cat > "${dir}/gh-stub" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "${dir}/gh.log"
if [ -f "${dir}/response.json" ]; then
  cat "${dir}/response.json"
fi
exit "\$(cat "${dir}/exit-code" 2>/dev/null || echo 0)"
EOF
    chmod +x "${dir}/gh-stub"
    printf '%s' "${dir}"
}

# Canned tr_unresolved_threads output: 1 human thread + 2 agent-marked threads.
threads_fixture() {
    cat <<'EOF'
[{"threadId":"RT_1","path":"apps/backend/src/a.ts","line":12,"commentDatabaseId":9001,"body":"rename this variable"},
 {"threadId":"RT_2","path":"apps/backend/src/b.ts","line":3,"commentDatabaseId":9002,"body":"<!-- pr-review-bot -->\n🤖 **pr-review** · correctness · logic-error · high\n\ninverted null check"},
 {"threadId":"RT_3","path":"apps/frontend/src/c.tsx","line":40,"commentDatabaseId":9003,"body":"<!-- pr-review-bot -->\n🤖 **pr-review** · spec · missing-requirement · medium\n\nAC 3 not implemented"}]
EOF
}

#-------------------------------------------------------------------------------
# Test 1: rp_render_finding output carries the machine marker, the visible 🤖
# header with axis/category/severity, the summary, and the failure scenario.
#-------------------------------------------------------------------------------
test_render_finding_body() {
    echo "TEST: rendered finding carries marker + template fields"

    local out
    out="$(bash -c ". '${LIB}'; rp_render_finding correctness logic-error high 'inverted null check on save' 'a null profile crashes the save endpoint'")"

    if ! printf '%s' "${out}" | grep -qF '<!-- pr-review-bot -->'; then
        fail "body must contain the machine marker" "out=${out}"
        return
    fi
    if ! printf '%s' "${out}" | grep -q '🤖 \*\*pr-review\*\* · correctness · logic-error · high'; then
        fail "body must contain the visible 🤖 axis/category/severity header" "out=${out}"
        return
    fi
    if ! printf '%s' "${out}" | grep -qF 'inverted null check on save'; then
        fail "body must contain the summary" "out=${out}"
        return
    fi
    if ! printf '%s' "${out}" | grep -qF '**Failure scenario:** a null profile crashes the save endpoint'; then
        fail "body must contain the failure scenario" "out=${out}"
        return
    fi

    pass "rendered finding carries marker + template fields"
}

#-------------------------------------------------------------------------------
# Test 2: rp_post_inline posts to the pulls comments endpoint with path, line,
# side=RIGHT, and the anchoring commit_id — an inline thread, not a detached
# comment.
#-------------------------------------------------------------------------------
test_post_inline_anchors() {
    echo "TEST: inline post anchors path/line/side/commit"

    local dir gh_log
    dir="$(make_stub)"
    trap "rm -rf '${dir}'" RETURN

    GH_BIN="${dir}/gh-stub" bash -c \
        ". '${LIB}'; rp_post_inline benjr70/Smart-Smoker-V2 310 abc1234 apps/backend/src/a.ts 12 'the body'"

    gh_log="$(cat "${dir}/gh.log")"
    if ! printf '%s' "${gh_log}" | grep -q 'repos/benjr70/Smart-Smoker-V2/pulls/310/comments'; then
        fail "must post to the PR review-comments endpoint" "gh.log=${gh_log}"
        return
    fi
    if ! printf '%s' "${gh_log}" | grep -q 'commit_id=abc1234' \
        || ! printf '%s' "${gh_log}" | grep -q 'path=apps/backend/src/a.ts' \
        || ! printf '%s' "${gh_log}" | grep -q 'line=12' \
        || ! printf '%s' "${gh_log}" | grep -q 'side=RIGHT'; then
        fail "must anchor with commit_id, path, line, side=RIGHT" "gh.log=${gh_log}"
        return
    fi
    if ! printf '%s' "${gh_log}" | grep -q 'body=the body'; then
        fail "must carry the rendered body" "gh.log=${gh_log}"
        return
    fi

    pass "inline post anchors path/line/side/commit"
}

#-------------------------------------------------------------------------------
# Test 3: rp_filter_agent_threads keeps only marker-bearing threads from the
# tr_unresolved_threads array — human threads never reach the fix loop.
#-------------------------------------------------------------------------------
test_filter_keeps_only_agent_threads() {
    echo "TEST: filter keeps only agent-marked threads"

    local out count
    out="$(threads_fixture | bash -c ". '${LIB}'; rp_filter_agent_threads")"

    count="$(printf '%s' "${out}" | jq 'length')"
    if [ "${count}" != "2" ]; then
        fail "must keep exactly the 2 marker-bearing threads" "out=${out}"
        return
    fi
    if [ "$(printf '%s' "${out}" | jq -r '.[0].threadId')" != "RT_2" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.[1].threadId')" != "RT_3" ]; then
        fail "human RT_1 must be dropped, RT_2/RT_3 kept with ids intact" "out=${out}"
        return
    fi
    if [ "$(printf '%s' "${out}" | jq -r '.[0].commentDatabaseId')" != "9002" ]; then
        fail "thread fields must survive the filter" "out=${out}"
        return
    fi

    pass "filter keeps only agent-marked threads"
}

#-------------------------------------------------------------------------------
# Test 4: rp_done_marker_present exits 0 when a top-level comment carries the
# done-marker, 1 when none does.
#-------------------------------------------------------------------------------
test_done_marker_detection() {
    echo "TEST: done-marker detection"

    local dir rc
    dir="$(make_stub)"
    trap "rm -rf '${dir}'" RETURN

    cat > "${dir}/response.json" <<'EOF'
[{"body":"manual-verify: 3/3 PASS"},
 {"body":"<!-- pr-review-done reviewed=abc1234 fixes=def5678 -->\n🤖 pr-review: 3 findings, 2 fixed (reviewed abc1234)"}]
EOF
    GH_BIN="${dir}/gh-stub" bash -c ". '${LIB}'; rp_done_marker_present benjr70/Smart-Smoker-V2 310"
    rc=$?
    if [ "${rc}" -ne 0 ]; then
        fail "marker present must exit 0" "rc=${rc}"
        return
    fi

    cat > "${dir}/response.json" <<'EOF'
[{"body":"manual-verify: 3/3 PASS"},{"body":"just a human comment"}]
EOF
    GH_BIN="${dir}/gh-stub" bash -c ". '${LIB}'; rp_done_marker_present benjr70/Smart-Smoker-V2 310"
    rc=$?
    if [ "${rc}" -eq 0 ]; then
        fail "marker absent must exit non-zero" "rc=${rc}"
        return
    fi

    pass "done-marker detection"
}

#-------------------------------------------------------------------------------
# Test 5: rp_post_done_marker posts one top-level comment carrying the machine
# marker with both SHAs and the human-readable tally.
#-------------------------------------------------------------------------------
test_post_done_marker() {
    echo "TEST: done-marker comment body"

    local dir gh_log
    dir="$(make_stub)"
    trap "rm -rf '${dir}'" RETURN

    GH_BIN="${dir}/gh-stub" bash -c \
        ". '${LIB}'; rp_post_done_marker benjr70/Smart-Smoker-V2 310 3 2 abc1234 def5678"

    gh_log="$(cat "${dir}/gh.log")"
    if ! printf '%s' "${gh_log}" | grep -q 'repos/benjr70/Smart-Smoker-V2/issues/310/comments'; then
        fail "must post a top-level issue comment on the PR" "gh.log=${gh_log}"
        return
    fi
    if ! printf '%s' "${gh_log}" | grep -qF '<!-- pr-review-done reviewed=abc1234 fixes=def5678 -->'; then
        fail "must carry the machine marker with both SHAs" "gh.log=${gh_log}"
        return
    fi
    if ! printf '%s' "${gh_log}" | grep -q '🤖 pr-review: 3 findings, 2 fixed (reviewed abc1234)'; then
        fail "must carry the human-readable tally" "gh.log=${gh_log}"
        return
    fi

    pass "done-marker comment body"
}

#-------------------------------------------------------------------------------
# Test 6: an API failure surfaces as a non-zero exit from rp_post_inline (the
# skill's 422 fallback keys off this), never a silent success.
#-------------------------------------------------------------------------------
test_api_failure_surfaces() {
    echo "TEST: API failure exits non-zero"

    local dir rc
    dir="$(make_stub)"
    trap "rm -rf '${dir}'" RETURN
    echo 1 > "${dir}/exit-code"

    GH_BIN="${dir}/gh-stub" bash -c \
        ". '${LIB}'; rp_post_inline benjr70/Smart-Smoker-V2 310 abc1234 apps/backend/src/a.ts 12 'body'" \
        >/dev/null 2>&1
    rc=$?

    if [ "${rc}" -eq 0 ]; then
        fail "a failed API call must exit non-zero" "rc=${rc}"
        return
    fi

    pass "API failure exits non-zero"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "review-poster.sh tests"
echo "=========================================="

test_render_finding_body
test_post_inline_anchors
test_filter_keeps_only_agent_threads
test_done_marker_detection
test_post_done_marker
test_api_failure_surfaces

echo ""
echo "=========================================="
echo "Ran: ${TESTS_RUN} | Failed: ${TESTS_FAILED}"
echo "=========================================="

if [ "${TESTS_FAILED}" -gt 0 ]; then
    echo "Failed tests:"
    for name in "${FAILED_NAMES[@]}"; do
        echo "  - ${name}"
    done
    exit 1
fi

exit 0
