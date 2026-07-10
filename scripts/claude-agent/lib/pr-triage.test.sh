#!/usr/bin/env bash
# Tests for scripts/claude-agent/lib/pr-triage.sh
#
# Run: bash scripts/claude-agent/lib/pr-triage.test.sh
#
# Strategy: pr_triage_pick is a pure function of the `gh pr list --json` payload
# supplied on stdin plus PR_TRIAGE_AUTHOR. Each test builds a PR-list fixture
# and asserts the pick verdict (which PR, extracted issue number, reason) — the
# external behavior the reconcile phase acts on, never the jq internals.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="${SCRIPT_DIR}/pr-triage.sh"

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

# pr_json <number> <branch> <mergeable> <createdAt> <labels-csv> [author] [isDraft] [state]
pr_json() {
    local number="$1" branch="$2" mergeable="$3" created="$4" labels_csv="${5:-}"
    local author="${6:-agent-bot}" is_draft="${7:-false}" state="${8:-OPEN}"
    local labels="[]"
    if [ -n "${labels_csv}" ]; then
        labels="$(printf '%s' "${labels_csv}" | jq -R 'split(",") | map({name: .})')"
    fi
    jq -n \
        --argjson number "${number}" \
        --arg branch "${branch}" \
        --arg mergeable "${mergeable}" \
        --arg created "${created}" \
        --argjson labels "${labels}" \
        --arg author "${author}" \
        --argjson isDraft "${is_draft}" \
        --arg state "${state}" \
        '{number: $number, headRefName: $branch, mergeable: $mergeable,
          createdAt: $created, labels: $labels, author: {login: $author},
          isDraft: $isDraft, state: $state}'
}

#-------------------------------------------------------------------------------
# Test 1: a conflicting team PR is picked with reason "conflict" and the issue
# number extracted from the branch name.
#-------------------------------------------------------------------------------
test_conflicting_pr_picked() {
    echo "TEST: conflicting team PR is picked"

    local out rc
    out="$(jq -s '.' \
        <(pr_json 310 "feat/issue-281" "CONFLICTING" "2026-07-09T10:00:00Z" "") \
        | pr_triage_pick)"
    rc=$?

    if [ "${rc}" -ne 0 ]; then
        fail "conflicting PR must be picked (exit 0)" "rc=${rc} out=${out}"
        return
    fi
    if [ "$(printf '%s' "${out}" | jq -r '.pr')" != "310" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.issue')" != "281" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.reason')" != "conflict" ]; then
        fail "verdict must carry pr=310 issue=281 reason=conflict" "out=${out}"
        return
    fi

    pass "conflicting team PR is picked"
}

#-------------------------------------------------------------------------------
# Test 2: team:revise beats a plain conflict, even when the conflicting PR is
# older — a human explicitly waiting on their review outranks mechanical drift.
#-------------------------------------------------------------------------------
test_revise_beats_conflict() {
    echo "TEST: team:revise outranks CONFLICTING"

    local out
    out="$(jq -s '.' \
        <(pr_json 310 "feat/issue-281" "CONFLICTING" "2026-07-01T10:00:00Z" "") \
        <(pr_json 311 "feat/issue-282" "MERGEABLE"   "2026-07-09T10:00:00Z" "team:revise") \
        | pr_triage_pick)"

    if [ "$(printf '%s' "${out}" | jq -r '.pr')" != "311" ] \
        || [ "$(printf '%s' "${out}" | jq -r '.reason')" != "revise" ]; then
        fail "revise-labeled PR must win over an older conflict" "out=${out}"
        return
    fi

    pass "team:revise outranks CONFLICTING"
}

#-------------------------------------------------------------------------------
# Test 3: within the same reason rank, the oldest PR wins.
#-------------------------------------------------------------------------------
test_oldest_wins_within_rank() {
    echo "TEST: oldest PR wins within the same reason"

    local out
    out="$(jq -s '.' \
        <(pr_json 312 "feat/issue-283" "MERGEABLE" "2026-07-09T10:00:00Z" "team:revise") \
        <(pr_json 311 "feat/issue-282" "MERGEABLE" "2026-07-05T10:00:00Z" "team:revise") \
        | pr_triage_pick)"

    if [ "$(printf '%s' "${out}" | jq -r '.pr')" != "311" ]; then
        fail "older revise PR must be picked first" "out=${out}"
        return
    fi

    pass "oldest PR wins within the same reason"
}

#-------------------------------------------------------------------------------
# Test 4: ours-filter — drafts, foreign branch names, foreign authors, and
# non-open PRs are never picked even when conflicting or revise-labeled.
#-------------------------------------------------------------------------------
test_ours_filter_excludes() {
    echo "TEST: ours-filter excludes drafts / foreign branches / foreign authors"

    local out rc
    out="$(jq -s '.' \
        <(pr_json 320 "feat/issue-290" "CONFLICTING" "2026-07-01T10:00:00Z" "" "agent-bot" "true") \
        <(pr_json 321 "hotfix/human-branch" "CONFLICTING" "2026-07-01T10:00:00Z" "team:revise") \
        <(pr_json 322 "feat/issue-291" "CONFLICTING" "2026-07-01T10:00:00Z" "" "some-human") \
        <(pr_json 323 "feat/issue-292" "CONFLICTING" "2026-07-01T10:00:00Z" "" "agent-bot" "false" "MERGED") \
        | PR_TRIAGE_AUTHOR="agent-bot" pr_triage_pick)"
    rc=$?

    if [ "${rc}" -eq 0 ] || [ "$(printf '%s' "${out}" | jq -r '.pr')" != "null" ]; then
        fail "no draft/foreign/closed PR may be picked" "rc=${rc} out=${out}"
        return
    fi

    pass "ours-filter excludes drafts / foreign branches / foreign authors"
}

#-------------------------------------------------------------------------------
# Test 5: an empty author env disables the author check (any login accepted).
#-------------------------------------------------------------------------------
test_empty_author_env_accepts_any() {
    echo "TEST: empty PR_TRIAGE_AUTHOR disables the author filter"

    local out
    out="$(jq -s '.' \
        <(pr_json 324 "feat/issue-293" "CONFLICTING" "2026-07-01T10:00:00Z" "" "whoever") \
        | PR_TRIAGE_AUTHOR="" pr_triage_pick)"

    if [ "$(printf '%s' "${out}" | jq -r '.pr')" != "324" ]; then
        fail "empty author env must accept any login" "out=${out}"
        return
    fi

    pass "empty PR_TRIAGE_AUTHOR disables the author filter"
}

#-------------------------------------------------------------------------------
# Test 6: MERGEABLE and UNKNOWN without team:revise are not attention-worthy;
# already-escalated PRs (revise-failed / rebase-failed) are parked for a human.
#-------------------------------------------------------------------------------
test_no_attention_no_pick() {
    echo "TEST: mergeable/unknown/escalated PRs are not picked"

    local out rc
    out="$(jq -s '.' \
        <(pr_json 330 "feat/issue-294" "MERGEABLE" "2026-07-01T10:00:00Z" "") \
        <(pr_json 331 "feat/issue-295" "UNKNOWN"   "2026-07-01T10:00:00Z" "") \
        <(pr_json 332 "feat/issue-296" "CONFLICTING" "2026-07-01T10:00:00Z" "team:rebase-failed") \
        <(pr_json 333 "feat/issue-297" "MERGEABLE" "2026-07-01T10:00:00Z" "team:revise,team:revise-failed") \
        | pr_triage_pick)"
    rc=$?

    if [ "${rc}" -eq 0 ] || [ "$(printf '%s' "${out}" | jq -r '.pr')" != "null" ]; then
        fail "nothing here needs (auto-)attention" "rc=${rc} out=${out}"
        return
    fi

    pass "mergeable/unknown/escalated PRs are not picked"
}

#-------------------------------------------------------------------------------
# Test 7: empty list and malformed input both no-pick (exit 1) without crashing —
# the reconcile phase falls through to resume/pick.
#-------------------------------------------------------------------------------
test_empty_and_malformed_no_pick() {
    echo "TEST: empty list and malformed input degrade to no-pick"

    local out rc
    out="$(printf '[]' | pr_triage_pick)"
    rc=$?
    if [ "${rc}" -eq 0 ] || [ "$(printf '%s' "${out}" | jq -r '.pr')" != "null" ]; then
        fail "empty list must no-pick" "rc=${rc} out=${out}"
        return
    fi

    out="$(printf 'not json' | pr_triage_pick)"
    rc=$?
    if [ "${rc}" -eq 0 ] || [ "$(printf '%s' "${out}" | jq -r '.pr' 2>/dev/null)" != "null" ]; then
        fail "malformed input must no-pick, not crash" "rc=${rc} out=${out}"
        return
    fi

    pass "empty list and malformed input degrade to no-pick"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "pr-triage.sh tests"
echo "=========================================="

test_conflicting_pr_picked
test_revise_beats_conflict
test_oldest_wins_within_rank
test_ours_filter_excludes
test_empty_author_env_accepts_any
test_no_attention_no_pick
test_empty_and_malformed_no_pick

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
