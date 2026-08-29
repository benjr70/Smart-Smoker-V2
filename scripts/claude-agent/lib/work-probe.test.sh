#!/usr/bin/env bash
# Tests for scripts/claude-agent/lib/work-probe.sh
#
# Run: bash scripts/claude-agent/lib/work-probe.test.sh
#
# Strategy: wp_scan's gh calls go through an injected GH_BIN stub that serves
# canned per-query fixtures from FIXTURE_DIR (the stub emulates gh's own --jq
# post-processing, so fixtures hold post-jq output for the issue queries and a
# raw JSON array for `pr list`). wp_decide is pure — driven with literal scan
# JSON on stdin.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=work-probe.sh
. "${SCRIPT_DIR}/work-probe.sh"

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

# Build a workspace with the gh stub + default "nothing happening" fixtures.
# Echoes the dir. Individual tests overwrite fixtures as needed.
make_env() {
    local dir; dir="$(mktemp -d)"
    cat > "${dir}/gh-stub" <<EOF
#!/usr/bin/env bash
args="\$*"
case "\${args}" in
    *"api user"*)                cat "${dir}/login.out" ;;
    *"--label AFK:in-progress"*) cat "${dir}/locked.out" ;;
    *"--label AFK:paused"*)     cat "${dir}/paused.out" ;;
    *"--label wayfinder:map"*)   cat "${dir}/maps.out" ;;
    *"issue list --label AFK "*) cat "${dir}/picks.out" ;;
    *"pr list"*)                 cat "${dir}/prs.out" ;;
    *"pr view"*)                 cat "${dir}/prview.out" ;;
    *)                           exit 1 ;;
esac
EOF
    chmod +x "${dir}/gh-stub"
    echo "agent-bot" > "${dir}/login.out"
    echo "0"         > "${dir}/locked.out"
    echo "null"      > "${dir}/paused.out"
    echo "[]"        > "${dir}/picks.out"   # raw `issue list --json number,labels`
    echo "0"         > "${dir}/maps.out"
    echo "[]"        > "${dir}/prs.out"
    # Default: bot-complete comments (both markers) so pre-incomplete tests
    # keep their "nothing happening" baseline.
    cat > "${dir}/prview.out" <<'PVEOF'
{"comments":[{"body":"<!-- pr-review-done reviewed=abc fixes=abc -->"},
             {"body":"### Manual verification — round 1/3"}]}
PVEOF
    printf '%s' "${dir}"
}

#-------------------------------------------------------------------------------
# Test 1: full scan — a CONFLICTING agent PR, no lock, one pick candidate →
# every field lands in the scan JSON (and the triage ours-filter is wired to
# the scanned login).
#-------------------------------------------------------------------------------
test_scan_full_shape() {
    echo "TEST: wp_scan emits the full scan shape"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    cat > "${dir}/prs.out" <<'EOF'
[{"number":305,"headRefName":"feat/issue-281","isDraft":false,
  "mergeable":"CONFLICTING","labels":[],"createdAt":"2026-07-09T00:00:00Z",
  "author":{"login":"agent-bot"}}]
EOF
    echo '[{"number":290,"labels":[{"name":"AFK"}]}]' > "${dir}/picks.out"

    local scan
    scan="$(GH_BIN="${dir}/gh-stub" wp_scan)"

    local want='{"locked":false,"reconcile":305,"paused":null,"pickSig":"290","prSig":"305","slices":1,"wayfinder":0,"openMaps":0}'
    if [ "${scan}" != "${want}" ]; then
        fail "scan shape mismatch" "got:  ${scan}
want: ${want}"
        return
    fi

    pass "wp_scan emits the full scan shape"
}

#-------------------------------------------------------------------------------
# Test 2: the ours-filter is live — the same CONFLICTING PR from a foreign
# author must NOT produce a reconcile candidate.
#-------------------------------------------------------------------------------
test_scan_foreign_author_skipped() {
    echo "TEST: wp_scan skips a foreign author's PR"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    cat > "${dir}/prs.out" <<'EOF'
[{"number":305,"headRefName":"feat/issue-281","isDraft":false,
  "mergeable":"CONFLICTING","labels":[],"createdAt":"2026-07-09T00:00:00Z",
  "author":{"login":"somebody-else"}}]
EOF

    local reconcile
    reconcile="$(GH_BIN="${dir}/gh-stub" wp_scan | jq -r '.reconcile')"

    if [ "${reconcile}" != "null" ]; then
        fail "foreign-author PR must not be a reconcile candidate" "reconcile=${reconcile}"
        return
    fi

    pass "wp_scan skips a foreign author's PR"
}

#-------------------------------------------------------------------------------
# Test 3: the lock read fails SAFE — gh erroring on the lock query must read
# as locked=true (a flake must never enable a wake-fire-skip loop).
#-------------------------------------------------------------------------------
test_scan_lock_error_reads_locked() {
    echo "TEST: wp_scan lock-query error fails safe as locked"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    rm "${dir}/locked.out"   # stub's cat fails → gh exits non-zero for this query

    local locked
    locked="$(GH_BIN="${dir}/gh-stub" wp_scan | jq -r '.locked')"

    if [ "${locked}" != "true" ]; then
        fail "lock-query error must scan as locked=true" "locked=${locked}"
        return
    fi

    pass "wp_scan lock-query error fails safe as locked"
}

#-------------------------------------------------------------------------------
# Test 4: wp_decide wakes on a reconcile candidate (and names it).
#-------------------------------------------------------------------------------
test_decide_reconcile_wakes() {
    echo "TEST: wp_decide wakes on reconcile"

    local reason
    if ! reason="$(printf '%s' \
        '{"locked":false,"reconcile":305,"paused":null,"pickSig":""}' \
        | wp_decide "")"; then
        fail "reconcile candidate must wake" ""
        return
    fi
    if [ "${reason}" != "reconcile PR #305" ]; then
        fail "wake reason must name the PR" "reason=${reason}"
        return
    fi

    pass "wp_decide wakes on reconcile"
}

#-------------------------------------------------------------------------------
# Test 5: a held lock suppresses every wake signal — even a reconcile
# candidate (the fire would just skip).
#-------------------------------------------------------------------------------
test_decide_locked_never_wakes() {
    echo "TEST: wp_decide never wakes while locked"

    if printf '%s' \
        '{"locked":true,"reconcile":305,"paused":281,"pickSig":"290"}' \
        | wp_decide "" >/dev/null; then
        fail "locked scan must not wake" ""
        return
    fi

    pass "wp_decide never wakes while locked"
}

#-------------------------------------------------------------------------------
# Test 6: wp_decide wakes on a paused issue (resume work).
#-------------------------------------------------------------------------------
test_decide_paused_wakes() {
    echo "TEST: wp_decide wakes on a paused issue"

    local reason
    if ! reason="$(printf '%s' \
        '{"locked":false,"reconcile":null,"paused":281,"pickSig":""}' \
        | wp_decide "")"; then
        fail "paused issue must wake" ""
        return
    fi
    if [ "${reason}" != "resume issue #281" ]; then
        fail "wake reason must name the issue" "reason=${reason}"
        return
    fi

    pass "wp_decide wakes on a paused issue"
}

#-------------------------------------------------------------------------------
# Test 7: pick-class suppression — candidates equal to the baseline keep
# sleeping (afk-pickup already declined them); a changed signature wakes.
#-------------------------------------------------------------------------------
test_decide_pick_baseline_suppression() {
    echo "TEST: wp_decide pick baseline suppression"

    local scan='{"locked":false,"reconcile":null,"paused":null,"pickSig":"290,291"}'

    if printf '%s' "${scan}" | wp_decide "290,291" >/dev/null; then
        fail "unchanged pick signature must not wake" ""
        return
    fi

    local reason
    if ! reason="$(printf '%s' "${scan}" | wp_decide "290")"; then
        fail "changed pick signature must wake" ""
        return
    fi
    if [ "${reason}" != "new pick candidate(s) #290,291" ]; then
        fail "wake reason must carry the candidates" "reason=${reason}"
        return
    fi

    pass "wp_decide pick baseline suppression"
}

#-------------------------------------------------------------------------------
# Test 8: malformed / empty scan input keeps sleeping, never crashes.
#-------------------------------------------------------------------------------
test_decide_malformed_keeps_sleeping() {
    echo "TEST: wp_decide malformed scan keeps sleeping"

    if printf '%s' 'not json at all' | wp_decide "" >/dev/null 2>&1; then
        fail "malformed scan must not wake" ""
        return
    fi
    if printf '%s' '' | wp_decide "" >/dev/null 2>&1; then
        fail "empty scan must not wake" ""
        return
    fi

    pass "wp_decide malformed scan keeps sleeping"
}

#-------------------------------------------------------------------------------
# Test 9: wp_scan derives the open-PR signature from the PR list it already
# fetches — a sorted CSV of open PR numbers, no extra gh call (the same
# `pr list` query that feeds reconcile triage). (behavior 6)
#-------------------------------------------------------------------------------
test_scan_emits_pr_sig() {
    echo "TEST: wp_scan emits the open-PR signature"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    cat > "${dir}/prs.out" <<'EOF'
[{"number":367,"headRefName":"feat/a","isDraft":false,"mergeable":"MERGEABLE",
  "labels":[],"createdAt":"2026-07-15T00:00:00Z","author":{"login":"agent-bot"}},
 {"number":354,"headRefName":"feat/b","isDraft":false,"mergeable":"MERGEABLE",
  "labels":[],"createdAt":"2026-07-15T00:00:00Z","author":{"login":"agent-bot"}}]
EOF

    local pr_sig
    pr_sig="$(GH_BIN="${dir}/gh-stub" wp_scan | jq -r '.prSig')"

    if [ "${pr_sig}" != "354,367" ]; then
        fail "prSig must be the sorted CSV of open PR numbers" "prSig=${pr_sig}"
        return
    fi

    pass "wp_scan emits the open-PR signature"
}

#-------------------------------------------------------------------------------
# Test 10: an empty open-PR set is a READABLE empty signature (""), distinct
# from an unreadable set — the reconcile fetch succeeded and returned []. Must
# not read as null. (behavior 6)
#-------------------------------------------------------------------------------
test_scan_empty_pr_set_is_empty_sig() {
    echo "TEST: wp_scan empty PR set is a readable empty signature"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    # default prs.out is "[]"

    local pr_sig_raw
    pr_sig_raw="$(GH_BIN="${dir}/gh-stub" wp_scan | jq -r '.prSig')"

    if [ "${pr_sig_raw}" != "" ]; then
        fail "an empty PR set must be an empty-string prSig, not null" "prSig=${pr_sig_raw}"
        return
    fi
    # explicitly: the field is present and an empty string, not JSON null
    local is_null
    is_null="$(GH_BIN="${dir}/gh-stub" wp_scan | jq -r '.prSig == null')"
    if [ "${is_null}" != "false" ]; then
        fail "empty PR set prSig must be \"\", not JSON null" "prSig==null? ${is_null}"
        return
    fi

    pass "wp_scan empty PR set is a readable empty signature"
}

#-------------------------------------------------------------------------------
# Test 11: `gh pr list` failure fails SAFE — prSig scans as JSON null (the set
# is UNKNOWN, not empty), so wp_decide cannot mistake a fetch flake for a
# whole-set shrink and wake-loop. (behavior 5, CRITICAL)
#-------------------------------------------------------------------------------
test_scan_pr_list_error_null_sig() {
    echo "TEST: wp_scan pr-list error scans prSig as null"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    rm "${dir}/prs.out"   # stub's cat fails → gh exits non-zero for `pr list`

    local is_null
    is_null="$(GH_BIN="${dir}/gh-stub" wp_scan | jq -r '.prSig == null')"

    if [ "${is_null}" != "true" ]; then
        fail "pr-list error must scan prSig as JSON null" "prSig==null? ${is_null}"
        return
    fi

    pass "wp_scan pr-list error scans prSig as null"
}

#-------------------------------------------------------------------------------
# Test 12: shrink-wake — a PR present in the baseline but absent from a later
# scan wakes the daemon, naming the disappeared PR(s). This is the 2026-07-15
# scenario: baseline holds blocker PRs #354,#367; after the human merge the
# open set is empty. (behaviors 1 & 6, CRITICAL)
#-------------------------------------------------------------------------------
test_decide_pr_shrink_wakes() {
    echo "TEST: wp_decide wakes when a baseline PR leaves the open set"

    local reason
    if ! reason="$(printf '%s' \
        '{"locked":false,"reconcile":null,"paused":null,"pickSig":"","prSig":""}' \
        | wp_decide "" "354,367")"; then
        fail "a disappeared baseline PR must wake" ""
        return
    fi
    if [ "${reason}" != "PR(s) left the open set #354,367" ]; then
        fail "wake reason must name the disappeared PR(s)" "reason=${reason}"
        return
    fi

    pass "wp_decide wakes when a baseline PR leaves the open set"
}

#-------------------------------------------------------------------------------
# Test 13: partial shrink — only the PRs actually gone are named; PRs still
# open are not. Baseline {354,367}, scan {367} → wake naming only #354.
# (behavior 3, complement)
#-------------------------------------------------------------------------------
test_decide_pr_partial_shrink_names_gone() {
    echo "TEST: wp_decide names only the PRs that left"

    local reason
    reason="$(printf '%s' \
        '{"locked":false,"reconcile":null,"paused":null,"pickSig":"","prSig":"367"}' \
        | wp_decide "" "354,367")"

    if [ "${reason}" != "PR(s) left the open set #354" ]; then
        fail "only the disappeared PR must be named" "reason=${reason}"
        return
    fi

    pass "wp_decide names only the PRs that left"
}

#-------------------------------------------------------------------------------
# Test 14: set growth alone does NOT wake — a new PR appears mid-sleep but none
# from the baseline disappeared. New PRs are covered by the reconcile signal
# when actionable, so the shrink rule must ignore growth. (behavior 3)
#-------------------------------------------------------------------------------
test_decide_pr_growth_no_wake() {
    echo "TEST: wp_decide does not wake on PR-set growth"

    if printf '%s' \
        '{"locked":false,"reconcile":null,"paused":null,"pickSig":"","prSig":"354,367,401"}' \
        | wp_decide "" "354,367" >/dev/null; then
        fail "a grown PR set must not wake by itself" ""
        return
    fi

    pass "wp_decide does not wake on PR-set growth"
}

#-------------------------------------------------------------------------------
# Test 15: an unchanged PR set keeps sleeping. (behavior 4, CRITICAL)
#-------------------------------------------------------------------------------
test_decide_pr_unchanged_no_wake() {
    echo "TEST: wp_decide keeps sleeping on an unchanged PR set"

    if printf '%s' \
        '{"locked":false,"reconcile":null,"paused":null,"pickSig":"","prSig":"354,367"}' \
        | wp_decide "" "354,367" >/dev/null; then
        fail "an unchanged PR set must not wake" ""
        return
    fi

    pass "wp_decide keeps sleeping on an unchanged PR set"
}

#-------------------------------------------------------------------------------
# Test 16: a null (unreadable) current PR signature keeps sleeping even against
# a non-empty baseline — a `gh pr list` flake mid-sleep must never look like a
# whole-set shrink. (behavior 5, CRITICAL)
#-------------------------------------------------------------------------------
test_decide_pr_unreadable_no_wake() {
    echo "TEST: wp_decide keeps sleeping when the PR set is unreadable"

    if printf '%s' \
        '{"locked":false,"reconcile":null,"paused":null,"pickSig":"","prSig":null}' \
        | wp_decide "" "354,367" >/dev/null; then
        fail "an unreadable PR set must not wake against a non-empty baseline" ""
        return
    fi

    pass "wp_decide keeps sleeping when the PR set is unreadable"
}

#-------------------------------------------------------------------------------
# Test 17: an empty PR baseline disables shrink-wake — the sleep began with no
# open PRs (or an unreadable set snapshotted as ""), so nothing can "leave".
# (fail-safe)
#-------------------------------------------------------------------------------
test_decide_pr_empty_baseline_no_wake() {
    echo "TEST: wp_decide with an empty PR baseline never shrink-wakes"

    if printf '%s' \
        '{"locked":false,"reconcile":null,"paused":null,"pickSig":"","prSig":""}' \
        | wp_decide "" "" >/dev/null; then
        fail "an empty PR baseline must not shrink-wake" ""
        return
    fi

    pass "wp_decide with an empty PR baseline never shrink-wakes"
}

#-------------------------------------------------------------------------------
# Test 18: a held lock suppresses shrink-wake too — every fire would just skip.
# (fail-safe, priority order)
#-------------------------------------------------------------------------------
test_decide_locked_suppresses_shrink() {
    echo "TEST: wp_decide never shrink-wakes while locked"

    if printf '%s' \
        '{"locked":true,"reconcile":null,"paused":null,"pickSig":"","prSig":""}' \
        | wp_decide "" "354,367" >/dev/null; then
        fail "locked scan must not shrink-wake" ""
        return
    fi

    pass "wp_decide never shrink-wakes while locked"
}


#-------------------------------------------------------------------------------
# Test 19: a clean agent PR whose bot tail never finished (no review marker, no
# verification round) scans as a reconcile candidate — the daemon wakes to
# finish outstanding PR work instead of sleeping past it.
#-------------------------------------------------------------------------------
test_scan_incomplete_pr_sets_reconcile() {
    echo "TEST: wp_scan flags a bot-incomplete PR for reconcile"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    cat > "${dir}/prs.out" <<'EOF'
[{"number":305,"headRefName":"feat/issue-281","isDraft":false,
  "mergeable":"MERGEABLE","labels":[],"createdAt":"2026-07-09T00:00:00Z",
  "author":{"login":"agent-bot"}}]
EOF
    printf '%s\n' '{"comments":[]}' > "${dir}/prview.out"

    local scan reconcile reason
    scan="$(GH_BIN="${dir}/gh-stub" wp_scan)"
    reconcile="$(printf '%s' "${scan}" | jq -r '.reconcile')"

    if [ "${reconcile}" != "305" ]; then
        fail "bot-incomplete PR must be the reconcile candidate" "scan=${scan}"
        return
    fi
    if ! reason="$(printf '%s' "${scan}" | wp_decide "")" \
        || [ "${reason}" != "reconcile PR #305" ]; then
        fail "wp_decide must wake naming the incomplete PR" "reason=${reason:-}"
        return
    fi

    pass "wp_scan flags a bot-incomplete PR for reconcile"
}

#-------------------------------------------------------------------------------
# Test 20: the same clean PR with both markers present (bot-complete, awaiting
# only a human merge) is NOT a reconcile candidate — the daemon keeps sleeping
# and work-ahead stays possible.
#-------------------------------------------------------------------------------
test_scan_bot_complete_pr_no_reconcile() {
    echo "TEST: wp_scan ignores a bot-complete PR"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    cat > "${dir}/prs.out" <<'EOF'
[{"number":305,"headRefName":"feat/issue-281","isDraft":false,
  "mergeable":"MERGEABLE","labels":[],"createdAt":"2026-07-09T00:00:00Z",
  "author":{"login":"agent-bot"}}]
EOF
    # default prview.out carries both markers

    local reconcile
    reconcile="$(GH_BIN="${dir}/gh-stub" wp_scan | jq -r '.reconcile')"

    if [ "${reconcile}" != "null" ]; then
        fail "bot-complete PR must not be a reconcile candidate" "reconcile=${reconcile}"
        return
    fi

    pass "wp_scan ignores a bot-complete PR"
}

#-------------------------------------------------------------------------------
# Test 21: the eligible queue is split by ticket kind — a `wayfinder:*` ticket
# is planning work routed to /afk-resolve, an unlabelled one is an
# implementation slice. Ineligible tickets (a state label) count for neither.
#-------------------------------------------------------------------------------
test_scan_splits_slices_and_wayfinder() {
    echo "TEST: wp_scan splits the eligible queue into slices and wayfinder"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    cat > "${dir}/picks.out" <<'EOF'
[{"number":589,"labels":[{"name":"AFK"}]},
 {"number":590,"labels":[{"name":"AFK"},{"name":"wayfinder:research"}]},
 {"number":591,"labels":[{"name":"AFK"},{"name":"wayfinder:task"}]},
 {"number":592,"labels":[{"name":"AFK"},{"name":"AFK:done"}]}]
EOF

    local scan
    scan="$(GH_BIN="${dir}/gh-stub" wp_scan)"

    local got want
    got="$(printf '%s' "${scan}" | jq -c '{pickSig, slices, wayfinder}')"
    want='{"pickSig":"589,590,591","slices":1,"wayfinder":2}'
    if [ "${got}" != "${want}" ]; then
        fail "queue split mismatch" "got:  ${got}
want: ${want}"
        return
    fi

    pass "wp_scan splits the eligible queue into slices and wayfinder"
}

#-------------------------------------------------------------------------------
# Test 22: open maps are counted for the dashboard's Wayfinder tile.
#-------------------------------------------------------------------------------
test_scan_counts_open_maps() {
    echo "TEST: wp_scan counts open wayfinder:map issues"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    echo "2" > "${dir}/maps.out"

    local got
    got="$(GH_BIN="${dir}/gh-stub" wp_scan | jq -r '.openMaps')"
    if [ "${got}" != "2" ]; then
        fail "openMaps must count open maps" "got=${got}"
        return
    fi

    pass "wp_scan counts open wayfinder:map issues"
}

#-------------------------------------------------------------------------------
# Test 23: the queue and map queries fail SAFE — a gh error must scan as an
# empty queue with zero counts, never crash the probe or emit invalid JSON.
#-------------------------------------------------------------------------------
test_scan_queue_error_reads_empty() {
    echo "TEST: wp_scan queue/map query errors fail safe as empty"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    rm "${dir}/picks.out" "${dir}/maps.out"   # stub's cat fails → gh non-zero

    local got want
    got="$(GH_BIN="${dir}/gh-stub" wp_scan | jq -c '{pickSig, slices, wayfinder, openMaps}')"
    want='{"pickSig":"","slices":0,"wayfinder":0,"openMaps":0}'
    if [ "${got}" != "${want}" ]; then
        fail "queue/map errors must scan as empty" "got:  ${got}
want: ${want}"
        return
    fi

    pass "wp_scan queue/map query errors fail safe as empty"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "work-probe tests"
echo "=========================================="

test_scan_full_shape
test_scan_foreign_author_skipped
test_scan_lock_error_reads_locked
test_decide_reconcile_wakes
test_decide_locked_never_wakes
test_decide_paused_wakes
test_decide_pick_baseline_suppression
test_decide_malformed_keeps_sleeping
test_scan_emits_pr_sig
test_scan_empty_pr_set_is_empty_sig
test_scan_pr_list_error_null_sig
test_decide_pr_shrink_wakes
test_decide_pr_partial_shrink_names_gone
test_decide_pr_growth_no_wake
test_decide_pr_unchanged_no_wake
test_decide_pr_unreadable_no_wake
test_decide_pr_empty_baseline_no_wake
test_decide_locked_suppresses_shrink
test_scan_incomplete_pr_sets_reconcile
test_scan_bot_complete_pr_no_reconcile
test_scan_splits_slices_and_wayfinder
test_scan_counts_open_maps
test_scan_queue_error_reads_empty

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
