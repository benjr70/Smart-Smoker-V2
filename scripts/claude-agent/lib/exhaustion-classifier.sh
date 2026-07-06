#!/usr/bin/env bash
# exhaustion-classifier.sh — the Exhaustion Classifier: out-of-gas vs. real failure.
#
# Sourceable library exposing one pure function, `exhaustion_classify`. Given the
# `claude` process exit code and its captured stdout+stderr (piped on stdin), it
# decides whether a `/team-pickup` fire ended cleanly, was cut off by Claude
# usage exhaustion, or genuinely failed, and emits a compact JSON verdict:
#
#     { "status": "OK|EXHAUSTED|FAILED", "resetAt": "<iso8601|>" }
#
# The single most important property is the pause-vs-fail distinction: a run that
# ran out of usage budget must classify as EXHAUSTED (so the caller pauses the
# issue and keeps the branch), and a genuine failure must classify as FAILED (so
# it is surfaced for triage) — an out-of-gas event must never be mistaken for a
# failure, and a real failure must never be silently treated as "just out of gas".
#
# When the exhaustion notice carries an authoritative "resets at" instant, it is
# scraped and normalized to ISO-8601 so the daemon can schedule the next wake off
# it (this scraped value takes precedence over the ccusage estimate). When no
# reset instant is present, `resetAt` is empty.
#
# The function is pure: it reads only its argument and stdin, and touches the
# clock solely to normalize a scraped timestamp — never the network, git, or gh.

# The signatures Claude emits when a run is cut off by usage/rate limits. Kept
# deliberately specific so an unrelated failure that merely mentions "limit" is
# not mistaken for exhaustion (the pause-vs-fail safety property).
_EC_EXHAUSTION_RE='usage limit reached|usage limit will reset|rate[ -]?limit(ed)?|429 too many requests|too many requests'

# Normalize a scraped reset value (bare epoch or ISO-8601 string) to canonical
# ISO-8601; prints empty on anything unparseable.
_ec_to_iso() {
    local v="$1"
    [ -z "${v}" ] && return 0
    if [[ "${v}" =~ ^[0-9]+$ ]]; then
        date -u -d "@${v}" +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || true
    else
        date -u -d "${v}" +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || true
    fi
}

# Scrape the authoritative reset instant from an exhaustion notice. Tries, in
# order: Claude's own pipe-delimited epoch ("…reached|<epoch>"), an ISO-8601
# timestamp on a line mentioning "reset", then a bare epoch on such a line.
# Prints the normalized ISO-8601 instant, or empty when none is present.
_ec_scrape_reset() {
    local text="$1" candidate
    candidate="$(printf '%s' "${text}" \
        | grep -oiE 'limit reached\|[0-9]+' | head -1 | sed 's/.*|//')"
    if [ -n "${candidate}" ]; then
        _ec_to_iso "${candidate}"
        return 0
    fi
    candidate="$(printf '%s' "${text}" | grep -iE 'reset' \
        | grep -oiE '[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(:[0-9]{2})?([.][0-9]+)?Z?' \
        | head -1)"
    if [ -n "${candidate}" ]; then
        _ec_to_iso "${candidate}"
        return 0
    fi
    candidate="$(printf '%s' "${text}" | grep -iE 'reset' \
        | grep -oiE '[0-9]{10,}' | head -1)"
    _ec_to_iso "${candidate}"
}

# Usage:  <captured output> | exhaustion_classify <exitCode>
exhaustion_classify() {
    local exit_code="${1:-0}" text status reset

    text="$(cat)"

    if printf '%s' "${text}" | grep -qiE "${_EC_EXHAUSTION_RE}"; then
        status="EXHAUSTED"
        reset="$(_ec_scrape_reset "${text}")"
    elif [ "${exit_code}" -eq 0 ]; then
        status="OK"
        reset=""
    else
        status="FAILED"
        reset=""
    fi

    printf '{"status":"%s","resetAt":"%s"}\n' "${status}" "${reset}"
}
