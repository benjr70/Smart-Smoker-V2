#!/usr/bin/env bash
# Tests for scripts/claude-agent/agent-daemon
#
# Run: bash scripts/claude-agent/agent-daemon.test.sh
#
# Strategy: agent-daemon is the thin loop wiring Budget Gate -> agent-run ->
# Sleep Planner. We drive it with stubs injected via env so nothing real runs:
#   CCUSAGE_CMD   — prints a ccusage-shaped fixture (fresh / spent / broken)
#   AGENT_RUN_CMD — logs "fired" instead of invoking claude
#   SLEEP_CMD     — logs the requested sleep and returns immediately (no waiting)
# BUDGET_GATE_NOW pins "now" so the fixture windows are deterministic, and
# AGENT_DAEMON_MAX_ITERS caps the otherwise-infinite loop at one pass.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAEMON="${SCRIPT_DIR}/agent-daemon"

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

if [ ! -f "${DAEMON}" ]; then
    echo "FATAL: ${DAEMON} not found"
    exit 2
fi

NOW_EPOCH=$(date -u -d '2026-07-05T20:00:00Z' +%s)
iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%S.000Z; }

# Existing tests drive the ccusage fallback path; disable the primary OAuth
# usage sensor for the whole suite (tests that exercise it override this).
export USAGE_FETCH_CMD="false"

# Build a fixture whose active window is [start, start+5h].
fixture() {
    local start="$1" end=$(( $1 + 18000 ))
    printf '{"blocks":[{"id":"active","isActive":true,"isGap":false,"startTime":"%s","endTime":"%s"}]}\n' \
        "$(iso "${start}")" "$(iso "${end}")"
}

# Create a temp workspace with a fixture file and logging stubs. Echoes the dir.
make_env() {
    local dir; dir="$(mktemp -d)"
    : > "${dir}/calls.log"
    cat > "${dir}/agent-run-stub" <<EOF
#!/usr/bin/env bash
echo "fired \$*" >> "${dir}/calls.log"
exit 0
EOF
    cat > "${dir}/sleep-stub" <<EOF
#!/usr/bin/env bash
echo "slept \$*" >> "${dir}/calls.log"
exit 0
EOF
    chmod +x "${dir}/agent-run-stub" "${dir}/sleep-stub"
    printf '%s' "${dir}"
}

#-------------------------------------------------------------------------------
# Test 1: fresh budget → the daemon fires agent-run, then sleeps (AC 1).
#-------------------------------------------------------------------------------
test_fresh_budget_fires() {
    echo "TEST: fresh budget fires agent-run"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    fixture $((NOW_EPOCH - 60)) > "${dir}/ccusage.json"      # window just started

    BUDGET_GATE_NOW="${NOW_EPOCH}" AGENT_DAEMON_MAX_ITERS=1 \
        CCUSAGE_CMD="cat '${dir}/ccusage.json'" \
        AGENT_RUN_CMD="${dir}/agent-run-stub" \
        SLEEP_CMD="${dir}/sleep-stub" \
        bash "${DAEMON}" >/dev/null 2>&1

    if ! grep -q '^fired' "${dir}/calls.log"; then
        fail "fresh budget must fire agent-run" "calls:
$(cat "${dir}/calls.log")"
        return
    fi

    pass "fresh budget fires agent-run"
}

#-------------------------------------------------------------------------------
# Test 2: spent budget → the daemon sleeps and does NOT fire agent-run (AC 2).
#-------------------------------------------------------------------------------
test_spent_budget_sleeps() {
    echo "TEST: spent budget sleeps without firing"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    fixture $((NOW_EPOCH - 17000)) > "${dir}/ccusage.json"   # ~4.7h into window

    BUDGET_GATE_NOW="${NOW_EPOCH}" AGENT_DAEMON_MAX_ITERS=1 \
        CCUSAGE_CMD="cat '${dir}/ccusage.json'" \
        AGENT_RUN_CMD="${dir}/agent-run-stub" \
        SLEEP_CMD="${dir}/sleep-stub" \
        bash "${DAEMON}" >/dev/null 2>&1

    if grep -q '^fired' "${dir}/calls.log"; then
        fail "spent budget must NOT fire agent-run" "calls:
$(cat "${dir}/calls.log")"
        return
    fi
    if ! grep -q '^slept' "${dir}/calls.log"; then
        fail "spent budget must sleep until reset" "calls:
$(cat "${dir}/calls.log")"
        return
    fi

    pass "spent budget sleeps without firing"
}

#-------------------------------------------------------------------------------
# Test 3: ccusage unavailable → the daemon stays alive (degraded), sleeps, and
#         does not fire or crash (AC 4).
#-------------------------------------------------------------------------------
test_ccusage_unavailable_stays_alive() {
    echo "TEST: ccusage unavailable degrades without crashing"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN

    BUDGET_GATE_NOW="${NOW_EPOCH}" AGENT_DAEMON_MAX_ITERS=1 \
        CCUSAGE_CMD="false" \
        AGENT_RUN_CMD="${dir}/agent-run-stub" \
        SLEEP_CMD="${dir}/sleep-stub" \
        CLAUDE_JSONL_DIR="${dir}/nonexistent" \
        bash "${DAEMON}" >/dev/null 2>&1
    local rc=$?

    if [ "${rc}" -ne 0 ]; then
        fail "daemon must exit cleanly after a degraded pass" "rc=${rc}"
        return
    fi
    if grep -q '^fired' "${dir}/calls.log"; then
        fail "degraded pass must NOT fire agent-run" "calls:
$(cat "${dir}/calls.log")"
        return
    fi
    if ! grep -q '^slept' "${dir}/calls.log"; then
        fail "degraded pass must still sleep (stay alive)" "calls:
$(cat "${dir}/calls.log")"
        return
    fi

    pass "ccusage unavailable degrades without crashing"
}

#-------------------------------------------------------------------------------
# Test 4: a clean run with budget still above the gate → the daemon fires again
# immediately (no sleep between fires) — the fresh-window-only pacing is gone.
#-------------------------------------------------------------------------------
test_clean_run_refires_same_window() {
    echo "TEST: clean run re-fires within the same window"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    fixture $((NOW_EPOCH - 60)) > "${dir}/ccusage.json"      # plenty of window left

    BUDGET_GATE_NOW="${NOW_EPOCH}" AGENT_DAEMON_MAX_ITERS=2 \
        CCUSAGE_CMD="cat '${dir}/ccusage.json'" \
        AGENT_RUN_CMD="${dir}/agent-run-stub" \
        SLEEP_CMD="${dir}/sleep-stub" \
        bash "${DAEMON}" >/dev/null 2>&1

    local fired slept
    fired="$(grep -c '^fired' "${dir}/calls.log")"
    slept="$(grep -c '^slept' "${dir}/calls.log")"

    if [ "${fired}" != "2" ]; then
        fail "two passes with budget must fire twice" "calls:
$(cat "${dir}/calls.log")"
        return
    fi
    if [ "${slept}" != "0" ]; then
        fail "a clean run with budget left must NOT sleep before re-firing" "calls:
$(cat "${dir}/calls.log")"
        return
    fi

    pass "clean run re-fires within the same window"
}

#-------------------------------------------------------------------------------
# Test 5: a fire that reports AGENT_RUN_NO_WORK=1 (empty queue) → the daemon
# sleeps out the window instead of hot-looping on empty picks. The injected
# work probe reports "nothing there" throughout, so no early wake happens.
#-------------------------------------------------------------------------------
test_no_work_sleeps_instead_of_relooping() {
    echo "TEST: empty queue sleeps instead of re-firing"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    fixture $((NOW_EPOCH - 60)) > "${dir}/ccusage.json"
    cat > "${dir}/agent-run-stub" <<EOF
#!/usr/bin/env bash
echo "fired \$*" >> "${dir}/calls.log"
echo "team-pickup: no eligible issue"
echo "AGENT_RUN_NO_WORK=1"
exit 0
EOF
    chmod +x "${dir}/agent-run-stub"

    BUDGET_GATE_NOW="${NOW_EPOCH}" AGENT_DAEMON_MAX_ITERS=1 \
        CCUSAGE_CMD="cat '${dir}/ccusage.json'" \
        AGENT_RUN_CMD="${dir}/agent-run-stub" \
        SLEEP_CMD="${dir}/sleep-stub" \
        WORK_PROBE_CMD="echo '{\"locked\":false,\"reconcile\":null,\"paused\":null,\"pickSig\":\"\"}'" \
        bash "${DAEMON}" >/dev/null 2>&1

    if [ "$(grep -c '^fired' "${dir}/calls.log")" != "1" ]; then
        fail "empty queue must fire exactly once" "calls:
$(cat "${dir}/calls.log")"
        return
    fi
    if ! grep -q '^slept' "${dir}/calls.log"; then
        fail "empty queue must sleep until the window reset" "calls:
$(cat "${dir}/calls.log")"
        return
    fi

    pass "empty queue sleeps instead of re-firing"
}

#-------------------------------------------------------------------------------
# Test 5b: work appears mid-sleep after a NO_WORK fire (the live 2026-07-10
# race: a human merge conflicted an open PR 52s after a no-work fire) → the
# work probe wakes the daemon early and the next pass fires again.
#-------------------------------------------------------------------------------
test_no_work_probe_wakes_early_on_new_work() {
    echo "TEST: work probe wakes the no-work sleep early"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    fixture $((NOW_EPOCH - 60)) > "${dir}/ccusage.json"
    cat > "${dir}/agent-run-stub" <<EOF
#!/usr/bin/env bash
echo "fired \$*" >> "${dir}/calls.log"
echo "team-pickup: no eligible issue"
echo "AGENT_RUN_NO_WORK=1"
exit 0
EOF
    chmod +x "${dir}/agent-run-stub"
    # The probe sees a reconcile candidate (a CONFLICTING agent PR).
    cat > "${dir}/probe-stub" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' '{"locked":false,"reconcile":305,"paused":null,"pickSig":""}'
EOF
    chmod +x "${dir}/probe-stub"

    BUDGET_GATE_NOW="${NOW_EPOCH}" AGENT_DAEMON_MAX_ITERS=2 \
        CCUSAGE_CMD="cat '${dir}/ccusage.json'" \
        AGENT_RUN_CMD="${dir}/agent-run-stub" \
        SLEEP_CMD="${dir}/sleep-stub" \
        WORK_PROBE_CMD="${dir}/probe-stub" \
        bash "${DAEMON}" > "${dir}/daemon.out" 2>&1

    if ! grep -q 'waking early' "${dir}/daemon.out"; then
        fail "probe hit must log an early wake" "out:
$(tail -5 "${dir}/daemon.out")"
        return
    fi
    if ! grep -q 'reconcile PR #305' "${dir}/daemon.out"; then
        fail "early wake must name the work found" "out:
$(tail -5 "${dir}/daemon.out")"
        return
    fi
    if [ "$(grep -c '^fired' "${dir}/calls.log")" != "2" ]; then
        fail "early wake must lead to a second fire" "calls:
$(cat "${dir}/calls.log")"
        return
    fi
    # Early wake = one chunk slept per no-work iter (2 iters), never the full
    # window of ~20 chunks.
    if [ "$(grep -c '^slept' "${dir}/calls.log")" != "2" ]; then
        fail "each probe hit must end its sleep after one chunk" "calls:
$(cat "${dir}/calls.log")"
        return
    fi

    pass "work probe wakes the no-work sleep early"
}

#-------------------------------------------------------------------------------
# Test 5c: pick-class suppression end-to-end — the probe keeps seeing the same
# candidate signature that was already there when the fire reported no work
# (e.g. an issue with an open blocker). The daemon must NOT wake early for it.
#-------------------------------------------------------------------------------
test_no_work_probe_suppresses_stale_candidates() {
    echo "TEST: work probe suppresses the no-work baseline"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    fixture $((NOW_EPOCH - 60)) > "${dir}/ccusage.json"
    cat > "${dir}/agent-run-stub" <<EOF
#!/usr/bin/env bash
echo "fired \$*" >> "${dir}/calls.log"
echo "team-pickup: no eligible issue"
echo "AGENT_RUN_NO_WORK=1"
exit 0
EOF
    chmod +x "${dir}/agent-run-stub"

    BUDGET_GATE_NOW="${NOW_EPOCH}" AGENT_DAEMON_MAX_ITERS=1 \
        CCUSAGE_CMD="cat '${dir}/ccusage.json'" \
        AGENT_RUN_CMD="${dir}/agent-run-stub" \
        SLEEP_CMD="${dir}/sleep-stub" \
        WORK_PROBE_CMD="echo '{\"locked\":false,\"reconcile\":null,\"paused\":null,\"pickSig\":\"290\"}'" \
        bash "${DAEMON}" > "${dir}/daemon.out" 2>&1

    if grep -q 'waking early' "${dir}/daemon.out"; then
        fail "an unchanged candidate signature must not wake the daemon" "out:
$(grep 'waking early' "${dir}/daemon.out")"
        return
    fi
    if [ "$(grep -c '^fired' "${dir}/calls.log")" != "1" ]; then
        fail "suppressed probe must not cause extra fires" "calls:
$(cat "${dir}/calls.log")"
        return
    fi

    pass "work probe suppresses the no-work baseline"
}

#-------------------------------------------------------------------------------
# Test 6: a fire cut off by usage exhaustion (AGENT_RUN_RESET_AT emitted after
# the pause) → the daemon sleeps to that reset instead of immediately re-firing
# into a spent window.
#-------------------------------------------------------------------------------
test_exhausted_run_sleeps_to_reset() {
    echo "TEST: exhausted run sleeps to the scraped reset"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    fixture $((NOW_EPOCH - 60)) > "${dir}/ccusage.json"
    local reset_iso; reset_iso="$(iso $((NOW_EPOCH + 18000)))"
    cat > "${dir}/agent-run-stub" <<EOF
#!/usr/bin/env bash
echo "fired \$*" >> "${dir}/calls.log"
echo "agent-run: EXHAUSTED — pausing in-flight work"
echo "AGENT_RUN_RESET_AT=${reset_iso}"
exit 0
EOF
    chmod +x "${dir}/agent-run-stub"

    BUDGET_GATE_NOW="${NOW_EPOCH}" AGENT_DAEMON_MAX_ITERS=1 \
        CCUSAGE_CMD="cat '${dir}/ccusage.json'" \
        AGENT_RUN_CMD="${dir}/agent-run-stub" \
        SLEEP_CMD="${dir}/sleep-stub" \
        bash "${DAEMON}" >/dev/null 2>&1

    if [ "$(grep -c '^fired' "${dir}/calls.log")" != "1" ]; then
        fail "exhausted run must fire exactly once" "calls:
$(cat "${dir}/calls.log")"
        return
    fi
    if ! grep -q '^slept' "${dir}/calls.log"; then
        fail "exhausted run must sleep to the scraped reset" "calls:
$(cat "${dir}/calls.log")"
        return
    fi

    pass "exhausted run sleeps to the scraped reset"
}

#-------------------------------------------------------------------------------
# Test 7 (REGRESSION): a fire that FAILS (exit non-zero, no exhaustion/no-work
# marker) must NOT be treated as a clean run and re-fired immediately. The live
# bug (2026-07-08) was a session-limit failure with no marker looping ~1271×.
# Across two iters the daemon must fire once, sleep, and not hot-loop.
#-------------------------------------------------------------------------------
test_failed_run_sleeps_no_rapid_loop() {
    echo "TEST: failed fire sleeps instead of hot-looping"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    fixture $((NOW_EPOCH - 60)) > "${dir}/ccusage.json"      # plenty of budget
    cat > "${dir}/agent-run-stub" <<EOF
#!/usr/bin/env bash
echo "fired \$*" >> "${dir}/calls.log"
echo "agent-run: FAILED — exit 1"
exit 1
EOF
    chmod +x "${dir}/agent-run-stub"

    BUDGET_GATE_NOW="${NOW_EPOCH}" AGENT_DAEMON_MAX_ITERS=2 \
        CCUSAGE_CMD="cat '${dir}/ccusage.json'" \
        AGENT_RUN_CMD="${dir}/agent-run-stub" \
        SLEEP_CMD="${dir}/sleep-stub" \
        bash "${DAEMON}" >/dev/null 2>&1

    local fired slept
    fired="$(grep -c '^fired' "${dir}/calls.log")"
    slept="$(grep -c '^slept' "${dir}/calls.log")"

    # Each of the 2 iters: fire once, fail, sleep. Must NOT fire twice per iter.
    if [ "${fired}" != "2" ]; then
        fail "failed fire must fire once per iter (2 iters), not hot-loop" "fired=${fired} calls:
$(cat "${dir}/calls.log")"
        return
    fi
    if [ "${slept}" -lt "2" ]; then
        fail "failed fire must sleep out the window each iter" "slept=${slept} calls:
$(cat "${dir}/calls.log")"
        return
    fi

    pass "failed fire sleeps instead of hot-looping"
}

#-------------------------------------------------------------------------------
# Test 8: an idle window (valid ccusage JSON but no active block) → the daemon
# fires from cold instead of stalling. RESET_AT is empty on this path; the fire
# must still happen and the loop must not crash.
#-------------------------------------------------------------------------------
test_idle_window_fires_from_cold() {
    echo "TEST: idle window fires from cold"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    # No active block — the shape ccusage returns on an idle box.
    printf '{"blocks":[{"id":"old","isActive":false,"isGap":false,"startTime":"%s","endTime":"%s"}]}\n' \
        "$(iso $((NOW_EPOCH - 36000)))" "$(iso $((NOW_EPOCH - 18000)))" > "${dir}/ccusage.json"

    BUDGET_GATE_NOW="${NOW_EPOCH}" AGENT_DAEMON_MAX_ITERS=1 \
        CCUSAGE_CMD="cat '${dir}/ccusage.json'" \
        AGENT_RUN_CMD="${dir}/agent-run-stub" \
        SLEEP_CMD="${dir}/sleep-stub" \
        bash "${DAEMON}" >/dev/null 2>&1
    local rc=$?

    if [ "${rc}" -ne 0 ]; then
        fail "idle-window pass must exit cleanly" "rc=${rc}"
        return
    fi
    if ! grep -q '^fired' "${dir}/calls.log"; then
        fail "idle window (fresh budget) must fire" "calls:
$(cat "${dir}/calls.log")"
        return
    fi

    pass "idle window fires from cold"
}

#-------------------------------------------------------------------------------
# Test 9: OAuth usage sensor is the primary — real utilization drives the
# decision (ccusage would say the window is nearly over; the account's 81%
# free budget must win), and its resets_at becomes RESET_AT.
#-------------------------------------------------------------------------------
test_oauth_sensor_overrides_ccusage() {
    echo "TEST: oauth sensor overrides the ccusage time-proxy"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    # ccusage fixture: window almost over (would NOT fire on the time-proxy).
    fixture $((NOW_EPOCH - 17000)) > "${dir}/ccusage.json"
    # OAuth fixture: the live 2026-07-10 shape — 19% session / 18% weekly.
    cat > "${dir}/usage.json" <<'EOF'
{ "five_hour": { "utilization": 19, "resets_at": "2026-07-05T23:00:00+00:00" },
  "seven_day": { "utilization": 18, "resets_at": "2026-07-08T00:00:00+00:00" } }
EOF

    BUDGET_GATE_NOW="${NOW_EPOCH}" AGENT_DAEMON_MAX_ITERS=1 \
        CCUSAGE_CMD="cat '${dir}/ccusage.json'" \
        USAGE_FETCH_CMD="cat '${dir}/usage.json'" \
        AGENT_RUN_CMD="${dir}/agent-run-stub" \
        SLEEP_CMD="${dir}/sleep-stub" \
        bash "${DAEMON}" > "${dir}/daemon.out" 2>&1

    if ! grep -q '^fired' "${dir}/calls.log"; then
        fail "real budget free must fire despite an old ccusage window" "out:
$(tail -3 "${dir}/daemon.out")"
        return
    fi
    if ! grep -q 'sensor=oauth' "${dir}/daemon.out"; then
        fail "decision must be attributed to the oauth sensor" "out:
$(tail -3 "${dir}/daemon.out")"
        return
    fi
    if ! grep -q 'remainPct=81.00' "${dir}/daemon.out"; then
        fail "remainPct must be real budget (81.00)" "out:
$(tail -3 "${dir}/daemon.out")"
        return
    fi

    pass "oauth sensor overrides the ccusage time-proxy"
}

#-------------------------------------------------------------------------------
# Test 10: OAuth sensor unreachable → falls back to the ccusage time-proxy
# (attributed as such) instead of degrading or crashing.
#-------------------------------------------------------------------------------
test_oauth_unreachable_falls_back_to_ccusage() {
    echo "TEST: oauth sensor unreachable falls back to ccusage"

    local dir; dir="$(make_env)"
    trap "rm -rf '${dir}'" RETURN
    fixture $((NOW_EPOCH - 60)) > "${dir}/ccusage.json"      # fresh window

    BUDGET_GATE_NOW="${NOW_EPOCH}" AGENT_DAEMON_MAX_ITERS=1 \
        CCUSAGE_CMD="cat '${dir}/ccusage.json'" \
        USAGE_FETCH_CMD="false" \
        AGENT_RUN_CMD="${dir}/agent-run-stub" \
        SLEEP_CMD="${dir}/sleep-stub" \
        bash "${DAEMON}" > "${dir}/daemon.out" 2>&1

    if ! grep -q '^fired' "${dir}/calls.log"; then
        fail "ccusage fallback with fresh window must fire" "out:
$(tail -3 "${dir}/daemon.out")"
        return
    fi
    if ! grep -q 'sensor=ccusage-fallback' "${dir}/daemon.out"; then
        fail "decision must be attributed to the fallback" "out:
$(tail -3 "${dir}/daemon.out")"
        return
    fi

    pass "oauth sensor unreachable falls back to ccusage"
}

#-------------------------------------------------------------------------------
# Run suite
#-------------------------------------------------------------------------------
echo "=========================================="
echo "agent-daemon tests"
echo "=========================================="

test_fresh_budget_fires
test_spent_budget_sleeps
test_ccusage_unavailable_stays_alive
test_clean_run_refires_same_window
test_no_work_sleeps_instead_of_relooping
test_no_work_probe_wakes_early_on_new_work
test_no_work_probe_suppresses_stale_candidates
test_exhausted_run_sleeps_to_reset
test_failed_run_sleeps_no_rapid_loop
test_idle_window_fires_from_cold
test_oauth_sensor_overrides_ccusage
test_oauth_unreachable_falls_back_to_ccusage

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
