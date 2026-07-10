#!/usr/bin/env bash
# usage-sensor.sh — the Usage Sensor: the account's REAL limits, not a proxy.
#
# The Budget Gate's ccusage sensor infers a 5-hour window from local JSONL
# activity and reports the percent of *time* left in it — a clock proxy that
# knows nothing about actual budget. Observed live 2026-07-10: the daemon
# refused to fire ("remainPct=9.72") while the account sat at 19% session /
# 18% weekly utilization — 81% of real budget free. The inferred window bounds
# were wrong too (ccusage said reset 19:00Z; the true session window reset
# 22:10Z).
#
# This sensor reads the same numbers the Claude usage UI shows, from the
# OAuth usage endpoint, authenticated with the token Claude Code already
# maintains in ~/.claude/.credentials.json (the CLI refreshes that token every
# run, and the daemon runs the CLI every fire, so staleness self-heals; an
# expired token just degrades to the caller's fallback).
#
# Two functions:
#
#   usage_sensor_fetch  curl the endpoint; prints its JSON. Non-zero on any
#                       failure (no creds, network down, HTTP error).
#
#   usage_gate          pure: reads the endpoint JSON on stdin and emits the
#                       same verdict shape the Budget Gate emits —
#                           {"remainPct":<0..100>,"resetAt":"<iso>","shouldFire":<bool>}
#                       remainPct is 100 minus the WORST utilization across
#                       every limit the account reports (session five_hour,
#                       weekly seven_day, and any per-model weekly present):
#                       the binding constraint gates the fire, and resetAt is
#                       that binding limit's resets_at — when the constraint
#                       actually frees. shouldFire mirrors the Budget Gate
#                       threshold (>= BUDGET_GATE_MIN_PCT, default 25).
#
# Exit codes (usage_gate, mirrors budget_gate):
#   0 — verdict computed
#   3 — degraded: missing/malformed JSON or no usable limit fields; a
#       non-firing verdict is still printed; callers fall back (the daemon
#       falls back to the ccusage time-proxy).
#
# Env:
#   USAGE_API_URL     endpoint (default https://api.anthropic.com/api/oauth/usage)
#   USAGE_CREDS_FILE  credentials path (default ~/.claude/.credentials.json)
#   CURL_BIN          curl binary (default curl) — injectable for tests
#   BUDGET_GATE_MIN_PCT  fire threshold shared with the Budget Gate (default 25)

: "${BUDGET_GATE_MIN_PCT:=${BUDGET_FRESH_PCT:-25}}"

# usage_sensor_fetch: print the endpoint's JSON on stdout, non-zero on failure.
usage_sensor_fetch() {
    local url="${USAGE_API_URL:-https://api.anthropic.com/api/oauth/usage}"
    local creds="${USAGE_CREDS_FILE:-${HOME}/.claude/.credentials.json}"
    local curl_bin="${CURL_BIN:-curl}"
    local token

    [ -f "${creds}" ] || return 1
    token="$(jq -r '.claudeAiOauth.accessToken // empty' "${creds}" 2>/dev/null)"
    [ -n "${token}" ] || return 1

    "${curl_bin}" -sf -m 15 "${url}" \
        -H "Authorization: Bearer ${token}" \
        -H "anthropic-beta: oauth-2025-04-20"
}

# usage_gate: endpoint JSON on stdin → verdict JSON on stdout.
usage_gate() {
    local payload binding util reset remain_pct should_fire

    payload="$(cat)"

    if ! printf '%s' "${payload}" | jq -e 'type == "object"' >/dev/null 2>&1; then
        printf '{"remainPct":0,"resetAt":"","shouldFire":false}\n'
        return 3
    fi

    # The binding limit = worst utilization across everything reported. The
    # named fields are the stable contract; the limits[] array (when present)
    # is folded in too so a new limit kind gates correctly without a code
    # change. Entries without a numeric utilization/percent are ignored.
    binding="$(printf '%s' "${payload}" | jq -c '
        [ ( .five_hour, .seven_day, .seven_day_opus, .seven_day_sonnet
            | select(type == "object" and (.utilization | type) == "number")
            | {u: .utilization, r: (.resets_at // "")} ),
          ( .limits[]?
            | select(type == "object" and (.percent | type) == "number")
            | select(.is_active != false)
            | {u: .percent, r: (.resets_at // "")} ) ]
        | max_by(.u) // empty' 2>/dev/null)"

    if [ -z "${binding}" ]; then
        printf '{"remainPct":0,"resetAt":"","shouldFire":false}\n'
        return 3
    fi

    util="$(printf '%s' "${binding}" | jq -r '.u')"
    reset="$(printf '%s' "${binding}" | jq -r '.r')"

    remain_pct="$(awk "BEGIN{p = 100 - ${util}; if (p < 0) p = 0; if (p > 100) p = 100; printf \"%.2f\", p}")"

    if awk "BEGIN{exit !(${remain_pct} >= ${BUDGET_GATE_MIN_PCT})}"; then
        should_fire="true"
    else
        should_fire="false"
    fi

    printf '{"remainPct":%s,"resetAt":"%s","shouldFire":%s}\n' \
        "${remain_pct}" "${reset}" "${should_fire}"
}
