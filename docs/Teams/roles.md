# Roles

The four teammate roles are defined as Claude Code subagent definitions in [`.claude/agents/`](https://github.com/benjr70/Smart-Smoker-V2/tree/master/.claude/agents). Each file has frontmatter (`name`, `description`, `tools`, `model`) and a body that is appended to the teammate's system prompt. The lead spawns teammates by name; Claude Code resolves the definition from `.claude/agents/<name>.md`.

All four roles run on **Opus**. Separation is enforced by the tool allowlist and the prompt — not by model choice. A follow-up can demote reviewer/verifier/researcher to a cheaper model once real runs show where the lighter model holds up.

## implementer

**File**: [`.claude/agents/implementer.md`](https://github.com/benjr70/Smart-Smoker-V2/blob/master/.claude/agents/implementer.md)
**Tools**: `Read, Edit, Write, Bash, Glob, Grep`
**Spawned**: up front by the team lead, one per team.

Owns TDD red-green-refactor for one issue at a time. Claims the next unblocked implementation task from the shared task list, reads the issue + any researcher memo in the task description, writes one failing test, implements, runs tests from inside the app dir, moves to the next test. Stages files, writes the commit subject + `Closes #N` line, but does **not** commit — the verifier owns the final commit (with the `smoke:` trailer).

Watches for plan-approval gating: if the issue modifies `apps/backend/src/**/*.service.ts`, `apps/device-service/src/main.ts`, `infra/**`, or `docker-compose*.yml`, it enters plan mode, submits the plan to the lead, and waits for approval before implementing.

## reviewer

**File**: [`.claude/agents/reviewer.md`](https://github.com/benjr70/Smart-Smoker-V2/blob/master/.claude/agents/reviewer.md)
**Tools**: `Read, Grep, Glob, Bash` (read-only `git`)
**Spawned**: up front by the team lead, one per team.

Reads the implementer's staged diff before commit, applies the [`review-pr`](https://github.com/benjr70/Smart-Smoker-V2/tree/master/.claude/skills/review-pr) checklist (DB safety, event contracts, infra, coverage, general patterns), posts one of two messages via the mailbox:

- `approved for task <id>` — the verifier can now commit
- `change-request for task <id>: <asks>` — the implementer must address each ask

**No `Edit` or `Write` in the tool allowlist.** This is the implementer/reviewer separation the blog calls out — the reviewer must not fix what it flags. If the reviewer could edit, it would drift toward "I know what you meant, here's the patch" and the signal of independent review disappears.

What the reviewer checks extra carefully: mocks of internal collaborators (only system boundaries should be mocked), test-through-public-interface (no private introspection), commit scope creep (files unrelated to the issue), coverage regressions (behaviors listed in the issue without tests), plan-mode bypass on gated files.

## verifier

**File**: [`.claude/agents/verifier.md`](https://github.com/benjr70/Smart-Smoker-V2/blob/master/.claude/agents/verifier.md)
**Tools**: `Read, Bash`
**Spawned**: up front by the team lead, one per team.

Runs [`scripts/smoke/run.ts`](https://github.com/benjr70/Smart-Smoker-V2/blob/master/scripts/smoke/run.ts) against local services after the reviewer approves the implementer's diff, captures the exit code, appends the `smoke: PASS|FAIL|SKIPPED — <detail>` trailer to the implementer's staged commit message, and lands the commit.

Trailer rules (same contract as [`docs/Harness/self-validation.md`](../Harness/self-validation.md#ralph-self-validation)):

- Exit code `0` → `smoke: PASS — <n>/<n> probes green`, commit proceeds
- Exit code `1` → `smoke: FAIL — <detail>`, **no commit**, post back to implementer
- Cannot run (services down, no chromium) → `smoke: SKIPPED — <reason>`, commit proceeds with trailer

The [`task-completed-smoke.sh`](https://github.com/benjr70/Smart-Smoker-V2/blob/master/.claude/hooks/task-completed-smoke.sh) hook independently re-checks the trailer when the task is marked completed, so a verifier that forgets the trailer gets caught.

## researcher

**File**: [`.claude/agents/researcher.md`](https://github.com/benjr70/Smart-Smoker-V2/blob/master/.claude/agents/researcher.md)
**Tools**: `Read, Grep, Glob, WebFetch`
**Spawned**: on-demand by the team lead, one per issue with a non-trivial "Interface Changes" section. Exits after writing its memo.

Read-only codebase explorer. Writes a short memo into the implementation task's description before the implementer starts. Memo format:

```
## Research memo for task <id>

### Current state
### Reusable utilities
### Gotchas
### Recommended approach
```

**No `Bash`, no `Edit`, no `Write`.** The only surface the researcher can mutate is the task description via the shared task list. This keeps the researcher scoped to reconnaissance — it cannot accidentally run tests, check git state, or touch files. If the issue is trivial (one-file change with an obvious implementation), the researcher reports "no memo needed" and marks its task completed empty.

## How the lead chooses which to spawn

From [`.claude/skills/team-dispatch/SKILL.md`](https://github.com/benjr70/Smart-Smoker-V2/blob/master/.claude/skills/team-dispatch/SKILL.md):

- **Implementer, reviewer, verifier** — always spawned up front as persistent teammates. They outlive individual tasks and claim new work as it becomes available.
- **Researcher** — spawned per issue with a non-trivial "Interface Changes" section (three or more modules, or any infra touch). The researcher's task `blocks` the implementer's task, so the implementer waits for the memo before claiming work.
