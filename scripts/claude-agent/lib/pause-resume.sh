#!/usr/bin/env bash
# pause-resume.sh — the Pause/Resume state logic: what to do next window.
#
# Sourceable library exposing one pure function, `pause_resume_action`. Given the
# current GitHub label state — whether a `team:paused` issue exists and how many
# times it has already paused — it decides the single thing the pacing loop needs
# before it does anything else, and emits a compact JSON verdict:
#
#     { "action": "resume|pick-new|fail", "issue": <number|null>,
#       "pauseCount": <int> }
#
# The action maps onto the PRD's `resume-N | pick-new | fail-N` contract:
#   resume    → resume-N: hand issue `.issue`'s existing branch to /team-dispatch
#               in resume mode (its partial work is preserved, not restarted).
#   pick-new  → pick-new: no paused work; proceed to the normal fresh pick.
#   fail      → fail-N:   issue `.issue` has paused too many times; the caller
#               applies `team:failed` and the loop stops on it.
#
# The single most important property is the resume-count cap: an issue that has
# paused `PAUSE_RESUME_CAP` times must `fail` rather than `resume`, so a
# genuinely-too-big issue is handed to a human instead of bouncing across windows
# forever. Below the cap a paused issue always resumes — in-flight work is
# finished before any new issue is picked.
#
# The function is pure: it reads only its two arguments. The caller is
# responsible for discovering the paused issue and counting its pauses (e.g. from
# the pause comments agent-run leaves on the issue timeline) and passing them in.
#
# Usage:  pause_resume_action "<pausedIssue|empty>" "<pauseCount>"
#
# Env (tunable):
#   PAUSE_RESUME_CAP   pauses at which an issue fails instead of resuming (3)

: "${PAUSE_RESUME_CAP:=3}"

# pause_resume_action: print the next-action JSON on stdout. Always exits 0 — the
# pacing loop must never crash on this decision.
pause_resume_action() {
    local paused_issue="${1:-}" pause_count="${2:-}"

    # No paused issue → nothing in flight to finish; proceed to the normal pick.
    if [ -z "${paused_issue}" ] || ! [[ "${paused_issue}" =~ ^[0-9]+$ ]]; then
        printf '{"action":"pick-new","issue":null,"pauseCount":0}\n'
        return 0
    fi

    # A paused issue is present. A non-numeric or missing count means the count
    # could not be read; treat it as a single pause so the issue resumes rather
    # than being failed on a read glitch (fail-safe toward finishing the work).
    if ! [[ "${pause_count}" =~ ^[0-9]+$ ]] || [ "${pause_count}" -lt 1 ]; then
        pause_count=1
    fi

    if [ "${pause_count}" -ge "${PAUSE_RESUME_CAP}" ]; then
        printf '{"action":"fail","issue":%s,"pauseCount":%s}\n' \
            "${paused_issue}" "${pause_count}"
    else
        printf '{"action":"resume","issue":%s,"pauseCount":%s}\n' \
            "${paused_issue}" "${pause_count}"
    fi
    return 0
}
