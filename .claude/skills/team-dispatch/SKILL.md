---
name: team-dispatch
description:
  Orchestrate a Claude Code agent team (implementer, reviewer, verifier,
  researcher) to implement every open issue labeled `team` for a given PRD. Use
  when the user wants Level 7 autonomous implementation via Agent Teams (not
  Ralph). Invoke with the PRD issue number.
---

# Team Dispatch — Level 7 Agent Team Orchestration

You are becoming the **team lead** for a Claude Code agent team. This skill is
the playbook you execute: pre-flight, read the PRD, spawn the roster, populate
the shared task list, coordinate the flow, and clean up when work is done.

There is **no external bootstrap script**. Everything Agent Teams needs to run
lives inside this skill — pre-flight checks, GitHub label creation, env-flag
verification — so a fresh clone can dispatch a team without touching bash first.

## Invocation

```
/team-dispatch <prd-issue-number> [--dry-run]
```

- `<prd-issue-number>` — the parent PRD GitHub issue (e.g. 183).
- `--dry-run` — print the planned roster + task list and exit, do NOT spawn
  teammates.

## Process

### 0. Pre-flight (idempotent — runs every dispatch)

Before any other work, verify the host is ready and the GitHub labels exist. All
checks are cheap; all mutations are idempotent. If any check fails, stop and
tell the user exactly which prerequisite is missing.

**Tooling:**

```bash
claude --version            # parse vX.Y.Z; require >= 2.1.32 (Agent Teams landed in 2.1.32)
gh auth status              # must succeed; if not, instruct: gh auth login
command -v jq               # required by the TeammateIdle hook; install via package manager if missing
```

**Env flag:**

```bash
grep -q '"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS"\s*:\s*"1"' .claude/settings.json
```

If absent, stop. The lead cannot spawn teammates without the experimental flag
set in the project-scoped settings.

**GitHub labels (create-if-missing):**

```bash
gh label create "team"             --description "Issue eligible for Level 7 agent team implementation" --color "1D76DB" --force
gh label create "team:in-progress" --description "Currently being implemented by an agent team"          --color "FBCA04" --force
gh label create "team:done"        --description "Completed by an agent team"                            --color "0E8A16" --force
```

`--force` is idempotent: creates the label if absent, updates the metadata if
present, never errors. Skip if
`gh label list --json name | jq -r '.[].name' | grep -qx team` already shows all
three.

**Stale `team:in-progress`** — sweep before claiming new work:

```bash
gh issue list --label team:in-progress --state open --json number | jq -r '.[].number' | \
  while read N; do gh issue edit "$N" --remove-label team:in-progress; done
```

(The shared task list will re-apply the label when an implementer claims an
issue.)

### 1. Read the PRD + work queue

```bash
gh issue view <prd-issue-number> --json title,body,labels
gh issue list --label team --state open --json number,title,body,labels --limit 50
```

Filter the issue list to those that are:

- **not** labeled `team:in-progress` (already claimed)
- **not** labeled `team:done` (already completed)
- whose `body` does not reference an unresolved blocker in a "Blocked by"
  section

Group the remaining issues by dependency (topological sort on "Blocked by"
references). The task list populated in step 3 will mirror this order.

### 2. Dry-run short-circuit

If the user passed `--dry-run`:

```
=== /team-dispatch <prd>: dry run ===

Roster:
  - implementer (opus, Edit/Write/Bash/Read/Grep/Glob)
  - reviewer    (opus, Read/Grep/Glob/Bash — no Edit/Write)
  - verifier    (opus, Read/Bash)
  - researcher  (opus, Read/Grep/Glob/WebFetch — spawned on-demand)

Tasks (<N> total, in dependency order):
  #<issue>  <title>                       (unblocked)
  #<issue>  <title>                       (blocked_by #<issue>)
  ...
```

Stop. Do NOT spawn teammates.

### 3. Spawn the roster

Spawn three persistent teammates up front, using the subagent definitions in
`.claude/agents/`:

```
Spawn a teammate using the implementer agent type. Name it `impl`.
Spawn a teammate using the reviewer agent type. Name it `rev`.
Spawn a teammate using the verifier agent type. Name it `ver`.
```

Do NOT spawn the researcher up front. Spawn one per issue that has a non-trivial
"Interface Changes" section (three or more modules listed, or any infra touch),
and let it shut down after writing its memo.

### 4. Populate the shared task list

For each issue from step 1, create a task with:

- `subject` — the issue title
- `description` — the issue body, verbatim
- `blocked_by` — the task IDs of any "Blocked by" issues already in the list
- `metadata.issue_number` — so teammates can `gh issue edit` without reparsing

For each issue needing research (heuristic above), create a separate
`research-for-<issue>` task and mark the issue task `blocked_by` it. The
researcher claims research tasks; the implementer claims implementation tasks.

### 5. Flow per issue

The lead's job during the run is coordination and mailbox relay. The teammates
self-claim unblocked tasks. Expected flow per issue:

1. **Researcher** (if spawned) claims `research-for-<issue>`, reads the issue +
   codebase, writes the memo into the implementation task's description, marks
   its task completed. The research task unblocks the implementation task.
2. **Implementer** claims the implementation task:
   - Adds `team:in-progress` label to the GitHub issue:
     `gh issue edit <N> --add-label team:in-progress`
   - Reads the memo + issue, drives TDD, stages files
   - Writes the commit subject + `Closes #N` line (but does not commit)
   - Messages `rev`: "ready for review on task <id>"
3. **Reviewer** reads the staged diff (`git diff --staged`), applies the
   `.claude/skills/review-pr/` checklist, messages the implementer either
   `approved for task <id>` or `change-request for task <id>: <asks>`. On
   change-request, the implementer iterates and re-signals.
4. **Verifier** sees the `approved` message (implementer forwards it to `ver`),
   runs `scripts/smoke/run.ts`, appends the `smoke:` trailer to the commit
   message, commits.
5. **Implementer** closes the loop:
   - `gh issue edit <N> --remove-label team:in-progress --add-label team:done`
   - `gh issue close <N>`
   - Marks the implementation task completed (the `TaskCompleted` hook verifies
     the `smoke:` trailer is present in HEAD; if missing, the task stays
     in-progress).

### 6. Plan-approval gating

Watch for issues whose body modifies files in any of these paths:

- `apps/backend/src/**/*.service.ts`
- `apps/device-service/src/main.ts`
- `infra/**`
- `docker-compose*.yml`

When the implementer enters plan mode for one of those, the reviewer advises you
(the lead). Approve only if:

- The plan addresses every acceptance criterion
- The plan does not modify files outside the issue's scope
- Tests are explicit — not "add tests" but "test X behavior through Y surface"

If the plan is thin, reject with specific feedback. The implementer stays in
plan mode until you approve.

### 7. Handle `BLOCKED` + `FAILED`

- If the implementer messages `BLOCKED #<blocker>`, check
  `gh issue view <blocker> --json state`. If open, release the task back to
  pending and tell the implementer to pick a different unblocked task.
- If the verifier messages `smoke FAIL on task <id>`, the task stays
  in-progress. Tell the implementer to investigate and re-signal when ready. Do
  not skip.

### 8. Completion + cleanup

When the task list is empty (all implementation tasks marked completed) AND
`gh issue list --label team --state open --json number | jq length` returns `0`:

1. Tell each teammate to shut down: "Ask the <name> teammate to shut down."
2. After all teammates have exited, run: "Clean up the team."
3. Report to the user:
   ```
   === /team-dispatch <prd>: complete ===
   Issues closed: <list>
   Commits: <N>
   ```

## Output format

During the run, keep a structured log in the lead's chat:

```
[task <id>] <issue title>
  researcher: memo written
  implementer: tests written, implementation committed-ready
  reviewer: approved
  verifier: smoke PASS
  closed #<issue>
```

One block per completed task. Compact.

## Failure modes

- **Teammate stops unexpectedly**: spawn a replacement of the same role; the
  shared task list preserves state.
- **Orphaned `team:in-progress` label**: at dispatch start, check for open
  issues with `team:in-progress` but no active task. Remove the stale label
  before claiming new work: `gh issue edit <N> --remove-label team:in-progress`.
- **Lead shutting down before work is done** (known CCT limitation): if you
  realize you're about to quit while tasks remain, spawn a replacement teammate
  for any missing role and resume; never call "clean up the team" unless the
  task list is actually empty.
- **`TaskCompleted` hook blocks a task**: that means the verifier committed
  without a `smoke:` trailer. Ask the verifier to amend the HEAD commit with the
  correct trailer (`git commit --amend -m "<body with trailer>"`), then re-mark
  the task completed.
- **tmux not installed** (split-pane mode): fall back to in-process mode with
  `claude --teammate-mode in-process`. All coordination still works; you just
  won't have a dedicated pane per teammate.

## Boundaries

- Do NOT touch `scripts/ralph/`. Ralph is a separate Level 6 loop with its own
  labels (`ralph`, `ralph:in-progress`, `ralph:done`). A `team`-labeled issue
  must not also carry `ralph`.
- Do NOT invoke `ralph-pr.sh` or `ralph-afk.sh` from inside the team run. PR
  opening is a separate human-gated step after all tasks complete.
- Do NOT spawn more than one team per session (CCT limitation). If the user
  wants a second team on a different PRD, they must start a fresh session.
