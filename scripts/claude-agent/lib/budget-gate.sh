#!/usr/bin/env bash
# budget-gate.sh — the Budget Gate: the single fire-vs-wait decision.
#
# Sourceable library exposing one pure function, `budget_gate`. It consumes a
# `ccusage blocks --json` payload on stdin and emits, on stdout, a compact JSON
# verdict:
#
#     { "remainPct": <0..100>, "resetAt": "<iso8601|>", "shouldFire": <bool> }
#
# `remainPct` is the percent of the *active* usage window still remaining, taken
# straight from ccusage's own window bounds (`startTime`/`endTime`) — there are
# no hard-coded wall-clock constants, so the gate is plan-agnostic: a bigger plan
# reports different underlying numbers and the same threshold trips accordingly,
# with no code change. `resetAt` is the active window's `endTime` (when the
# window rolls over). `shouldFire` is true whenever enough of the window remains
# to be worth starting a run (>= BUDGET_GATE_MIN_PCT, default 25) — mid-run
# exhaustion is safe because agent-run pauses rather than fails, so the gate
# only needs to filter out windows too spent to get meaningful work done.
#
# The function is pure: it reads only its stdin and env, never the network or the
# clock beyond an injectable "now" (BUDGET_GATE_NOW epoch — used by tests).
#
# Exit codes:
#   0 — a verdict was computed from a live active window.
#   3 — degraded: input was missing/malformed or had no active window. A
#       best-effort non-firing verdict is still printed so callers never crash;
#       the daemon uses this exit to fall back to its own reset estimate.

# Percent remaining at/above which a fire is worth starting. Honors the legacy
# BUDGET_FRESH_PCT env if a host still sets it.
: "${BUDGET_GATE_MIN_PCT:=${BUDGET_FRESH_PCT:-25}}"

# budget_gate: read ccusage JSON on stdin, print the verdict JSON on stdout.
budget_gate() {
    local now payload active start_iso end_iso start_epoch end_epoch
    local window_secs remain_secs remain_pct should_fire

    now="${BUDGET_GATE_NOW:-$(date -u +%s)}"

    payload="$(cat)"

    # Locate the single active, non-gap block. jq exits non-zero on invalid JSON.
    active="$(printf '%s' "${payload}" \
        | jq -c 'first(.blocks[]? | select(.isActive == true and (.isGap // false) == false))' 2>/dev/null)"

    if [ -z "${active}" ] || [ "${active}" = "null" ]; then
        # Degraded: unparseable payload or no active window — never fire.
        printf '{"remainPct":0,"resetAt":"","shouldFire":false}\n'
        return 3
    fi

    start_iso="$(printf '%s' "${active}" | jq -r '.startTime // empty')"
    end_iso="$(printf '%s' "${active}" | jq -r '.endTime // empty')"

    if [ -z "${start_iso}" ] || [ -z "${end_iso}" ]; then
        printf '{"remainPct":0,"resetAt":"","shouldFire":false}\n'
        return 3
    fi

    start_epoch="$(date -u -d "${start_iso}" +%s 2>/dev/null)" || start_epoch=""
    end_epoch="$(date -u -d "${end_iso}" +%s 2>/dev/null)" || end_epoch=""

    if [ -z "${start_epoch}" ] || [ -z "${end_epoch}" ] || [ "${end_epoch}" -le "${start_epoch}" ]; then
        printf '{"remainPct":0,"resetAt":"","shouldFire":false}\n'
        return 3
    fi

    window_secs=$((end_epoch - start_epoch))
    remain_secs=$((end_epoch - now))
    if [ "${remain_secs}" -lt 0 ]; then
        remain_secs=0
    elif [ "${remain_secs}" -gt "${window_secs}" ]; then
        remain_secs="${window_secs}"
    fi

    # Percent remaining, rounded to two decimals via awk (bash has no floats).
    remain_pct="$(awk "BEGIN{printf \"%.2f\", ${remain_secs} / ${window_secs} * 100}")"

    if awk "BEGIN{exit !(${remain_pct} >= ${BUDGET_GATE_MIN_PCT})}"; then
        should_fire="true"
    else
        should_fire="false"
    fi

    printf '{"remainPct":%s,"resetAt":"%s","shouldFire":%s}\n' \
        "${remain_pct}" "${end_iso}" "${should_fire}"
}
