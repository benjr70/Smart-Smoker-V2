#!/usr/bin/env bash
# Tests for scripts/claude-agent/lib/docs-only-gate.sh
#
# Run: bash scripts/claude-agent/lib/docs-only-gate.test.sh
#
# Strategy: the gate is a runnable CLI whose only outside contact is `git diff`
# and `gh pr checks` — both injected as stub binaries (GIT_BIN / GH_BIN) written
# into a temp dir, so no test ever touches the network or real repo state.
# Assertions cover the stdout JSON verdict (docsOnly / changed / mergeCmd /
# reason) and the two-value exit code — the contract afk-pickup §1.2 consumes.
# The gate never merges: every test also asserts gh is never asked to.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="${SCRIPT_DIR}/docs-only-gate.sh"

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

if [ ! -f "${GATE}" ]; then
    echo "FATAL: ${GATE} not found"
    exit 2
fi

# make_env: temp dir with a git stub that echoes the canned diff in diff.out
# (and records its argv in git-calls) and a gh stub that serves checks.json for
# `pr checks`, records every call in gh-calls, and fails on anything else.
make_env() {
    local dir; dir="$(mktemp -d)"
    cat > "${dir}/git-stub" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${dir}/git-calls"
case "\$*" in
    "cat-file"*) [ -f "${dir}/head-missing" ] && exit 1; exit 0 ;;
esac
cat "${dir}/diff.out" 2>/dev/null || exit 1
EOF
    cat > "${dir}/gh-stub" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${dir}/gh-calls"
case "\$*" in
    *"pr checks"*) cat "${dir}/checks.json" 2>/dev/null || exit 1 ;;
    *) exit 1 ;;
esac
EOF
    chmod +x "${dir}/git-stub" "${dir}/gh-stub"
    : > "${dir}/git-calls"
    : > "${dir}/gh-calls"
    printf '[{"name":"test","bucket":"pass"},{"name":"skipped-one","bucket":"skipping"}]\n' \
        > "${dir}/checks.json"
    echo "${dir}"
}

run_gate() { # run_gate <dir> <args...>
    local dir="$1"; shift
    GIT_BIN="${dir}/git-stub" GH_BIN="${dir}/gh-stub" "${GATE}" "$@"
}

#-------------------------------------------------------------------------------
# Test 1: a diff touching only docs/research/** is docs-only — exit 0, the
# verdict carries the changed paths and the admin squash command pinned to the
# head sha, --repo included so the caller can run it from any cwd.
#-------------------------------------------------------------------------------
test_docs_only_verdict() {
    echo "TEST: docs-only diff yields docsOnly true + pinned merge command"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    printf 'docs/research/577-merge-recipe.md\ndocs/research/583-spec.md\n' > "${dir}/diff.out"

    local out rc
    out="$(run_gate "${dir}" --base origin/master --head abc123 --pr 590 \
        --repo benjr70/Smart-Smoker-V2)"
    rc=$?

    if [ "${rc}" -ne 0 ]; then
        fail "docs-only diff must exit 0" "rc=${rc} out=${out}"
        return
    fi
    if [ "$(printf '%s' "${out}" | jq -r '.docsOnly')" != "true" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.sha')" != "abc123" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.changed | length')" != "2" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.changed[0]')" != "docs/research/577-merge-recipe.md" ]; then
        fail "verdict must carry docsOnly true, sha and changed paths" "out=${out}"
        return
    fi
    if [ "$(printf '%s' "${out}" | jq -r '.reason // "none"')" != "none" ]; then
        fail "an approved verdict must carry no reason" "out=${out}"
        return
    fi
    if [ "$(printf '%s' "${out}" | jq -r '.mergeCmd')" \
        != "gh pr merge 590 --repo benjr70/Smart-Smoker-V2 --squash --admin --match-head-commit abc123" ]; then
        fail "mergeCmd must be the admin squash pinned to sha, carrying --repo" "out=${out}"
        return
    fi
    if ! grep -q -- "--no-renames origin/master...abc123" "${dir}/git-calls"; then
        fail "gate must use a three-dot diff with --no-renames" \
            "calls: $(cat "${dir}/git-calls")"
        return
    fi
    if [ -s "${dir}/gh-calls" ]; then
        fail "without --check-state the gate must not call gh" "calls: $(cat "${dir}/gh-calls")"
        return
    fi

    pass "docs-only diff yields docsOnly true + pinned merge command"
}

#-------------------------------------------------------------------------------
# Test 2: any path outside docs/research/ poisons the whole PR — docsOnly false,
# exit 1, reason not-docs-only.
#-------------------------------------------------------------------------------
test_non_docs_path_refused() {
    echo "TEST: a path outside docs/research is refused"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    printf 'docs/research/577.md\napps/backend/src/app.service.ts\n' > "${dir}/diff.out"

    local out rc
    out="$(run_gate "${dir}" --base origin/master --head abc123 --pr 590 --check-state 2>/dev/null)"
    rc=$?

    if [ "${rc}" -ne 1 ]; then
        fail "a non-docs path must exit 1" "rc=${rc} out=${out}"
        return
    fi
    if [ "$(printf '%s' "${out}" | jq -r '.docsOnly')" != "false" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.reason')" != "not-docs-only" ]; then
        fail "verdict must be docsOnly false with reason not-docs-only" "out=${out}"
        return
    fi
    if [ -s "${dir}/gh-calls" ]; then
        fail "a refused PR must not even cost a check read" "calls: $(cat "${dir}/gh-calls")"
        return
    fi

    pass "a path outside docs/research is refused"
}

#-------------------------------------------------------------------------------
# Test 3: --no-renames means a file MOVED into docs/research/ still shows its
# original path — outside the prefix — so the PR is refused. (With rename
# detection on, the same diff would read as one docs/research/ path and slip a
# code deletion past the gate.)
#-------------------------------------------------------------------------------
test_rename_into_docs_research_refused() {
    echo "TEST: a rename into docs/research is refused"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    printf 'docs/research/moved-spec.md\nscripts/ralph/old-spec.md\n' > "${dir}/diff.out"

    local out rc
    out="$(run_gate "${dir}" --base origin/master --head abc123 --pr 590 2>/dev/null)"
    rc=$?

    if [ "${rc}" -ne 1 ] || [ "$(printf '%s' "${out}" | jq -r '.docsOnly')" != "false" ]; then
        fail "a renamed-in file must not make the PR docs-only" "rc=${rc} out=${out}"
        return
    fi

    pass "a rename into docs/research is refused"
}

#-------------------------------------------------------------------------------
# Test 4: an empty diff is not docs-only — nothing to merge, and an empty
# `all()` would otherwise read as vacuously true.
#-------------------------------------------------------------------------------
test_empty_diff_refused() {
    echo "TEST: an empty diff is refused"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    : > "${dir}/diff.out"

    local out rc
    out="$(run_gate "${dir}" --base origin/master --head abc123 --pr 590 2>/dev/null)"
    rc=$?

    if [ "${rc}" -ne 1 ] || [ "$(printf '%s' "${out}" | jq -r '.docsOnly')" != "false" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.changed | length')" != "0" ]; then
        fail "an empty diff must be refused" "rc=${rc} out=${out}"
        return
    fi

    pass "an empty diff is refused"
}

#-------------------------------------------------------------------------------
# Test 5: --check-state on a docs-only PR with all checks green approves the
# merge (exit 0, no reason) and hands the caller the merge command — the gate
# itself never runs it.
#-------------------------------------------------------------------------------
test_approved_when_checks_green() {
    echo "TEST: --check-state approves when checks are green"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    printf 'docs/research/577-merge-recipe.md\n' > "${dir}/diff.out"

    local out rc
    out="$(run_gate "${dir}" --base origin/master --head abc123 --pr 590 \
        --repo benjr70/Smart-Smoker-V2 --check-state)"
    rc=$?

    if [ "${rc}" -ne 0 ] || [ "$(printf '%s' "${out}" | jq -r '.reason // "none"')" != "none" ]; then
        fail "a green docs-only PR must be approved (exit 0, no reason)" "rc=${rc} out=${out}"
        return
    fi
    if ! grep -q "^pr checks 590 --repo benjr70/Smart-Smoker-V2 --json name,bucket$" \
        "${dir}/gh-calls"; then
        fail "check state must be read for the given repo" "calls: $(cat "${dir}/gh-calls")"
        return
    fi
    if grep -q "pr merge" "${dir}/gh-calls"; then
        fail "the gate must never merge — the caller runs mergeCmd" \
            "calls: $(cat "${dir}/gh-calls")"
        return
    fi

    pass "--check-state approves when checks are green"
}

#-------------------------------------------------------------------------------
# Test 6: a failing check refuses — exit 1 with reason checks-not-green, and the
# verdict still says docsOnly true (the refusal is about CI, not the paths).
#-------------------------------------------------------------------------------
test_refused_when_checks_red() {
    echo "TEST: --check-state refuses when a check is not green"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    printf 'docs/research/577-merge-recipe.md\n' > "${dir}/diff.out"
    printf '[{"name":"test","bucket":"pass"},{"name":"lint","bucket":"fail"}]\n' \
        > "${dir}/checks.json"

    local out rc
    out="$(run_gate "${dir}" --base origin/master --head abc123 --pr 590 --check-state 2>/dev/null)"
    rc=$?

    if [ "${rc}" -ne 1 ]; then
        fail "a red check must refuse with exit 1" "rc=${rc} out=${out}"
        return
    fi
    if [ "$(printf '%s' "${out}" | jq -r '.docsOnly')" != "true" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.reason')" != "checks-not-green" ]; then
        fail "verdict must stay docsOnly true with reason checks-not-green" "out=${out}"
        return
    fi

    pass "--check-state refuses when a check is not green"
}

#-------------------------------------------------------------------------------
# Test 7: a still-pending check is not green either — the daemon re-runs the
# gate next fire rather than approving mid-CI.
#-------------------------------------------------------------------------------
test_refused_when_checks_pending() {
    echo "TEST: --check-state refuses while checks are pending"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    printf 'docs/research/577-merge-recipe.md\n' > "${dir}/diff.out"
    printf '[{"name":"test","bucket":"pending"}]\n' > "${dir}/checks.json"

    local out rc
    out="$(run_gate "${dir}" --base origin/master --head abc123 --pr 590 --check-state 2>/dev/null)"
    rc=$?

    if [ "${rc}" -ne 1 ] || [ "$(printf '%s' "${out}" | jq -r '.reason')" != "checks-not-green" ]; then
        fail "pending checks must refuse the merge" "rc=${rc} out=${out}"
        return
    fi

    pass "--check-state refuses while checks are pending"
}

#-------------------------------------------------------------------------------
# Test 8: unreadable check state fails SAFE — no check list, no approval.
#-------------------------------------------------------------------------------
test_refused_when_checks_unreadable() {
    echo "TEST: --check-state refuses when check state is unreadable"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    printf 'docs/research/577-merge-recipe.md\n' > "${dir}/diff.out"
    rm -f "${dir}/checks.json"

    local out rc
    out="$(run_gate "${dir}" --base origin/master --head abc123 --pr 590 --check-state 2>/dev/null)"
    rc=$?

    if [ "${rc}" -ne 1 ] || [ "$(printf '%s' "${out}" | jq -r '.reason')" != "checks-unreadable" ]; then
        fail "unreadable checks must refuse the merge" "rc=${rc} out=${out}"
        return
    fi

    pass "--check-state refuses when check state is unreadable"
}

#-------------------------------------------------------------------------------
# Test 8b: an EMPTY check array is not green — it means nothing ran (the gate
# fired seconds after the push, or a required workflow never queued). An admin
# merge also bypasses branch protection's required-check list, so approving here
# would land a docs PR with zero CI signal.
#-------------------------------------------------------------------------------
test_refused_when_checks_empty() {
    echo "TEST: --check-state refuses when no checks ran at all"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    printf 'docs/research/577-merge-recipe.md\n' > "${dir}/diff.out"
    printf '[]\n' > "${dir}/checks.json"

    local out rc
    out="$(run_gate "${dir}" --base origin/master --head abc123 --pr 590 --check-state 2>/dev/null)"
    rc=$?

    if [ "${rc}" -ne 1 ] || [ "$(printf '%s' "${out}" | jq -r '.reason')" != "checks-missing" ]; then
        fail "an empty check list must refuse with reason checks-missing" "rc=${rc} out=${out}"
        return
    fi
    if [ "$(printf '%s' "${out}" | jq -r '.docsOnly')" != "true" ]; then
        fail "verdict must stay docsOnly true — the refusal is about CI" "out=${out}"
        return
    fi

    pass "--check-state refuses when no checks ran at all"
}

#-------------------------------------------------------------------------------
# Test 9: the gate is a pure decision — no flag, no check state and no verdict
# makes it mutate anything. It only ever reads.
#-------------------------------------------------------------------------------
test_gate_never_mutates() {
    echo "TEST: the gate never merges, whatever the verdict"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    printf 'docs/research/577-merge-recipe.md\n' > "${dir}/diff.out"

    local out
    run_gate "${dir}" --base origin/master --head abc123 --pr 590 >/dev/null 2>&1
    run_gate "${dir}" --base origin/master --head abc123 --pr 590 --check-state >/dev/null 2>&1
    out="$(run_gate "${dir}" --base origin/master --head abc123 --pr 590)"

    if grep -qE "pr merge|push|api .* -X" "${dir}/gh-calls" \
        || grep -qE "(^|[[:space:]])(push|commit|merge)([[:space:]]|$)" "${dir}/git-calls"; then
        fail "the gate must never mutate" \
            "gh: $(cat "${dir}/gh-calls") git: $(cat "${dir}/git-calls")"
        return
    fi
    if [ "$(printf '%s' "${out}" | jq -r '.mergeCmd')" \
        != "gh pr merge 590 --squash --admin --match-head-commit abc123" ]; then
        fail "mergeCmd without --repo must carry no --repo flag" "out=${out}"
        return
    fi

    pass "the gate never merges, whatever the verdict"
}

#-------------------------------------------------------------------------------
# Test 10: missing/unknown args are a gate ERROR — exit 1 like every refusal,
# but the JSON reason is "usage", which afk-pickup §1.2 must report as a harness
# bug rather than as a verdict about the PR.
#-------------------------------------------------------------------------------
test_missing_args_usage_error() {
    echo "TEST: missing args report reason usage"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN

    local out rc
    out="$(run_gate "${dir}" --base origin/master --head abc123 2>/dev/null)"
    rc=$?
    if [ "${rc}" -ne 1 ] || [ "$(printf '%s' "${out}" | jq -r '.reason')" != "usage" ]; then
        fail "a missing --pr must exit 1 with reason usage" "rc=${rc} out=${out}"
        return
    fi

    out="$(run_gate "${dir}" --bogus x 2>/dev/null)"
    rc=$?
    if [ "${rc}" -ne 1 ] || [ "$(printf '%s' "${out}" | jq -r '.reason')" != "usage" ]; then
        fail "an unknown arg must exit 1 with reason usage" "rc=${rc} out=${out}"
        return
    fi

    pass "missing args report reason usage"
}

#-------------------------------------------------------------------------------
# Test 11: the head object is not in the local clone (agent-run fetches only
# origin/master; the PR branch may be pruned or pushed from another checkout).
# A three-dot diff against a missing sha would fail — or worse, diff nothing —
# so the gate says so explicitly: reason head-missing, no diff attempted. The
# caller must NOT read this as a "not docs-only" refusal.
#-------------------------------------------------------------------------------
test_missing_head_object_is_gate_error() {
    echo "TEST: a missing head object reports reason head-missing"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    printf 'docs/research/577-merge-recipe.md\n' > "${dir}/diff.out"
    : > "${dir}/head-missing"

    local out rc
    out="$(run_gate "${dir}" --base origin/master --head abc123 --pr 590 --check-state 2>/dev/null)"
    rc=$?

    if [ "${rc}" -ne 1 ]; then
        fail "a missing head object must exit 1" "rc=${rc} out=${out}"
        return
    fi
    if [ "$(printf '%s' "${out}" | jq -r '.docsOnly')" != "false" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.reason')" != "head-missing" ]; then
        fail "verdict must be docsOnly false with reason head-missing" "out=${out}"
        return
    fi
    if ! grep -q -- "^cat-file -e abc123\^{commit}$" "${dir}/git-calls"; then
        fail "gate must probe the head object before diffing" \
            "calls: $(cat "${dir}/git-calls")"
        return
    fi
    if grep -q -- "diff" "${dir}/git-calls" || [ -s "${dir}/gh-calls" ]; then
        fail "an absent head must stop the gate before diff/check read" \
            "git: $(cat "${dir}/git-calls") gh: $(cat "${dir}/gh-calls")"
        return
    fi

    pass "a missing head object reports reason head-missing"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "docs-only-gate.sh tests"
echo "=========================================="

test_docs_only_verdict
test_non_docs_path_refused
test_rename_into_docs_research_refused
test_empty_diff_refused
test_approved_when_checks_green
test_refused_when_checks_red
test_refused_when_checks_pending
test_refused_when_checks_unreadable
test_refused_when_checks_empty
test_gate_never_mutates
test_missing_args_usage_error
test_missing_head_object_is_gate_error

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
