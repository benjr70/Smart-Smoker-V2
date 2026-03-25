#!/bin/bash
# ralph-afk.sh - Fully autonomous Ralph loop with iteration cap
# Usage: ./scripts/ralph/ralph-afk.sh <max-iterations> [--sandbox]
#
# Loops through GitHub issues labeled 'ralph', implementing each one
# autonomously using Claude Code in full permission mode.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

# Ensure mise-managed node is in PATH
export PATH="$HOME/.local/share/mise/installs/node/24/bin:$PATH"

# Parse arguments
MAX_ITERATIONS="${1:-}"
USE_SANDBOX="${2:-}"

if [ -z "$MAX_ITERATIONS" ] || ! [[ "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
  echo "Usage: $0 <max-iterations> [--sandbox]"
  echo ""
  echo "  max-iterations  Number of issues to process (positive integer)"
  echo "  --sandbox       Run Claude inside Docker sandbox (optional)"
  echo ""
  echo "Example: $0 10"
  exit 1
fi

echo "=== Ralph AFK Loop ==="
echo "Max iterations: $MAX_ITERATIONS"
echo "Mode: $([ "$USE_SANDBOX" = "--sandbox" ] && echo "Docker sandbox" || echo "local")"
echo "Start: $(date -Iseconds)"
echo ""
echo "[$(date -Iseconds)] Ralph AFK started (max $MAX_ITERATIONS iterations)" >> "$REPO_ROOT/ralph-progress.md"

for ((i=1; i<=MAX_ITERATIONS; i++)); do
  echo ""
  echo "=== Iteration $i / $MAX_ITERATIONS ==="

  # Fetch next eligible issue (open, labeled 'ralph', not in-progress or done)
  ISSUE_NUMBER=$(gh issue list --label ralph --state open --json number,labels --limit 20 \
    | jq -r '[.[] | select(.labels | map(.name) | (contains(["ralph:in-progress"]) | not) and (contains(["ralph:done"]) | not))] | .[0].number // empty')

  if [ -z "$ISSUE_NUMBER" ]; then
    echo "No more eligible 'ralph' issues. All done after $((i-1)) iterations."
    echo "[$(date -Iseconds)] COMPLETE after $((i-1)) iterations" >> "$REPO_ROOT/ralph-progress.md"
    exit 0
  fi

  ISSUE_TITLE=$(gh issue view "$ISSUE_NUMBER" --json title --jq '.title')
  ISSUE_BODY=$(gh issue view "$ISSUE_NUMBER" --json body --jq '.body')

  echo "Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}"

  # Mark as in-progress
  gh issue edit "$ISSUE_NUMBER" --add-label "ralph:in-progress" 2>/dev/null || true

  # Build prompt
  PROMPT=$(<"$REPO_ROOT/scripts/ralph/ralph-prompt.md")
  PROMPT="${PROMPT//\{\{ISSUE_NUMBER\}\}/$ISSUE_NUMBER}"
  PROMPT="${PROMPT//\{\{ISSUE_TITLE\}\}/$ISSUE_TITLE}"
  PROMPT="${PROMPT//\{\{ISSUE_BODY\}\}/$ISSUE_BODY}"

  # Execute Claude
  if [ "$USE_SANDBOX" = "--sandbox" ]; then
    RESULT=$(docker sandbox run claude --permission-mode full -p "$PROMPT" 2>&1) || true
  else
    RESULT=$(claude --permission-mode full -p "$PROMPT" 2>&1) || true
  fi

  echo "$RESULT"

  # Update local progress
  echo "[$(date -Iseconds)] Iteration $i - Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}" >> "$REPO_ROOT/ralph-progress.md"

  # Check for BLOCKED signal
  if [[ "$RESULT" == *"<ralph>BLOCKED"* ]]; then
    BLOCKED_BY=$(echo "$RESULT" | grep -oP '<ralph>BLOCKED #\K[0-9]+' || echo "unknown")
    echo ""
    echo "Issue #${ISSUE_NUMBER} is blocked by #${BLOCKED_BY}. Skipping."
    gh issue edit "$ISSUE_NUMBER" --remove-label "ralph:in-progress" 2>/dev/null || true
    echo "[$(date -Iseconds)] BLOCKED: #${ISSUE_NUMBER} by #${BLOCKED_BY}" >> "$REPO_ROOT/ralph-progress.md"
    continue
  fi

  # Check for FAILED signal
  if [[ "$RESULT" == *"<ralph>FAILED"* ]]; then
    echo ""
    echo "Issue #${ISSUE_NUMBER} failed. Skipping."
    gh issue edit "$ISSUE_NUMBER" --remove-label "ralph:in-progress" 2>/dev/null || true
    echo "[$(date -Iseconds)] FAILED: #${ISSUE_NUMBER}" >> "$REPO_ROOT/ralph-progress.md"
    continue
  fi

  # Check for COMPLETE signal (all issues done)
  if [[ "$RESULT" == *"<ralph>COMPLETE</ralph>"* ]]; then
    echo ""
    echo "All PRD issues complete after $i iterations."
    echo "[$(date -Iseconds)] ALL COMPLETE after $i iterations" >> "$REPO_ROOT/ralph-progress.md"
    exit 0
  fi

done

echo ""
echo "Reached max iterations ($MAX_ITERATIONS). Stopping."
echo "[$(date -Iseconds)] Reached max iterations ($MAX_ITERATIONS)" >> "$REPO_ROOT/ralph-progress.md"
