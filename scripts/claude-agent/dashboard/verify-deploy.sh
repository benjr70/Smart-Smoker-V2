#!/usr/bin/env bash
# verify-deploy.sh — post-deploy check for the agent dashboard (#589 / PR #596).
#
# Why this exists: AC7 of #596 ("interim server on the box restarted from the
# MERGED code") cannot be exercised while the PR is open, so it ships as a
# post-deploy item. This script is that item, executable — it runs steps 2–6 of
# the demanded spec against the live dashboard and exits non-zero, naming the
# guard, the moment any of them is not satisfied. Step 1 (git checkout is at
# the merge commit) stays manual: it is two git commands and needs no tooling.
#
# The guards in step 5 are the round-1 bug class: an errored/stale Maps card and
# a Wayfinder tile rendering "?" because its counts came back null. A 200 from
# /api/status alone would NOT have caught those — the server never 500s by
# design — which is exactly why they are asserted on the payload.
#
# Usage (on the box, after `git checkout master && git pull`):
#
#   PREV=$(scripts/claude-agent/dashboard/verify-deploy.sh --capture-pid)
#   # …restart per infra/systemd/agent-dashboard.service's install notes…
#   scripts/claude-agent/dashboard/verify-deploy.sh --prev-pid "${PREV}"
#
# Options:
#   --prev-pid <PID>     PID listening on the port BEFORE the restart. Required
#                        (unless --capture-pid): the restart is only proven by
#                        the PID changing, so there is no silent-pass default.
#   --capture-pid        Print the current listening PID and exit; nothing else.
#   --unit-scope <s>     user (default) | system | none. `none` skips only the
#                        systemd guard — for the interim server run outside a
#                        unit — and still runs every other guard.
#   --unit <name>        Unit name (default: agent-dashboard).
#   --url <base>         Dashboard base URL (default: http://127.0.0.1:8090).
#   --port <n>           Port to look for in `ss` output (default: 8090).
#
# Exit codes: 0 all guards passed; 1 a guard failed; 3 usage/tooling error.
#
# Dependency-light on purpose: bash + curl + jq + ss, all already used here.
# Not wired into CI — it targets the box's live :8090, which CI does not have.
# Its hermetic coverage lives in verify-deploy.test.sh (stubbed binaries), which
# run-tests.sh picks up automatically.
#
# Env (injectable for tests): CURL_BIN, SS_BIN, SYSTEMCTL_BIN, JQ_BIN

set -uo pipefail

PREV_PID=''
CAPTURE_ONLY=0
UNIT_SCOPE='user'
UNIT='agent-dashboard'
BASE_URL='http://127.0.0.1:8090'
PORT='8090'

while [ $# -gt 0 ]; do
    case "$1" in
        --prev-pid)    PREV_PID="${2:-}"; shift 2 ;;
        --capture-pid) CAPTURE_ONLY=1; shift ;;
        --unit-scope)  UNIT_SCOPE="${2:-}"; shift 2 ;;
        --unit)        UNIT="${2:-}"; shift 2 ;;
        --url)         BASE_URL="${2:-}"; shift 2 ;;
        --port)        PORT="${2:-}"; shift 2 ;;
        -h|--help)     sed -n '2,40p' "${BASH_SOURCE[0]}"; exit 0 ;;
        *) echo "verify-deploy: unknown arg $1" >&2; exit 3 ;;
    esac
done

CURL="${CURL_BIN:-curl}"
SS="${SS_BIN:-ss}"
SYSTEMCTL="${SYSTEMCTL_BIN:-systemctl}"
JQ="${JQ_BIN:-jq}"

case "${UNIT_SCOPE}" in
    user|system|none) ;;
    *) echo "verify-deploy: --unit-scope must be user|system|none" >&2; exit 3 ;;
esac

listening_pid() { # → PID of the python3 process LISTENing on ${PORT}, or empty
    "${SS}" -tlnp 2>/dev/null \
        | grep ":${PORT}\b" \
        | grep 'python3' \
        | grep -oE 'pid=[0-9]+' \
        | head -1 \
        | cut -d= -f2
}

if [ "${CAPTURE_ONLY}" -eq 1 ]; then
    pid="$(listening_pid)"
    if [ -z "${pid}" ]; then
        echo "verify-deploy: nothing python3 is LISTENing on :${PORT}" >&2
        exit 1
    fi
    echo "${pid}"
    exit 0
fi

if [ -z "${PREV_PID}" ]; then
    echo "verify-deploy: --prev-pid <PID> is required (capture it before the" >&2
    echo "  restart with: $0 --capture-pid). Without it a stale process that" >&2
    echo "  never restarted would pass every other guard." >&2
    exit 3
fi

FAILURES=0

ok()   { echo "  PASS: $1"; }
bad()  { echo "  FAIL: $1"; FAILURES=$((FAILURES + 1)); }
skip() { echo "  SKIP: $1"; }

echo "=== dashboard post-deploy verification (${BASE_URL}) ==="

# ── Step 2: the unit is active ──────────────────────────────────────────────
if [ "${UNIT_SCOPE}" = 'none' ]; then
    skip "unit active — --unit-scope none (interim server, no systemd unit)"
else
    scope_flag=()
    [ "${UNIT_SCOPE}" = 'user' ] && scope_flag=(--user)
    state="$("${SYSTEMCTL}" "${scope_flag[@]}" is-active "${UNIT}" 2>/dev/null)"
    if [ "${state}" = 'active' ]; then
        ok "unit active — systemctl ${UNIT_SCOPE} is-active ${UNIT} → active"
    else
        bad "unit active — systemctl ${UNIT_SCOPE} is-active ${UNIT} → '${state:-<none>}' (want active)"
    fi
fi

# ── Step 3: a python3 listener on the port, with a NEW pid ──────────────────
NEW_PID="$(listening_pid)"
if [ -z "${NEW_PID}" ]; then
    bad "listener on :${PORT} — no python3 LISTEN found in ss -tlnp"
    bad "listener restarted — cannot compare PIDs (nothing is listening)"
else
    ok "listener on :${PORT} — python3 LISTENing (pid=${NEW_PID})"
    if [ "${NEW_PID}" = "${PREV_PID}" ]; then
        bad "listener restarted — pid still ${NEW_PID}: this is the pre-restart process, not a real restart"
    else
        ok "listener restarted — pid ${PREV_PID} → ${NEW_PID}"
    fi
fi

# ── Step 4: /api/status answers 200 ─────────────────────────────────────────
BODY_FILE="$(mktemp)"
trap 'rm -f "${BODY_FILE}"' EXIT
CODE="$("${CURL}" -s -o "${BODY_FILE}" -w '%{http_code}' "${BASE_URL}/api/status" 2>/dev/null)"
if [ "${CODE}" = '200' ]; then
    ok "/api/status 200 — got ${CODE}"
else
    bad "/api/status 200 — got '${CODE:-<no response>}'"
fi

# ── Steps 5–6: payload guards (the round-1 bug class + the new work-probe) ──
if ! "${JQ}" -e . "${BODY_FILE}" >/dev/null 2>&1; then
    bad "/api/status body is JSON — unparseable response, payload guards skipped"
else
    j() { "${JQ}" -r "$1" "${BODY_FILE}" 2>/dev/null; }

    v="$(j '.maps.error')"
    [ "${v}" = 'null' ] && ok "maps.error null" \
        || bad "maps.error null — got '${v}' (Maps card collector errored)"

    v="$(j '.wayfinder.unknown')"
    [ "${v}" = 'false' ] && ok "wayfinder.unknown false" \
        || bad "wayfinder.unknown false — got '${v}' (tile has no counts)"

    v="$(j '.maps.stale')"
    [ "${v}" = 'false' ] && ok "maps.stale false" \
        || bad "maps.stale false — got '${v}' (Maps card serving a cached/failed value)"

    v="$("${JQ}" -c '[.wayfinder.maps, .wayfinder.frontier, .wayfinder.afk] | map(type)' \
        "${BODY_FILE}" 2>/dev/null)"
    [ "${v}" = '["number","number","number"]' ] \
        && ok "wayfinder tile counts numeric — ${v}" \
        || bad "wayfinder tile counts numeric — got ${v:-<none>} (want [\"number\",\"number\",\"number\"]; a null renders '?' on the tile)"

    v="$("${JQ}" -c '.pipeline.scan
            | [.slices, .wayfinder, .openMaps]
            | map(type == "number" and (. | floor) == .)
            | all' "${BODY_FILE}" 2>/dev/null)"
    if [ "${v}" = 'true' ]; then
        ok "pipeline.scan slices/wayfinder/openMaps present and integer — $(j '.pipeline.scan | {slices, wayfinder, openMaps} | tostring')"
    else
        bad "pipeline.scan slices/wayfinder/openMaps present and integer — got $(j '.pipeline.scan | tostring') (restarted process is running an old work-probe.sh)"
    fi
fi

echo ""
if [ "${FAILURES}" -gt 0 ]; then
    echo "RESULT: ${FAILURES} guard(s) FAILED — dashboard is NOT verified post-deploy."
    exit 1
fi
echo "RESULT: ALL GUARDS PASSED — dashboard restarted from the merged code and healthy."
exit 0
