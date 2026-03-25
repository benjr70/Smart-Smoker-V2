#!/bin/bash
# ralph-once.sh - Human-in-the-loop single Ralph iteration
# Usage: ./scripts/ralph/ralph-once.sh [issue-number]
#
# Picks up one GitHub issue labeled 'ralph' and runs Claude Code
# in acceptEdits mode so you can approve each change.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

# Ensure mise-managed node is in PATH
export PATH="$HOME/.local/share/mise/installs/node/24/bin:$PATH"

# If issue number provided, use it. Otherwise, fetch the next eligible one.
if [ -n "${1:-}" ]; then
  ISSUE_NUMBER="$1"
else
  echo "Fetching next open 'ralph' issue..."
  ISSUE_NUMBER=$(gh issue list --label ralph --state open --json number,labels --limit 20 \
    | jq -r '[.[] | select(.labels | map(.name) | (contains(["ralph:in-progress"]) | not) and (contains(["ralph:done"]) | not))] | .[0].number // empty')

  if [ -z "$ISSUE_NUMBER" ]; then
    echo "No open issues with 'ralph' label found. Nothing to do."
    exit 0
  fi
fi

ISSUE_TITLE=$(gh issue view "$ISSUE_NUMBER" --json title --jq '.title')
ISSUE_BODY=$(gh issue view "$ISSUE_NUMBER" --json body --jq '.body')

echo ""
echo "=== Ralph (HITL) ==="
echo "Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}"
echo ""

# Mark as in-progress
gh issue edit "$ISSUE_NUMBER" --add-label "ralph:in-progress" 2>/dev/null || true

# Build the prompt by substituting placeholders
PROMPT=$(<"$REPO_ROOT/scripts/ralph/ralph-prompt.md")
PROMPT="${PROMPT//\{\{ISSUE_NUMBER\}\}/$ISSUE_NUMBER}"
PROMPT="${PROMPT//\{\{ISSUE_TITLE\}\}/$ISSUE_TITLE}"
PROMPT="${PROMPT//\{\{ISSUE_BODY\}\}/$ISSUE_BODY}"

# Run Claude in acceptEdits mode (you approve each edit)
claude --permission-mode acceptEdits -p "$PROMPT"

# Update local progress file
echo "[$(date -Iseconds)] Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}" >> "$REPO_ROOT/ralph-progress.md"

echo ""
echo "Done with issue #${ISSUE_NUMBER}."
