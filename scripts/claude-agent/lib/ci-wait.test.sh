#!/usr/bin/env bash
# Tests for scripts/claude-agent/lib/ci-wait.sh
#
# Run: bash scripts/claude-agent/lib/ci-wait.test.sh
#
# Strategy: the gh stub is STATEFUL — a counter file advances one canned
# `pr checks` fixture per poll (checks-1.out, checks-2.out, …; the last one
# repeats), so tests drive pending→settled transitions. Interval 0 keeps the
# loop instant. Assertions cover the exit code + the line-1 JSON verdict + the
# failure log bundle — the exact contract pr-watch consumes.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CI_WAIT="${SCRIPT_DIR}/ci-wait.sh"

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

make_env() {
    local dir; dir="$(mktemp -d)"
    echo 0 > "${dir}/poll-count"
    cat > "${dir}/gh-stub" <<EOF
#!/usr/bin/env bash
args="\$*"
case "\${args}" in
    *"pr checks"*)
        n=\$(( \$(cat "${dir}/poll-count") + 1 ))
        echo "\${n}" > "${dir}/poll-count"
        while [ "\${n}" -gt 0 ]; do
            if [ -f "${dir}/checks-\${n}.out" ]; then cat "${dir}/checks-\${n}.out"; exit 0; fi
            n=\$(( n - 1 ))
        done
        exit 1 ;;
    *"run view"*)
        cat "${dir}/runlog.out" 2>/dev/null || exit 1 ;;
    *) exit 1 ;;
esac
EOF
    chmod +x "${dir}/gh-stub"
    echo 'line1
FAIL: expected 3 to be 4' > "${dir}/runlog.out"
    echo "${dir}"
}

checks() { # checks <bucket:name:link csv> → JSON array fixture on stdout
    local out='[' sep='' item bucket name link
    for item in "$@"; do
        IFS=':' read -r bucket name link <<< "${item}"
        out="${out}${sep}{\"bucket\":\"${bucket}\",\"name\":\"${name}\",\"state\":\"X\",\"link\":\"${link:-}\"}"
        sep=','
    done
    printf '%s]' "${out}"
}

run_wait() { # run_wait <dir> [extra args...] — echoes output, returns code
    local dir="$1"; shift
    GH_BIN="${dir}/gh-stub" bash "${CI_WAIT}" --pr 1 --repo o/r --interval 0 "$@"
}

# ── Test 1: pending → green settles with exit 0 and poll count ───────────────
test_green_after_pending() {
    local dir out code
    dir="$(make_env)"
    checks "pending:build" > "${dir}/checks-1.out"
    checks "pass:build"    > "${dir}/checks-2.out"
    out="$(run_wait "${dir}")"; code=$?
    if [ "${code}" -eq 0 ] \
        && [ "$(printf '%s' "${out}" | head -1 | jq -r '.result')" = "green" ] \
        && [ "$(printf '%s' "${out}" | head -1 | jq -r '.polls')" = "2" ]; then
        pass "pending then green → exit 0, result green, polls 2"
    else
        fail "pending then green → exit 0, result green, polls 2" "code=${code} out=${out}"
    fi
}

# ── Test 2: settled red → exit 1, failed list + log bundle on stdout ─────────
test_fail_with_log_bundle() {
    local dir out code
    dir="$(make_env)"
    checks "fail:unit-tests:https://x/actions/runs/1234/job/9" "pass:lint" > "${dir}/checks-1.out"
    out="$(run_wait "${dir}")"; code=$?
    if [ "${code}" -eq 1 ] \
        && [ "$(printf '%s' "${out}" | head -1 | jq -r '.result')" = "fail" ] \
        && [ "$(printf '%s' "${out}" | head -1 | jq -r '.failed[0].name')" = "unit-tests" ] \
        && printf '%s' "${out}" | grep -q '=== unit-tests ===' \
        && printf '%s' "${out}" | grep -q 'FAIL: expected 3 to be 4'; then
        pass "red → exit 1, failed[] + '=== job ===' log tail"
    else
        fail "red → exit 1, failed[] + '=== job ===' log tail" "code=${code} out=${out}"
    fi
}

# ── Test 3: fail+pending keeps waiting (checks not settled yet) ──────────────
test_fail_waits_for_pending() {
    local dir out code
    dir="$(make_env)"
    checks "fail:unit:https://x/actions/runs/1/job/2" "pending:e2e" > "${dir}/checks-1.out"
    checks "fail:unit:https://x/actions/runs/1/job/2" "pass:e2e"    > "${dir}/checks-2.out"
    out="$(run_wait "${dir}")"; code=$?
    if [ "${code}" -eq 1 ] \
        && [ "$(printf '%s' "${out}" | head -1 | jq -r '.polls')" = "2" ]; then
        pass "fail+pending waits for settle before verdict"
    else
        fail "fail+pending waits for settle before verdict" "code=${code} out=${out}"
    fi
}

# ── Test 4: skipping bucket is benign ────────────────────────────────────────
test_skipping_is_green() {
    local dir out code
    dir="$(make_env)"
    checks "skipping:docs" "pass:build" > "${dir}/checks-1.out"
    out="$(run_wait "${dir}")"; code=$?
    if [ "${code}" -eq 0 ] && [ "$(printf '%s' "${out}" | head -1 | jq -r '.result')" = "green" ]; then
        pass "skipping bucket ignored → green"
    else
        fail "skipping bucket ignored → green" "code=${code} out=${out}"
    fi
}

# ── Test 5: deadline with pending → exit 2, pending count reported ───────────
test_timeout() {
    local dir out code
    dir="$(make_env)"
    checks "pending:build" > "${dir}/checks-1.out"
    out="$(run_wait "${dir}" --timeout-mins 0)"; code=$?
    if [ "${code}" -eq 2 ] \
        && [ "$(printf '%s' "${out}" | head -1 | jq -r '.result')" = "timeout" ] \
        && [ "$(printf '%s' "${out}" | head -1 | jq -r '.pending')" = "1" ]; then
        pass "deadline with pending → exit 2, result timeout"
    else
        fail "deadline with pending → exit 2, result timeout" "code=${code} out=${out}"
    fi
}

# ── Test 6: three consecutive unreadable polls → exit 3 error ────────────────
test_unreadable_errors_out() {
    local dir out code
    dir="$(make_env)"
    # No checks fixture at all → stub exits 1 on every pr checks call.
    rm -f "${dir}"/checks-*.out
    out="$(run_wait "${dir}")"; code=$?
    if [ "${code}" -eq 3 ] && [ "$(printf '%s' "${out}" | head -1 | jq -r '.result')" = "error" ]; then
        pass "3 unreadable polls → exit 3, result error"
    else
        fail "3 unreadable polls → exit 3, result error" "code=${code} out=${out}"
    fi
}

# ── Test 7: missing required args → exit 3, no JSON ──────────────────────────
test_missing_args() {
    local code
    bash "${CI_WAIT}" --pr 1 >/dev/null 2>&1; code=$?
    if [ "${code}" -eq 3 ]; then
        pass "missing --repo → exit 3"
    else
        fail "missing --repo → exit 3" "code=${code}"
    fi
}

echo "ci-wait.sh tests:"
test_green_after_pending
test_fail_with_log_bundle
test_fail_waits_for_pending
test_skipping_is_green
test_timeout
test_unreadable_errors_out
test_missing_args

echo ""
echo "${TESTS_RUN} tests, ${TESTS_FAILED} failed"
if [ "${TESTS_FAILED}" -gt 0 ]; then
    printf '  failed: %s\n' "${FAILED_NAMES[@]}"
    exit 1
fi
exit 0
