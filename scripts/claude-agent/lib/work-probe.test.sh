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
    *"--label team:in-progress"*) cat "${dir}/locked.out" ;;
    *"--label team:paused"*)     cat "${dir}/paused.out" ;;
    *"issue list --label team "*) cat "${dir}/picks.out" ;;
    *"pr list"*)                 cat "${dir}/prs.out" ;;
    *)                           exit 1 ;;
esac
EOF
    chmod +x "${dir}/gh-stub"
    echo "agent-bot" > "${dir}/login.out"
    echo "0"         > "${dir}/locked.out"
    echo "null"      > "${dir}/paused.out"
    echo ""          > "${dir}/picks.out"
    echo "[]"        > "${dir}/prs.out"
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
    echo "290" > "${dir}/picks.out"

    local scan
    scan="$(GH_BIN="${dir}/gh-stub" wp_scan)"

    local want='{"locked":false,"reconcile":305,"paused":null,"pickSig":"290"}'
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
# sleeping (team-pickup already declined them); a changed signature wakes.
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
