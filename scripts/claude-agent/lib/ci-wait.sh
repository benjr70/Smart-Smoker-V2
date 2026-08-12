#!/usr/bin/env bash
# ci-wait.sh — block until a PR's CI checks settle; zero agent turns meanwhile.
#
# Why this exists: pr-watch's old §2 poll loop claimed a 45-min cap but ran
# inside the Bash tool's 10-min ceiling, so the agent re-invoked the poll ~4–5
# times per round — each re-invoke a full cache-read API turn. Run THIS script
# with `run_in_background: true` instead: it detaches, polls gh on its own
# clock, and exits when checks settle — the harness wakes the agent exactly
# once, with the whole verdict (and failure logs) already gathered.
#
# Usage:
#   scripts/claude-agent/lib/ci-wait.sh --pr <N> --repo <owner/repo> \
#       [--timeout-mins 45] [--interval 60] [--max-log-lines 200]
#
# Output (stdout):
#   Line 1: one compact JSON verdict —
#     { "result": "green|fail|timeout|error",
#       "polls": <int>,                      # how many gh checks calls it took
#       "failed": [ {"name": "...", "link": "..."} ],   # [] unless result=fail
#       "pending": <int> }                   # >0 only when result=timeout
#   Then, when result=fail: the §3 failure-context bundle —
#     === <job name> ===
#     <last N lines of that job's failed-step log>
#   …one section per failed check, so the fix-loop implementer prompt can be
#   built from this single output with no further gh turns.
#
# Exit codes: 0 green; 1 fail (checks settled red); 2 timeout (pending checks
# remain at the deadline); 3 error (gh unusable / PR checks unreadable).
#
# `bucket == "skipping"` is benign — ignored. Only `fail` counts as red
# (same rule as the skill text this replaces).
#
# Env:
#   GH_BIN   gh CLI (default: gh) — injectable for tests

set -uo pipefail

PR=''
REPO=''
TIMEOUT_MINS=45
INTERVAL=60
MAX_LOG_LINES=200

while [ $# -gt 0 ]; do
    case "$1" in
        --pr)            PR="${2:-}"; shift 2 ;;
        --repo)          REPO="${2:-}"; shift 2 ;;
        --timeout-mins)  TIMEOUT_MINS="${2:-}"; shift 2 ;;
        --interval)      INTERVAL="${2:-}"; shift 2 ;;
        --max-log-lines) MAX_LOG_LINES="${2:-}"; shift 2 ;;
        *) echo "ci-wait: unknown arg $1" >&2; exit 3 ;;
    esac
done

if [ -z "${PR}" ] || [ -z "${REPO}" ]; then
    echo "ci-wait: --pr and --repo are required" >&2
    exit 3
fi

GH="${GH_BIN:-gh}"
DEADLINE=$(( $(date +%s) + TIMEOUT_MINS * 60 ))
POLLS=0
STATUS=''
CONSECUTIVE_ERRORS=0

emit() { # emit <result> <failedJson> <pending>
    jq -cn --arg result "$1" --argjson polls "${POLLS}" \
        --argjson failed "$2" --argjson pending "$3" \
        '{result: $result, polls: $polls, failed: $failed, pending: $pending}'
}

while : ; do
    STATUS="$("${GH}" pr checks "${PR}" --repo "${REPO}" \
        --json bucket,name,state,link 2>/dev/null)" || STATUS=''
    if [ -z "${STATUS}" ] || ! printf '%s' "${STATUS}" | jq -e 'type == "array"' >/dev/null 2>&1; then
        # Transient API flake ≠ terminal. Three consecutive unreadable polls =
        # genuinely broken (auth gone, PR closed) — give up loudly.
        CONSECUTIVE_ERRORS=$((CONSECUTIVE_ERRORS + 1))
        if [ "${CONSECUTIVE_ERRORS}" -ge 3 ]; then
            emit error '[]' 0
            exit 3
        fi
        sleep "${INTERVAL}"
        continue
    fi
    CONSECUTIVE_ERRORS=0
    POLLS=$((POLLS + 1))

    PENDING="$(printf '%s' "${STATUS}" | jq '[.[] | select(.bucket == "pending")] | length')"
    FAIL="$(printf '%s' "${STATUS}" | jq '[.[] | select(.bucket == "fail")] | length')"

    if [ "${PENDING}" -eq 0 ] && [ "${FAIL}" -eq 0 ]; then
        emit green '[]' 0
        exit 0
    fi

    if [ "${PENDING}" -eq 0 ] && [ "${FAIL}" -gt 0 ]; then
        FAILED_JSON="$(printf '%s' "${STATUS}" | jq -c '[.[] | select(.bucket == "fail") | {name, link}]')"
        emit fail "${FAILED_JSON}" 0
        # Failure-context bundle (pr-watch §3): last N lines of each failed
        # job's log, gathered here so the agent never spends turns on it.
        printf '%s' "${STATUS}" | jq -r '.[] | select(.bucket == "fail") | "\(.name)\t\(.link)"' \
        | while IFS=$'\t' read -r NAME LINK; do
            RUN_ID="$(printf '%s' "${LINK}" | grep -oE 'runs/[0-9]+' | head -1 | cut -d/ -f2)"
            printf '\n=== %s ===\n' "${NAME}"
            if [ -n "${RUN_ID}" ]; then
                "${GH}" run view "${RUN_ID}" --repo "${REPO}" --log-failed 2>/dev/null \
                    | tail -"${MAX_LOG_LINES}" || echo "(log unavailable)"
            else
                echo "(no run id in link: ${LINK})"
            fi
        done
        exit 1
    fi

    if [ "$(date +%s)" -ge "${DEADLINE}" ]; then
        emit timeout '[]' "${PENDING}"
        exit 2
    fi

    sleep "${INTERVAL}"
done
