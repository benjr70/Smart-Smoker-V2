#!/usr/bin/env bash
# Tests for scripts/claude-agent/lib/thread-reconciler.sh
#
# Run: bash scripts/claude-agent/lib/thread-reconciler.test.sh
#
# Strategy: the reconciler's job is (a) enumerate only UNRESOLVED review
# threads from the GraphQL response shape, (b) reply in-thread via the REST
# in_reply_to parameter, (c) resolve via the resolveReviewThread mutation. A
# GH_BIN stub logs every call and plays back a canned GraphQL response, so the
# tests assert observable behavior — what was asked of gh and how the response
# was distilled — with no network.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="${SCRIPT_DIR}/thread-reconciler.sh"

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

# Canned GraphQL response: 2 unresolved + 1 resolved thread.
graphql_fixture() {
    cat <<'EOF'
{"data":{"repository":{"pullRequest":{"reviewThreads":{"nodes":[
  {"id":"RT_1","isResolved":false,"path":"apps/backend/src/a.ts","line":12,
   "comments":{"nodes":[{"databaseId":9001,"body":"rename this variable"}]}},
  {"id":"RT_2","isResolved":true,"path":"apps/backend/src/b.ts","line":3,
   "comments":{"nodes":[{"databaseId":9002,"body":"already handled"}]}},
  {"id":"RT_3","isResolved":false,"path":null,"line":null,
   "comments":{"nodes":[{"databaseId":9003,"body":"missing test for the sad path"}]}}
]}}}}}
EOF
}

#-------------------------------------------------------------------------------
# Test 1: only unresolved threads are enumerated, with threadId, first-comment
# databaseId, and body distilled for the fix loop.
#-------------------------------------------------------------------------------
test_enumerates_only_unresolved() {
    echo "TEST: enumerates only unresolved threads"

    local dir out count
    dir="$(make_stub)"
    trap "rm -rf '${dir}'" RETURN
    graphql_fixture > "${dir}/response.json"

    # shellcheck source=/dev/null
    out="$(GH_BIN="${dir}/gh-stub" bash -c ". '${LIB}'; tr_unresolved_threads benjr70/Smart-Smoker-V2 310")"

    count="$(printf '%s' "${out}" | jq 'length')"
    if [ "${count}" != "2" ]; then
        fail "must return exactly the 2 unresolved threads" "out=${out}"
        return
    fi
    if [ "$(printf '%s' "${out}" | jq -r '.[0].threadId')" != "RT_1" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.[0].commentDatabaseId')" != "9001" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.[0].body')" != "rename this variable" ]; then
        fail "thread fields must be distilled (id, comment REST id, body)" "out=${out}"
        return
    fi
    if [ "$(printf '%s' "${out}" | jq -r '.[1].threadId')" != "RT_3" ]; then
        fail "resolved RT_2 must be skipped, RT_3 kept" "out=${out}"
        return
    fi

    pass "enumerates only unresolved threads"
}

#-------------------------------------------------------------------------------
# Test 2: the GraphQL query targets the right repo + PR (owner/name split, pr
# number forwarded).
#-------------------------------------------------------------------------------
test_query_targets_right_pr() {
    echo "TEST: query targets the right repo and PR"

    local dir gh_log
    dir="$(make_stub)"
    trap "rm -rf '${dir}'" RETURN
    graphql_fixture > "${dir}/response.json"

    GH_BIN="${dir}/gh-stub" bash -c ". '${LIB}'; tr_unresolved_threads benjr70/Smart-Smoker-V2 310" >/dev/null

    gh_log="$(cat "${dir}/gh.log")"
    if ! printf '%s' "${gh_log}" | grep -q 'owner=benjr70' \
        || ! printf '%s' "${gh_log}" | grep -q 'name=Smart-Smoker-V2' \
        || ! printf '%s' "${gh_log}" | grep -q 'pr=310'; then
        fail "owner/name/pr must be forwarded to the GraphQL call" "gh.log=${gh_log}"
        return
    fi

    pass "query targets the right repo and PR"
}

#-------------------------------------------------------------------------------
# Test 3: tr_reply posts to the pulls comments endpoint with in_reply_to set to
# the reviewer's comment id — an in-thread answer, not a detached comment.
#-------------------------------------------------------------------------------
test_reply_is_in_thread() {
    echo "TEST: reply lands in-thread via in_reply_to"

    local dir gh_log
    dir="$(make_stub)"
    trap "rm -rf '${dir}'" RETURN

    GH_BIN="${dir}/gh-stub" bash -c \
        ". '${LIB}'; tr_reply benjr70/Smart-Smoker-V2 310 9001 'fixed in abc123: renamed the variable'"

    gh_log="$(cat "${dir}/gh.log")"
    if ! printf '%s' "${gh_log}" | grep -q 'repos/benjr70/Smart-Smoker-V2/pulls/310/comments'; then
        fail "must post to the PR review-comments endpoint" "gh.log=${gh_log}"
        return
    fi
    if ! printf '%s' "${gh_log}" | grep -q 'in_reply_to=9001'; then
        fail "must reply to the reviewer comment (in_reply_to)" "gh.log=${gh_log}"
        return
    fi
    if ! printf '%s' "${gh_log}" | grep -q 'body=fixed in abc123: renamed the variable'; then
        fail "must carry the fix summary body" "gh.log=${gh_log}"
        return
    fi

    pass "reply lands in-thread via in_reply_to"
}

#-------------------------------------------------------------------------------
# Test 4: tr_resolve fires the resolveReviewThread mutation with the thread id.
#-------------------------------------------------------------------------------
test_resolve_fires_mutation() {
    echo "TEST: resolve fires the resolveReviewThread mutation"

    local dir gh_log
    dir="$(make_stub)"
    trap "rm -rf '${dir}'" RETURN

    GH_BIN="${dir}/gh-stub" bash -c ". '${LIB}'; tr_resolve RT_1"

    gh_log="$(cat "${dir}/gh.log")"
    if ! printf '%s' "${gh_log}" | grep -q 'resolveReviewThread'; then
        fail "must call the resolveReviewThread mutation" "gh.log=${gh_log}"
        return
    fi
    if ! printf '%s' "${gh_log}" | grep -q 'threadId=RT_1'; then
        fail "must pass the thread id" "gh.log=${gh_log}"
        return
    fi

    pass "resolve fires the resolveReviewThread mutation"
}

#-------------------------------------------------------------------------------
# Test 5: an API failure surfaces as a non-zero exit from tr_unresolved_threads
# (the skill treats it as no-reconcile this fire), never a crash or bogus JSON.
#-------------------------------------------------------------------------------
test_api_failure_surfaces() {
    echo "TEST: API failure exits non-zero"

    local dir rc
    dir="$(make_stub)"
    trap "rm -rf '${dir}'" RETURN
    echo 1 > "${dir}/exit-code"

    GH_BIN="${dir}/gh-stub" bash -c ". '${LIB}'; tr_unresolved_threads benjr70/Smart-Smoker-V2 310" >/dev/null 2>&1
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
echo "thread-reconciler.sh tests"
echo "=========================================="

test_enumerates_only_unresolved
test_query_targets_right_pr
test_reply_is_in_thread
test_resolve_fires_mutation
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
