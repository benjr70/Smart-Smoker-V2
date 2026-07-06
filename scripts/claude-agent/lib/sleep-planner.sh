#!/usr/bin/env bash
# sleep-planner.sh — the Sleep Planner: how long to sleep, and how to poll after.
#
# Sourceable library exposing one pure function, `sleep_planner`. Given the
# active window's reset instant and the current instant, it computes a plan:
#
#     { "sleepSecs": <int>, "pollIntervalSecs": <int>,
#       "pollMaxAttempts": <int>, "degraded": <bool> }
#
# The plan is hybrid: sleep until the estimated reset, then (after waking) poll
# every `pollIntervalSecs` up to `pollMaxAttempts` times until the Budget Gate
# reports the window is actually replenished before firing. This absorbs small
# errors in the reset estimate.
#
# The function is pure: it computes, it does not sleep. Callers do the sleeping.
#
# Usage:  sleep_planner "<resetAt iso8601 | empty>" "<now iso8601 | epoch>"
#
# Env (tunables, all optional):
#   SLEEP_POLL_INTERVAL  seconds between post-wake polls        (default 300)
#   SLEEP_POLL_MAX       max post-wake poll attempts            (default 12)
#   SLEEP_DEGRADED_SECS  fallback sleep when reset is unknown   (default 18000)

: "${SLEEP_POLL_INTERVAL:=300}"
: "${SLEEP_POLL_MAX:=12}"
: "${SLEEP_DEGRADED_SECS:=18000}"

# Parse an ISO-8601 string or a bare epoch into epoch seconds; empty on failure.
_sp_to_epoch() {
    local ts="$1"
    [ -z "${ts}" ] && return 0
    # A bare integer is already an epoch.
    if [[ "${ts}" =~ ^[0-9]+$ ]]; then
        printf '%s' "${ts}"
        return 0
    fi
    date -u -d "${ts}" +%s 2>/dev/null || true
}

# sleep_planner: print the sleep/poll plan JSON on stdout. Always exits 0 — a
# degraded input yields a safe default plan rather than an error, so the daemon
# stays alive.
sleep_planner() {
    local reset_at="${1:-}" now_arg="${2:-}"
    local reset_epoch now_epoch sleep_secs degraded

    now_epoch="$(_sp_to_epoch "${now_arg}")"
    [ -z "${now_epoch}" ] && now_epoch="$(date -u +%s)"

    reset_epoch="$(_sp_to_epoch "${reset_at}")"

    if [ -z "${reset_epoch}" ]; then
        # Reset unknown (missing or unparseable) → degraded default sleep.
        sleep_secs="${SLEEP_DEGRADED_SECS}"
        degraded="true"
    else
        degraded="false"
        if [ "${reset_epoch}" -gt "${now_epoch}" ]; then
            sleep_secs=$((reset_epoch - now_epoch))
        else
            # Reset already passed — poll immediately.
            sleep_secs=0
        fi
    fi

    printf '{"sleepSecs":%s,"pollIntervalSecs":%s,"pollMaxAttempts":%s,"degraded":%s}\n' \
        "${sleep_secs}" "${SLEEP_POLL_INTERVAL}" "${SLEEP_POLL_MAX}" "${degraded}"
}
