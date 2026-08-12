#!/usr/bin/env bash
# preflight-boot.sh — verify-pr §0 preflight + §4 stack boot (+§5 Electron)
# in one call.
#
# Why this exists: the verify-pr skill used to walk preflight checks, the
# stack-runner boot, the one-retry rule, and the Electron launch as separate
# agent turns (~8–10 per round), each turn re-reading the session's full cached
# context. This script chains them; the agent makes one call and gets the
# sourced stack contract back.
#
# Usage:
#   scripts/verify-pr/preflight-boot.sh --pr <N> [--electron]
#
#   --electron   also run electron-launcher.sh start after a healthy boot
#                (only pass when a parsed checklist item targets the smoker
#                desktop app — §5's "do not launch needlessly" rule).
#
# Output (stdout): the stack contract, exactly the lines verify-pr §4 sources —
#   E2E_*=...
#   STACK_PROJECT_NAME=...
# Everything else (progress, warnings, failure tails) goes to stderr, so the
# skill can keep using:  eval "$(scripts/verify-pr/preflight-boot.sh --pr $PR)"
#
# Exit codes:
#   0  stack healthy (and Electron up, when requested)
#   3  hard preflight failure (gh auth, missing verify-pr scripts, missing
#      stack-runner deps) — nothing was booted
#   4  stack boot failed twice (§4's one-retry rule) — teardown already ran;
#      the caller posts the infrastructure-error comment using the stderr tail
#   5  Electron launch failed after a healthy boot — stack is LEFT UP so the
#      caller can decide (retry Electron / proceed browser-only / teardown)
#
# Soft prerequisites (§0's screenshot-tour deps) WARN on stderr, never fail —
# same rule as the skill text this replaces.
#
# Env:
#   STACK_RUNNER_CMD   override the boot command (default:
#                      "npx tsx cli.ts up --pr <N>") — injectable for tests
#   STACK_DOWN_CMD     override teardown between boot attempts (default:
#                      "npx tsx cli.ts down --pr <N>")
#   ELECTRON_START_CMD override the Electron launch — injectable for tests
#   GH_BIN             gh CLI (default: gh) — injectable for tests

set -uo pipefail

PR=''
WANT_ELECTRON=0

while [ $# -gt 0 ]; do
    case "$1" in
        --pr)       PR="${2:-}"; shift 2 ;;
        --electron) WANT_ELECTRON=1; shift ;;
        *) echo "preflight-boot: unknown arg $1" >&2; exit 3 ;;
    esac
done

if [ -z "${PR}" ]; then
    echo "preflight-boot: --pr is required" >&2
    exit 3
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
    echo "preflight-boot: not inside a git checkout" >&2
    exit 3
}
cd "${REPO_ROOT}"

# ── §0 Preflight — hard failures (fail fast, never auto-install) ──────────────
"${GH_BIN:-gh}" auth status >/dev/null 2>&1 || { echo "preflight-boot: gh not authenticated" >&2; exit 3; }
for f in parse-checklist.sh tick-checklist.sh detect-ui-change.sh inject-screenshots.sh; do
    test -f "scripts/verify-pr/${f}" || { echo "preflight-boot: missing scripts/verify-pr/${f}" >&2; exit 3; }
done
test -d scripts/stack-runner/node_modules \
    || { echo "preflight-boot: stack-runner deps missing — run 'cd scripts/stack-runner && npm install' first" >&2; exit 3; }

# ── §0 Preflight — soft warnings (degrade the screenshot tour, never fail) ────
test -d scripts/pr-images/node_modules \
    || echo "preflight-boot: WARN — screenshots unavailable (run 'cd scripts/pr-images && npm install --legacy-peer-deps')" >&2

# ── §4 Boot the hermetic stack (one retry, then abort) ────────────────────────
UP_CMD="${STACK_RUNNER_CMD:-npx tsx cli.ts up --pr ${PR}}"
DOWN_CMD="${STACK_DOWN_CMD:-npx tsx cli.ts down --pr ${PR}}"
STACK_OUT=''
BOOT_OK=0

for attempt in 1 2; do
    echo "preflight-boot: stack boot attempt ${attempt}" >&2
    STACK_OUT="$(cd scripts/stack-runner && ${UP_CMD})" && { BOOT_OK=1; break; }
    echo "preflight-boot: boot attempt ${attempt} failed — tearing down" >&2
    (cd scripts/stack-runner && ${DOWN_CMD}) >&2 2>&1 || true
done

if [ "${BOOT_OK}" -ne 1 ]; then
    echo "preflight-boot: stack boot failed twice — aborting (infra error, not a verdict)" >&2
    exit 4
fi

CONTRACT="$(printf '%s\n' "${STACK_OUT}" | grep -E '^(E2E_|STACK_PROJECT_NAME=)')"
if [ -z "${CONTRACT}" ]; then
    echo "preflight-boot: boot succeeded but no contract lines (E2E_*/STACK_PROJECT_NAME) on stdout" >&2
    (cd scripts/stack-runner && ${DOWN_CMD}) >&2 2>&1 || true
    exit 4
fi

# ── §5 Electron (only when a smoker item exists) ──────────────────────────────
if [ "${WANT_ELECTRON}" -eq 1 ]; then
    START_CMD="${ELECTRON_START_CMD:-scripts/verify-pr/electron-launcher.sh start}"
    # The launcher needs the stack contract in its env.
    if ! env $(printf '%s\n' "${CONTRACT}" | xargs) ${START_CMD} >&2; then
        echo "preflight-boot: Electron launch failed — stack left UP for caller decision" >&2
        printf '%s\n' "${CONTRACT}"
        exit 5
    fi
fi

printf '%s\n' "${CONTRACT}"
exit 0
