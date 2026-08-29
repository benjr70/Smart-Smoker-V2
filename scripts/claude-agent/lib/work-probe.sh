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
#                         { "locked":    <bool>,        # AFK:in-progress held
#                           "reconcile": <pr# | null>,  # pr_triage_pick verdict
#                           "paused":    <issue# | null>,
#                           "pickSig":   "<csv of candidate issue numbers>",
#                           "prSig":     "<csv of open PR numbers>" | null,
#                           "slices":    <n eligible implementation slices>,
#                           "wayfinder": <n eligible wayfinder:* tickets>,
#                           "openMaps":  <n open wayfinder:map issues> }
#                         The last three are read-only signals for the agent
#                         dashboard's Wayfinder tile; wp_decide ignores them.
#                         prSig is derived from the same `pr list` fetch that
#                         feeds reconcile triage — no extra API call. A failed
#                         or malformed fetch emits prSig=null (set UNKNOWN),
#                         never "" (which means a readable EMPTY set).
#
#   wp_decide <baseline-pickSig> <baseline-prSig>
#                       pure: reads a scan JSON on stdin, prints a one-line
#                       wake reason and exits 0, or exits 1 (keep sleeping).
#
# Wake rules (mirrors afk-pickup's priority order):
#   - lock held → never wake: every fire would skip. The lock read fails SAFE —
#     a gh error reads as "locked" so a flake can never start a wake-fire-skip
#     loop against a genuinely held lock.
#   - reconcile candidate → wake unconditionally. Deterministic: afk-pickup
#     §1.2 runs the very same pr_triage_pick over the same inputs, so it WILL
#     act on it. Candidates cover all three attention classes (AFK:revise,
#     CONFLICTING, bot-incomplete tail); the incomplete signals cost one extra
#     `gh pr view --json comments` per otherwise-clean agent PR per scan and
#     fail SAFE toward "complete" (see pr-triage.sh pr_triage_enrich).
#   - AFK:paused issue → wake unconditionally. §1.5 always acts (resume, or
#     cap → AFK:failed — either way the signal clears itself).
#   - open-PR set shrink → wake unconditionally when a PR present in the
#     baseline is absent from the current scan (merged OR closed — no
#     distinction needed; a wake that finds nothing re-baselines next fire).
#     This closes the blocker-PR blind spot: chain-root issues are closed by
#     the agent before their PR merges, so a blocker-PR merge changes no
#     issue-side signal — but it unblocks the queue. Set GROWTH never wakes
#     here (new PRs ride the reconcile signal when actionable). Fails SAFE: a
#     null (unreadable) current prSig is never read as a shrink.
#   - pick-class candidates (open `AFK` issues with no state label) → wake
#     ONLY when the signature differs from the baseline captured when the fire
#     reported no work. The probe cannot cheaply check Project #1 membership
#     or `Blocked by` closure, so an issue afk-pickup already declined must
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
    local pr_sig pr_sig_arg

    author="${WP_AUTHOR:-$("${gh}" api user -q .login 2>/dev/null || echo '')}"

    locked_raw="$("${gh}" issue list --label AFK:in-progress --state open \
        --json number --jq 'length' 2>/dev/null || echo 'ERR')"
    if [ "${locked_raw}" = "0" ]; then
        locked=false
    else
        locked=true
    fi

    # One `pr list` fetch feeds BOTH the reconcile triage and the open-PR
    # signature — no extra API call for the shrink signal. A failed/malformed
    # fetch fails SAFE: the set is UNKNOWN (prSig → JSON null), never mistaken
    # for an empty set, so wp_decide can't read a flake as a whole-set shrink.
    prs="$("${gh}" pr list --state open \
        --json number,headRefName,isDraft,mergeable,labels,createdAt,author \
        2>/dev/null)" || prs=''
    if [ -n "${prs}" ] && printf '%s' "${prs}" | jq -e 'type == "array"' >/dev/null 2>&1; then
        pr_sig="$(printf '%s' "${prs}" | jq -r '[.[].number] | sort | map(tostring) | join(",")')"
        pr_sig_arg="$(jq -cn --arg s "${pr_sig}" '$s')"
    else
        prs='[]'          # reconcile triage still needs a valid empty array
        pr_sig_arg='null' # set unreadable → signature is null, not ""
    fi

    pick_json="$(printf '%s' "${prs}" \
        | PR_TRIAGE_AUTHOR="${author}" pr_triage_enrich \
        | PR_TRIAGE_AUTHOR="${author}" pr_triage_pick)" || true
    reconcile="$(printf '%s' "${pick_json}" | jq -r '.pr // "null"' 2>/dev/null || echo 'null')"

    paused="$("${gh}" issue list --label AFK:paused --state open \
        --json number --jq '(sort_by(.number) | first | .number) // "null"' \
        2>/dev/null || echo 'null')"

    # One raw fetch of the AFK queue feeds BOTH the pick signature and the
    # kind split (slices vs wayfinder tickets) — the dashboard's Wayfinder tile
    # costs no extra API call. A failed/malformed fetch reads as an empty queue.
    local queue eligible slices wayfinder open_maps
    queue="$("${gh}" issue list --label AFK --state open --json number,labels \
        2>/dev/null)" || queue=''
    if [ -z "${queue}" ] || ! printf '%s' "${queue}" | jq -e 'type == "array"' >/dev/null 2>&1; then
        queue='[]'
    fi
    eligible="$(printf '%s' "${queue}" | jq -c '
        [ .[] | . as $i | [$i.labels[].name] as $l
          | select(($l | index("AFK:done") | not)
               and ($l | index("AFK:failed") | not)
               and ($l | index("AFK:in-progress") | not)
               and ($l | index("AFK:paused") | not))
          | {number: $i.number, labels: $l} ]' 2>/dev/null || echo '[]')"
    pick_sig="$(printf '%s' "${eligible}" \
        | jq -r '[.[].number] | sort | map(tostring) | join(",")' 2>/dev/null || echo '')"
    # Wayfinder tickets carry a `wayfinder:<type>` label and are routed to
    # /afk-resolve; everything else in the queue is an implementation slice.
    wayfinder="$(printf '%s' "${eligible}" \
        | jq '[.[] | select(.labels | any(startswith("wayfinder:")))] | length' \
        2>/dev/null || echo 0)"
    slices="$(printf '%s' "${eligible}" \
        | jq '[.[] | select(.labels | any(startswith("wayfinder:")) | not)] | length' \
        2>/dev/null || echo 0)"

    # --limit is explicit: gh defaults to 30, which would silently under-count
    # the dashboard's map total once the repo passes 30 open maps.
    open_maps="$("${gh}" issue list --label wayfinder:map --state open --limit 200 \
        --json number --jq 'length' 2>/dev/null || echo 0)"
    case "${open_maps}" in
        ''|*[!0-9]*) open_maps=0 ;;
    esac

    jq -cn \
        --argjson locked "${locked}" \
        --argjson reconcile "${reconcile}" \
        --argjson paused "${paused}" \
        --arg pickSig "${pick_sig}" \
        --argjson prSig "${pr_sig_arg}" \
        --argjson slices "${slices:-0}" \
        --argjson wayfinder "${wayfinder:-0}" \
        --argjson openMaps "${open_maps}" \
        '{locked: $locked, reconcile: $reconcile, paused: $paused, pickSig: $pickSig,
          prSig: $prSig, slices: $slices, wayfinder: $wayfinder, openMaps: $openMaps}'
}

# wp_decide: read a scan JSON on stdin; wake (print reason, exit 0) or keep
# sleeping (exit 1). $1 is the baseline pickSig and $2 the baseline prSig, both
# captured at no-work time. Anything malformed keeps sleeping — a broken sensor
# must never wake-loop.
wp_decide() {
    local baseline="${1:-}" pr_baseline="${2:-}" scan locked reconcile paused pick_sig
    local pr_readable pr_sig gone
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

    # Shrink-wake: a PR present in the baseline but gone from the current scan
    # (merged or closed — no distinction needed) unblocks the queue. Only fires
    # when the current set is READABLE (prSig not null): a `gh pr list` flake
    # scans as null and must never look like a whole-set shrink. Set growth is
    # ignored here — new PRs are covered by the reconcile signal when actionable.
    if [ -n "${pr_baseline}" ]; then
        pr_readable="$(printf '%s' "${scan}" | jq -r '.prSig != null' 2>/dev/null || echo 'false')"
        if [ "${pr_readable}" = "true" ]; then
            pr_sig="$(printf '%s' "${scan}" | jq -r '.prSig')"
            gone="$(jq -rn --arg b "${pr_baseline}" --arg c "${pr_sig}" \
                'def toset($s): ($s | if length > 0 then split(",") else [] end);
                 (toset($b) - toset($c)) | join(",")')"
            if [ -n "${gone}" ]; then
                printf 'PR(s) left the open set #%s\n' "${gone}"
                return 0
            fi
        fi
    fi

    pick_sig="$(printf '%s' "${scan}" | jq -r '.pickSig // ""')"
    if [ -n "${pick_sig}" ] && [ "${pick_sig}" != "${baseline}" ]; then
        printf 'new pick candidate(s) #%s\n' "${pick_sig}"
        return 0
    fi

    return 1
}
