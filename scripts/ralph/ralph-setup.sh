#!/bin/bash
# ralph-setup.sh - One-time setup for the Ralph autonomous development loop
# Creates GitHub labels and verifies prerequisites
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "=== Ralph Setup ==="
echo ""

# Check prerequisites
MISSING=0

if ! command -v claude &>/dev/null; then
  # Try mise-managed path
  if [ -x "$HOME/.local/share/mise/installs/node/24/bin/claude" ]; then
    echo "[ok] claude CLI (via mise node path)"
  else
    echo "[MISSING] claude CLI - install: curl -fsSL https://claude.ai/install.sh | bash"
    MISSING=1
  fi
else
  echo "[ok] claude CLI"
fi

if ! command -v gh &>/dev/null; then
  echo "[MISSING] gh CLI - install: https://cli.github.com/"
  MISSING=1
else
  if gh auth status &>/dev/null; then
    echo "[ok] gh CLI (authenticated)"
  else
    echo "[MISSING] gh CLI not authenticated - run: gh auth login"
    MISSING=1
  fi
fi

if ! command -v node &>/dev/null; then
  if [ -x "$HOME/.local/share/mise/installs/node/24/bin/node" ]; then
    echo "[ok] node (via mise - remember to activate mise or add to PATH)"
  else
    echo "[MISSING] node - this project uses mise: https://mise.jdx.dev/"
    MISSING=1
  fi
else
  echo "[ok] node $(node --version)"
fi

if ! command -v jq &>/dev/null; then
  echo "[MISSING] jq - install: sudo dnf install jq (or your package manager)"
  MISSING=1
else
  echo "[ok] jq"
fi

if [ "$MISSING" -eq 1 ]; then
  echo ""
  echo "Please install missing prerequisites before using Ralph."
  exit 1
fi

echo ""
echo "Creating GitHub labels..."

gh label create "ralph" \
  --description "Issue eligible for autonomous Ralph loop implementation" \
  --color "5319E7" 2>/dev/null && echo "  Created: ralph" || echo "  Exists: ralph"

gh label create "ralph:in-progress" \
  --description "Currently being implemented by Ralph loop" \
  --color "FBCA04" 2>/dev/null && echo "  Created: ralph:in-progress" || echo "  Exists: ralph:in-progress"

gh label create "ralph:done" \
  --description "Completed by Ralph loop" \
  --color "0E8A16" 2>/dev/null && echo "  Created: ralph:done" || echo "  Exists: ralph:done"

# Ensure ralph-progress.md is gitignored
if ! grep -q "ralph-progress.md" "$REPO_ROOT/.gitignore" 2>/dev/null; then
  echo "" >> "$REPO_ROOT/.gitignore"
  echo "# Ralph loop progress log" >> "$REPO_ROOT/.gitignore"
  echo "ralph-progress.md" >> "$REPO_ROOT/.gitignore"
  echo ""
  echo "Added ralph-progress.md to .gitignore"
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Run /grill-me to stress-test your feature idea"
echo "  2. Run /write-a-prd to create a PRD as a GitHub issue"
echo "  3. Run /prd-to-issues to break it into issues (AFK slices get 'ralph' label)"
echo "  4. Run ./scripts/ralph/ralph-once.sh to implement one issue (human-in-the-loop)"
echo "  5. Run ./scripts/ralph/ralph-afk.sh <iterations> to go autonomous"
echo ""
echo "See scripts/ralph/USAGE.md for the full workflow guide."
