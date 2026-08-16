#!/bin/bash
# ralph-pr.sh - Open a PR summarizing all Ralph-completed issues
# Usage: ./scripts/ralph/ralph-pr.sh <prd-issue-number> [base-branch]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

PRD_NUMBER="${1:-}"
BASE_BRANCH="${2:-master}"

if [ -z "$PRD_NUMBER" ]; then
  echo "Usage: $0 <prd-issue-number> [base-branch]"
  echo ""
  echo "  prd-issue-number  The parent PRD issue number"
  echo "  base-branch       Branch to merge into (default: master)"
  echo ""
  echo "Example: $0 42"
  exit 1
fi

BRANCH_NAME=$(git branch --show-current)
PRD_TITLE=$(gh issue view "$PRD_NUMBER" --json title --jq '.title')

echo "=== Ralph PR ==="
echo "PRD #${PRD_NUMBER}: ${PRD_TITLE}"
echo "Branch: ${BRANCH_NAME} → ${BASE_BRANCH}"
echo ""

# --- PR title (Conventional Commits, PRD #498) --------------------------------
# The repo squash-merges, so the PR title becomes the commit subject that
# release-please parses for the version bump and changelog. It must therefore
# be `<type>[(scope)][!]: <description>` and must NOT carry the issue
# reference — `Closes #N` lines live in the body, which is what actually
# auto-closes issues on merge.
#
# Overrides (all optional):
#   RALPH_PR_TYPE   conventional type, default `feat`
#   RALPH_PR_SCOPE  optional scope, e.g. `backend`
#   RALPH_PR_TITLE  full title, bypassing derivation (still validated)
VALIDATE_TITLE_SCRIPT="${REPO_ROOT}/scripts/validate-pr-title.sh"

trim() {
  sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' <<<"$1"
}

# Strips the boilerplate "PRD:" / "PRD -" / "PRD —" lead-in so the changelog
# line reads as a description of the change rather than of the tracking
# document.
#
# The en/em dashes are ERE *alternatives*, never members of a bracket
# expression: a bracket expression is a set of characters, and under LC_ALL=C
# (systemd/cron have no locale) each multibyte dash decomposes into its bytes,
# so `[:–—-]` would strip a single byte off a dash and leave mojibake behind.
strip_prd_prefix() {
  trim "$(sed -E 's/^[[:space:]]*PRD[[:space:]]*(:|-|–|—)[[:space:]]*//' <<<"$1")"
}

# Removes any issue reference the PRD title carried. A `Closes #123` that
# survives into the PR title would, on squash-merge, land in the commit subject:
# GitHub would auto-close an unrelated issue and release-please would print the
# ref in the changelog. Issue references belong in the body only.
strip_issue_refs() {
  local subject="$1"
  local nocasematch_was_set=0
  shopt -q nocasematch && nocasematch_was_set=1
  shopt -s nocasematch

  # Closing-keyword references first (the auto-close hazard), then any bare
  # `#123` left over (changelog noise). BASH_REMATCH[0] is removed literally, so
  # each pass strictly shrinks the string and the loops terminate.
  while [[ "$subject" =~ (close[sd]?|fix(e[sd])?|resolve[sd]?)[[:space:]]*#[0-9]+ ]]; do
    subject="${subject//"${BASH_REMATCH[0]}"/}"
  done
  while [[ "$subject" =~ \#[0-9]+ ]]; do
    subject="${subject//"${BASH_REMATCH[0]}"/}"
  done

  [ "$nocasematch_was_set" -eq 1 ] || shopt -u nocasematch

  # Tidy up the separators the removal orphaned (e.g. "Closes #12: sweep").
  subject="$(sed -E 's/[[:space:]]+/ /g; s/^[[:space:]]*[-:,;]+[[:space:]]*//; s/[[:space:]]*[-:,;]+[[:space:]]*$//' <<<"$subject")"
  trim "$subject"
}

build_pr_title() {
  local type="${RALPH_PR_TYPE:-feat}"
  local scope="${RALPH_PR_SCOPE:-}"
  local subject
  subject="$(strip_prd_prefix "$PRD_TITLE")"
  subject="$(strip_issue_refs "$subject")"

  if [ -n "$scope" ]; then
    echo "${type}(${scope}): ${subject}"
  else
    echo "${type}: ${subject}"
  fi
}

PR_TITLE_TEXT="${RALPH_PR_TITLE:-$(build_pr_title)}"

# Pre-flight against the same validator the PR-title check runs, so a bad title
# fails here instead of as a red check on an already-open PR.
if ! env -u PR_TITLE bash "$VALIDATE_TITLE_SCRIPT" "$PR_TITLE_TEXT" >/dev/null; then
  echo "ERROR: refusing to open a PR — the generated title is not a valid conventional-commit subject (reason above)." >&2
  echo "       Title was: '${PR_TITLE_TEXT}'" >&2
  echo "       Set RALPH_PR_TITLE=\"feat(scope): ...\" to override it." >&2
  exit 1
fi

# The validator's legacy guard is ^-anchored, so a ref anywhere else in the
# subject slips through it. Derivation strips those; an explicit
# RALPH_PR_TITLE override could still smuggle one in, and on squash-merge it
# would auto-close an unrelated issue and pollute the changelog.
if [[ "$PR_TITLE_TEXT" =~ \#[0-9]+ ]]; then
  echo "ERROR: refusing to open a PR — the title carries an issue reference ('${BASH_REMATCH[0]}')." >&2
  echo "       Title was: '${PR_TITLE_TEXT}'" >&2
  echo "       Issue references belong in the PR body ('Closes #N'), not in the squash-merge subject." >&2
  exit 1
fi

echo "PR title: ${PR_TITLE_TEXT}"
echo ""

# Gather closed issues with ralph:done label
DONE_ISSUES=$(gh issue list --label "ralph:done" --state closed --json number,title --limit 50 \
  | jq -r '.[] | "- Closes #\(.number): \(.title)"')

if [ -z "$DONE_ISSUES" ]; then
  echo "No completed Ralph issues found. Nothing to create a PR for."
  exit 1
fi

echo "Completed issues:"
echo "$DONE_ISSUES"
echo ""

# Push current branch if needed
if ! git ls-remote --exit-code --heads origin "$BRANCH_NAME" &>/dev/null; then
  echo "Pushing branch to remote..."
  git push -u origin "$BRANCH_NAME"
fi

# Create PR
PR_URL=$(gh pr create \
  --base "$BASE_BRANCH" \
  --head "$BRANCH_NAME" \
  --title "${PR_TITLE_TEXT}" \
  --body "$(cat <<EOF
## Summary

Implementation of PRD #${PRD_NUMBER}: ${PRD_TITLE}

## Completed Issues

${DONE_ISSUES}

## Implementation Notes

See individual issue comments for per-issue implementation details.

## Test plan

- [ ] All app-level tests pass (\`cd apps/<app> && npm test\`)
- [ ] Lint passes (\`npm run lint\`)
- [ ] Format check passes (\`npm run format:check\`)
- [ ] Coverage thresholds met (CI will verify)

---
Generated by [Ralph Loop](scripts/ralph/USAGE.md)
EOF
)")

echo ""
echo "PR created: $PR_URL"
