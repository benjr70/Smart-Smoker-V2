---
name: review-pr
description: Review a pull request by categorizing changed files and spawning specialized subagent reviewers based on what changed. Use when user wants to review a PR, asks for code review, or mentions "review PR".
disable-model-invocation: true
argument-hint: "[PR number or branch name]"
---

# PR Review Skill

Review a pull request by analyzing what changed and conditionally spawning specialized reviewers.

## Step 1: Identify the PR

If `$ARGUMENTS` is a number, use it as the PR number. Otherwise, detect from the current branch:

```!
git branch --show-current
```

Get the PR number and base branch:
```bash
gh pr view $ARGUMENTS --json number,baseRefName,title,body --jq '{number, baseRefName, title, body}'
```

If no PR exists for the current branch, tell the user and stop.

## Step 2: Get the diff

Get the list of changed files and diff stats:
```bash
gh pr diff $PR_NUMBER --name-only
gh pr diff $PR_NUMBER --stat
git log $(gh pr view $PR_NUMBER --json baseRefName --jq .baseRefName)...HEAD --oneline
```

## Step 3: Classify changed files

Categorize each changed file into review domains. A file can match multiple domains:

| File Pattern | Domain | Reviewer |
|---|---|---|
| `*.schema.ts`, `*Dto.ts`, `*dto.ts`, `*.module.ts` under `apps/backend/` | **DB Safety** | [db-safety.md](reviewers/db-safety.md) |
| `*/websocket/*`, `*/events.*`, files importing `socket.io` or `Socket` | **Event Contract** | [event-contract.md](reviewers/event-contract.md) |
| `infra/**`, `*docker-compose*`, `Dockerfile*`, `*.tf`, `.github/workflows/*`, `*.yml` under `infra/` | **Infrastructure** | [infra.md](reviewers/infra.md) |
| Files under `apps/` or `packages/` with test coverage thresholds | **Coverage** | [coverage.md](reviewers/coverage.md) |
| All changed files | **General** | [general.md](reviewers/general.md) |

## Step 4: Spawn reviewers

For each triggered domain, spawn a subagent using the Agent tool. **Spawn all independent reviewers in parallel** (single message, multiple Agent tool calls).

Each subagent receives:
1. The reviewer instructions from the corresponding `reviewers/*.md` file
2. The list of files matching that domain
3. The diff for those files (via `gh pr diff $PR_NUMBER`)
4. Context from CLAUDE.md (the subagent loads this automatically)

**Only spawn reviewers for domains with matching files.** The General reviewer always runs.

## Step 5: Aggregate findings

Collect all subagent results and produce a structured review:

```markdown
## PR Review: #<number> -- <title>

### Summary
- **Files changed**: N
- **Reviewers triggered**: [list]
- **Risk level**: LOW / MEDIUM / HIGH / CRITICAL

### Findings

#### [Domain Name] (if triggered)
- Finding 1
- Finding 2

### Recommended Actions
- [ ] Action 1
- [ ] Action 2
```

**Risk level guidelines:**
- **LOW**: Only general code quality findings, no schema/event/infra changes
- **MEDIUM**: Schema additions (new fields with defaults) or minor infra changes
- **HIGH**: Schema modifications to existing fields, event name changes, Terraform resource changes
- **CRITICAL**: Breaking schema changes, missing data migrations, security issues in infra

## Step 6: Post review (optional)

Ask the user if they want to post the review as a PR comment:
```bash
gh pr comment $PR_NUMBER --body "$REVIEW_CONTENT"
```
