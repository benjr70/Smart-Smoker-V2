#!/usr/bin/env bash
# work-probe.sh — the Work Probe: "did work appear mid-window?" for zero Claude
# cost. The daemon's NO_WORK sleep used to be deaf: a fire that found an empty
# queue slept until the window reset, blind to work arriving on human time
# (observed live 2026-07-10: a human merged PR #307 fifty-two seconds after a
# no-work fire, conflicting PR #305 — which then waited ~4h for the reset).
# The probe lets the daemon sleep in chunks and peek between them using only
# `gh` — no Claude usage is ever burned on a probe.
#
# Two functions:
#
#   wp_scan             one `gh` sweep of the repo's work signals; emits
#                         { "locked":    <bool>,        # team:in-progress held
#                           "reconcile": <pr# | null>,  # pr_triage_pick verdict
#                           "paused":    <issue# | null>,
#                           "pickSig":   "<csv of candidate issue numbers>" }
#
#   wp_decide <baseline-pickSig>
#                       pure: reads a scan JSON on stdin, prints a one-line
#                       wake reason and exits 0, or exits 1 (keep sleeping).
#
# Wake rules (mirrors team-pickup's priority order):
#   - lock held → never wake: every fire would skip. The lock read fails SAFE —
#     a gh error reads as "locked" so a flake can never start a wake-fire-skip
#     loop against a genuinely held lock.
#   - reconcile candidate → wake unconditionally. Deterministic: team-pickup
#     §1.2 runs the very same pr_triage_pick over the same inputs, so it WILL
#     act on it.
#   - team:paused issue → wake unconditionally. §1.5 always acts (resume, or
#     cap → team:failed — either way the signal clears itself).
#   - pick-class candidates (open `team` issues with no state label) → wake
#     ONLY when the signature differs from the baseline captured when the fire
#     reported no work. The probe cannot cheaply check Project #1 membership
#     or `Blocked by` closure, so an issue team-pickup already declined must
#     not re-wake the daemon every chunk; a genuinely new issue changes the
#     signature and wakes once.
#
# Env:
#   GH_BIN     gh CLI (default: gh) — injectable for tests
#   WP_AUTHOR  agent's GitHub login for the triage ours-filter
#              (default: `gh api user` at scan time; empty disables the filter)

_WP_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=pr-triage.sh
. "${_WP_LIB_DIR}/pr-triage.sh"

# wp_scan: sweep the work signals, print the scan JSON. Always exits 0 with
# valid JSON — individual gh failures degrade field-by-field (lock → locked,
# everything else → "nothing there"), never crash the daemon's sleep loop.
wp_scan() {
    local gh="${GH_BIN:-gh}" author locked_raw locked prs pick_json reconcile paused pick_sig

    author="${WP_AUTHOR:-$("${gh}" api user -q .login 2>/dev/null || echo '')}"

    locked_raw="$("${gh}" issue list --label team:in-progress --state open \
        --json number --jq 'length' 2>/dev/null || echo 'ERR')"
    if [ "${locked_raw}" = "0" ]; then
        locked=false
    else
        locked=true
    fi

    prs="$("${gh}" pr list --state open \
        --json number,headRefName,isDraft,mergeable,labels,createdAt,author \
        2>/dev/null || echo '[]')"
    pick_json="$(printf '%s' "${prs}" | PR_TRIAGE_AUTHOR="${author}" pr_triage_pick)" || true
    reconcile="$(printf '%s' "${pick_json}" | jq -r '.pr // "null"' 2>/dev/null || echo 'null')"

    paused="$("${gh}" issue list --label team:paused --state open \
        --json number --jq '(sort_by(.number) | first | .number) // "null"' \
        2>/dev/null || echo 'null')"

    pick_sig="$("${gh}" issue list --label team --state open --json number,labels \
        --jq '[ .[] | [.labels[].name] as $l
              | select(($l | index("team:done") | not)
                   and ($l | index("team:failed") | not)
                   and ($l | index("team:in-progress") | not)
                   and ($l | index("team:paused") | not))
              | .number ] | sort | map(tostring) | join(",")' \
        2>/dev/null || echo '')"

    jq -cn \
        --argjson locked "${locked}" \
        --argjson reconcile "${reconcile}" \
        --argjson paused "${paused}" \
        --arg pickSig "${pick_sig}" \
        '{locked: $locked, reconcile: $reconcile, paused: $paused, pickSig: $pickSig}'
}

# wp_decide: read a scan JSON on stdin; wake (print reason, exit 0) or keep
# sleeping (exit 1). $1 is the baseline pickSig captured at no-work time.
# Anything malformed keeps sleeping — a broken sensor must never wake-loop.
wp_decide() {
    local baseline="${1:-}" scan locked reconcile paused pick_sig
    scan="$(cat)"

    printf '%s' "${scan}" | jq -e 'type == "object"' >/dev/null 2>&1 || return 1

    # Anything other than an explicit false counts as locked (fail safe).
    locked="$(printf '%s' "${scan}" | jq -r '.locked' 2>/dev/null || echo 'true')"
    if [ "${locked}" != "false" ]; then
        return 1
    fi

    reconcile="$(printf '%s' "${scan}" | jq -r '.reconcile // "null"')"
    if [ "${reconcile}" != "null" ]; then
        printf 'reconcile PR #%s\n' "${reconcile}"
        return 0
    fi

    paused="$(printf '%s' "${scan}" | jq -r '.paused // "null"')"
    if [ "${paused}" != "null" ]; then
        printf 'resume issue #%s\n' "${paused}"
        return 0
    fi

    pick_sig="$(printf '%s' "${scan}" | jq -r '.pickSig // ""')"
    if [ -n "${pick_sig}" ] && [ "${pick_sig}" != "${baseline}" ]; then
        printf 'new pick candidate(s) #%s\n' "${pick_sig}"
        return 0
    fi

    return 1
}
