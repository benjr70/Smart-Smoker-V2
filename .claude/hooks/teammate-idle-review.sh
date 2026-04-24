#!/usr/bin/env bash
# .claude/hooks/teammate-idle-review.sh
# Runs when a teammate is about to go idle. If the idling teammate is the
# `implementer` and there's an unresolved reviewer change-request for any task
# it owns, block the idle so it addresses the feedback first.
#
# Exit codes:
#   0 — nothing to do; allow idle
#   2 — block idle and send feedback
#
# Graceful fallback: if jq is missing or the mailbox file can't be read, exit 0.
# We are not blocking legit idles because of a tooling hiccup.
set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

# Claude Code exports these env vars to hooks per the agent-teams docs.
TEAMMATE_ROLE="${CLAUDE_TEAMMATE_AGENT_TYPE:-}"
TEAM_NAME="${CLAUDE_TEAM_NAME:-}"

# Only enforce on the implementer. Reviewer/verifier/researcher can idle freely.
[[ "$TEAMMATE_ROLE" == "implementer" ]] || exit 0
[[ -n "$TEAM_NAME" ]] || exit 0

TASKS_DIR="$HOME/.claude/tasks/${TEAM_NAME}"
[[ -d "$TASKS_DIR" ]] || exit 0

# Look for any task with status != completed that has an unresolved
# change-request message addressed to the implementer. The task file schema:
# { "id": "...", "status": "in_progress", "messages": [ {"to": "implementer", "kind": "change-request", "resolved": false, "body": "..."} ] }
UNRESOLVED=$(find "$TASKS_DIR" -name '*.json' -print0 2>/dev/null \
  | xargs -0 -I{} jq -r '
      select(.status != "completed")
      | .messages // []
      | map(select(.to == "implementer" and .kind == "change-request" and (.resolved // false) == false))
      | if length > 0 then "\(.[0].taskId // "?"): \(.[0].body // "change requested")" else empty end
    ' {} 2>/dev/null | head -5)

[[ -z "$UNRESOLVED" ]] && exit 0

{
  echo "reviewer has pending change-requests you have not addressed:"
  echo "$UNRESOLVED" | sed 's/^/  - /'
  echo ""
  echo "address each one and re-request review before idling."
} >&2

exit 2
