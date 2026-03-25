# Ralph Loop - Development Flow Guide

Ralph is an autonomous development loop that picks up GitHub issues and implements them using TDD. This guide walks through the full pipeline from idea to pull request.

## Prerequisites

- **Claude CLI** — `curl -fsSL https://claude.ai/install.sh | bash`
- **GitHub CLI** — `gh auth login` (must be authenticated)
- **Node.js** — managed via mise in this project (`mise trust && mise install`)
- **jq** — `sudo dnf install jq` (or your package manager)

## One-Time Setup

```bash
./scripts/ralph/ralph-setup.sh
```

This creates the GitHub labels (`ralph`, `ralph:in-progress`, `ralph:done`) and verifies all prerequisites are installed.

## The Pipeline

### Step 1: Stress-Test Your Idea

Open Claude Code and run:

```
/grill-me
```

Describe your feature idea. Claude will interview you relentlessly, walking down every branch of the decision tree until you've thought through all the edge cases. This is where half-baked ideas become solid plans.

### Step 2: Write the PRD

Once you have a clear vision from the grilling session, run:

```
/write-a-prd
```

Claude will explore the codebase, interview you about specifics, and create a formal PRD as a GitHub issue. The PRD includes problem statement, user stories, implementation decisions, and testing decisions.

### Step 3: Break Into Issues

With your PRD issue created, run:

```
/prd-to-issues
```

Give it the PRD issue number. Claude breaks the PRD into thin vertical slices — each one cuts through all layers (schema, API, UI, tests) end-to-end. Issues are created in dependency order with:
- Acceptance criteria
- Interface changes (what modules to modify)
- Behaviors to test (the TDD plan)
- Testing priority (critical vs nice-to-have)
- Blocked-by references

AFK slices automatically get the `ralph` label.

### Step 4: Create a Feature Branch

```bash
git checkout -b feat/<feature-name>
```

Ralph operates on whatever branch you're on. All commits for this PRD go on this branch.

### Step 5a: Human-in-the-Loop (Recommended First Time)

Watch Ralph implement one issue with you approving each edit:

```bash
# Auto-select the next eligible issue
./scripts/ralph/ralph-once.sh

# Or specify an issue number
./scripts/ralph/ralph-once.sh 42
```

This runs Claude in `acceptEdits` mode — you see every change and approve it. Good for building confidence before going fully autonomous.

### Step 5b: Go Autonomous (AFK)

Let Ralph implement multiple issues without intervention:

```bash
# Implement up to 10 issues
./scripts/ralph/ralph-afk.sh 10

# With Docker sandbox isolation (optional)
./scripts/ralph/ralph-afk.sh 10 --sandbox
```

Ralph will:
1. Pick the next open issue with the `ralph` label
2. Check if it's blocked (skip if so)
3. Implement it using TDD (red-green-refactor, one test at a time)
4. Run tests from the correct app directory
5. Lint and format
6. Commit with `Closes #<issue-number>`
7. Update the GitHub issue (comment, close, label as done)
8. Move to the next issue

The loop stops when:
- No more eligible issues remain
- Max iterations reached
- Claude outputs the COMPLETE signal

### Step 6: Review and PR

Review what Ralph did:

```bash
# Check the local progress log
cat ralph-progress.md

# See all commits
git log --oneline

# Check GitHub issue status
gh issue list --label ralph:done --state closed
```

When satisfied, open a PR:

```bash
# Creates a PR referencing the parent PRD and all completed issues
./scripts/ralph/ralph-pr.sh <prd-issue-number>

# Or target a different base branch
./scripts/ralph/ralph-pr.sh <prd-issue-number> develop
```

## Monitoring

### Local Progress Log

`ralph-progress.md` (gitignored) contains timestamped entries for each iteration:

```
[2026-03-24T10:00:00-05:00] Ralph AFK started (max 10 iterations)
[2026-03-24T10:05:32-05:00] Iteration 1 - Issue #43: Add temp alert WebSocket event
[2026-03-24T10:12:18-05:00] Iteration 2 - Issue #44: Add alert threshold to settings
[2026-03-24T10:12:18-05:00] BLOCKED: #45 by #46
[2026-03-24T10:20:01-05:00] ALL COMPLETE after 3 iterations
```

### GitHub Labels

Check issue status via labels:
- `ralph` — eligible for pickup
- `ralph:in-progress` — currently being worked on
- `ralph:done` — completed and closed

```bash
# See what's left
gh issue list --label ralph --state open

# See what's done
gh issue list --label ralph:done --state closed

# See what's stuck
gh issue list --label "ralph:in-progress" --state open
```

## Troubleshooting

### Issue is stuck with `ralph:in-progress`

If Ralph crashed mid-iteration, the label stays. Remove it manually:

```bash
gh issue edit <number> --remove-label "ralph:in-progress"
```

### Blocked issues never get unblocked

Ralph skips blocked issues but doesn't retry them later in the same run. If a blocker gets resolved during the run, start a new Ralph run to pick up the unblocked issues.

### Tests fail in CI but passed locally

Check that coverage thresholds are met (see CLAUDE.md for per-app thresholds). Ralph runs `npm test` which includes coverage, but CI may have stricter checks.

### Ralph made a bad commit

Review and fix interactively, then continue:

```bash
# Fix the issue manually or with Claude Code
# Then resume Ralph for remaining issues
./scripts/ralph/ralph-afk.sh 5
```

### Want to re-run a completed issue

Remove the `ralph:done` label and reopen the issue:

```bash
gh issue reopen <number>
gh issue edit <number> --remove-label "ralph:done"
```
