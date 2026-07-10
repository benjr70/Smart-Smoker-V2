#!/usr/bin/env bash
# Tests for scripts/claude-agent/lib/rebase-driver.sh
#
# Run: bash scripts/claude-agent/lib/rebase-driver.test.sh
#
# Strategy: rebase and force-with-lease semantics ARE the behavior under test,
# so instead of stubbing git these tests build real throwaway repositories —
# a bare origin plus working clones — and assert the observable outcomes: the
# verdict JSON, the branch's final history, and (critically) that a lease push
# is REFUSED when the remote moved after our fetch.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="${SCRIPT_DIR}/rebase-driver.sh"

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

# shellcheck source=/dev/null
. "${LIB}"

# Build: bare origin with master(+1 file), a feature branch, then master moves.
# Layout under $1:  origin.git/  work/ (clone on feat branch)  other/ (2nd clone)
# $2 = "conflict" makes master's move touch the same line the branch changed.
make_repos() {
    local root="$1" mode="${2:-clean}"
    local origin="${root}/origin.git" seed="${root}/seed"

    git init --bare --quiet "${origin}"
    git clone --quiet "${origin}" "${seed}" 2>/dev/null
    (
        cd "${seed}"
        git config user.email test@test && git config user.name test
        git checkout --quiet -b master 2>/dev/null || git checkout --quiet master
        printf 'line1\nline2\nline3\n' > file.txt
        echo base > other.txt
        git add . && git commit --quiet -m "base"
        git push --quiet -u origin master

        # Feature branch: change file.txt line1 (conflict target) + own file.
        git checkout --quiet -b feat/issue-42
        printf 'feature-change\nline2\nline3\n' > file.txt
        echo feat > feat.txt
        git add . && git commit --quiet -m "feat work"
        git push --quiet -u origin feat/issue-42

        # master moves ahead.
        git checkout --quiet master
        if [ "${mode}" = "conflict" ]; then
            printf 'master-change\nline2\nline3\n' > file.txt
        else
            echo master-moved > master-only.txt
        fi
        git add . && git commit --quiet -m "master moves"
        git push --quiet origin master
    )

    git clone --quiet "${origin}" "${root}/work" 2>/dev/null
    (
        cd "${root}/work"
        git config user.email test@test && git config user.name test
        git checkout --quiet feat/issue-42
    )
    git clone --quiet "${origin}" "${root}/other" 2>/dev/null
    (
        cd "${root}/other"
        git config user.email test@test && git config user.name test
    )
}

#-------------------------------------------------------------------------------
# Test 1: no textual conflict → CLEAN, and a lease push lands the rebased branch
# on origin (branch now contains master's move).
#-------------------------------------------------------------------------------
test_clean_rebase_and_push() {
    echo "TEST: clean rebase → CLEAN, lease push lands"

    local root out status
    root="$(mktemp -d)"
    trap "rm -rf '${root}'" RETURN
    make_repos "${root}" clean

    out="$(cd "${root}/work" && rebase_onto feat/issue-42)"
    status="$(printf '%s' "${out}" | jq -r '.status')"
    if [ "${status}" != "CLEAN" ]; then
        fail "divergent-but-conflict-free rebase must be CLEAN" "out=${out}"
        return
    fi

    out="$(cd "${root}/work" && rebase_push feat/issue-42)"
    status="$(printf '%s' "${out}" | jq -r '.status')"
    if [ "${status}" != "PUSHED" ]; then
        fail "lease push after our own rebase must land" "out=${out}"
        return
    fi

    # Origin's feat branch must now contain master's commit (rebased on top).
    if ! (cd "${root}/other" && git fetch --quiet origin \
        && git merge-base --is-ancestor origin/master origin/feat/issue-42); then
        fail "origin feat branch must contain master after the rebase push"
        return
    fi

    pass "clean rebase → CLEAN, lease push lands"
}

#-------------------------------------------------------------------------------
# Test 2: textual conflict → CONFLICT with the conflicted paths listed, rebase
# left in progress; staging a resolution + rebase_continue completes CLEAN.
#-------------------------------------------------------------------------------
test_conflict_stop_resolve_continue() {
    echo "TEST: conflict stops with files, continue completes after resolution"

    local root out status files
    root="$(mktemp -d)"
    trap "rm -rf '${root}'" RETURN
    make_repos "${root}" conflict

    out="$(cd "${root}/work" && rebase_onto feat/issue-42)"
    status="$(printf '%s' "${out}" | jq -r '.status')"
    files="$(printf '%s' "${out}" | jq -r '.files[0]')"
    if [ "${status}" != "CONFLICT" ] || [ "${files}" != "file.txt" ]; then
        fail "must report CONFLICT with file.txt listed" "out=${out}"
        return
    fi

    # Rebase must still be in progress (resolvable in place).
    if [ ! -d "${root}/work/.git/rebase-merge" ] && [ ! -d "${root}/work/.git/rebase-apply" ]; then
        fail "rebase must be left in progress for in-place resolution"
        return
    fi

    # Resolve like the implementer would, stage, continue.
    (
        cd "${root}/work"
        printf 'resolved-both\nline2\nline3\n' > file.txt
        git add file.txt
    )
    out="$(cd "${root}/work" && rebase_continue)"
    status="$(printf '%s' "${out}" | jq -r '.status')"
    if [ "${status}" != "CLEAN" ]; then
        fail "continue after staged resolution must be CLEAN" "out=${out}"
        return
    fi

    pass "conflict stops with files, continue completes after resolution"
}

#-------------------------------------------------------------------------------
# Test 3 (CRITICAL): force-with-lease REFUSES when the remote branch moved after
# our fetch — a concurrent human push is never clobbered, and their commit
# survives on origin.
#-------------------------------------------------------------------------------
test_lease_refuses_moved_remote() {
    echo "TEST: lease push refused when remote moved after fetch"

    local root out status human_sha
    root="$(mktemp -d)"
    trap "rm -rf '${root}'" RETURN
    make_repos "${root}" clean

    # Our clone rebases locally (fetch happens inside rebase_onto)…
    out="$(cd "${root}/work" && rebase_onto feat/issue-42)"
    if [ "$(printf '%s' "${out}" | jq -r '.status')" != "CLEAN" ]; then
        fail "setup rebase must be CLEAN" "out=${out}"
        return
    fi

    # …then a human pushes to the same branch before we push.
    human_sha="$(
        cd "${root}/other"
        git checkout --quiet feat/issue-42
        echo human-work > human.txt
        git add . && git commit --quiet -m "human tweak"
        git push --quiet origin feat/issue-42
        git rev-parse HEAD
    )"

    out="$(cd "${root}/work" && rebase_push feat/issue-42)"
    status="$(printf '%s' "${out}" | jq -r '.status')"
    if [ "${status}" != "REJECTED" ]; then
        fail "push against a moved remote must be REJECTED" "out=${out}"
        return
    fi

    # The human's commit must still be the branch tip on origin.
    if [ "$(cd "${root}/origin.git" && git rev-parse refs/heads/feat/issue-42)" != "${human_sha}" ]; then
        fail "human's commit must survive on origin untouched"
        return
    fi

    pass "lease push refused when remote moved after fetch"
}

#-------------------------------------------------------------------------------
# Test 4: rebase_abort restores the branch to its pre-rebase tip.
#-------------------------------------------------------------------------------
test_abort_restores_branch() {
    echo "TEST: abort restores the pre-rebase branch tip"

    local root before after out
    root="$(mktemp -d)"
    trap "rm -rf '${root}'" RETURN
    make_repos "${root}" conflict

    before="$(cd "${root}/work" && git rev-parse feat/issue-42)"
    out="$(cd "${root}/work" && rebase_onto feat/issue-42)"
    if [ "$(printf '%s' "${out}" | jq -r '.status')" != "CONFLICT" ]; then
        fail "setup must stop on conflict" "out=${out}"
        return
    fi

    out="$(cd "${root}/work" && rebase_abort)"
    after="$(cd "${root}/work" && git rev-parse feat/issue-42)"
    if [ "$(printf '%s' "${out}" | jq -r '.status')" != "ABORTED" ] || [ "${before}" != "${after}" ]; then
        fail "abort must restore the original tip" "before=${before} after=${after} out=${out}"
        return
    fi

    pass "abort restores the pre-rebase branch tip"
}

#-------------------------------------------------------------------------------
# Test 5: a branch that doesn't exist → ERROR verdict, non-zero, no crash.
#-------------------------------------------------------------------------------
test_missing_branch_errors() {
    echo "TEST: missing branch yields ERROR"

    local root out rc status
    root="$(mktemp -d)"
    trap "rm -rf '${root}'" RETURN
    make_repos "${root}" clean

    out="$(cd "${root}/work" && rebase_onto feat/issue-999)"
    rc=$?
    status="$(printf '%s' "${out}" | jq -r '.status')"
    if [ "${rc}" -eq 0 ] || [ "${status}" != "ERROR" ]; then
        fail "missing branch must ERROR non-zero" "rc=${rc} out=${out}"
        return
    fi

    pass "missing branch yields ERROR"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "rebase-driver.sh tests"
echo "=========================================="

test_clean_rebase_and_push
test_conflict_stop_resolve_continue
test_lease_refuses_moved_remote
test_abort_restores_branch
test_missing_branch_errors

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
