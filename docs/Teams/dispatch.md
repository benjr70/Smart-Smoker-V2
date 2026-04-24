# Dispatch

The team runs inside a normal Claude Code session — the running `claude` process becomes the team lead. There is no external launcher and no setup script. Everything flows through the [`team-dispatch`](https://github.com/benjr70/Smart-Smoker-V2/blob/master/.claude/skills/team-dispatch/SKILL.md) skill, which self-bootstraps on every dispatch (Step 0 of the playbook).

## Self-bootstrap (Step 0 of the skill)

The first thing the lead does on every `/team-dispatch` invocation is pre-flight + label bootstrap. All checks are cheap; all mutations are idempotent. Specifically:

1. Verifies `claude --version ≥ 2.1.32` (Agent Teams landed in 2.1.32).
2. Verifies `gh` is authenticated and `jq` is installed (the `TeammateIdle` hook needs `jq`).
3. Creates the GitHub labels `team` (blue), `team:in-progress` (yellow), `team:done` (green) via `gh label create --force` — creates if absent, updates if present, never errors.
4. Confirms `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set in `.claude/settings.json`.
5. Sweeps stale `team:in-progress` labels off any open issue with no active task in the shared list.

If any of 1–4 fails, the lead stops and tells you exactly what to install or set. There is intentionally no separate bootstrap script — keeping pre-flight inline with the dispatch playbook means a fresh clone can dispatch a team without first running bash.

## Invocation

```
/team-dispatch <prd-issue-number>              # full run
/team-dispatch <prd-issue-number> --dry-run    # print roster + task list, don't spawn
```

`--dry-run` output:

```
=== /team-dispatch 183: dry run ===

Roster:
  - implementer (opus, Edit/Write/Bash/Read/Grep/Glob)
  - reviewer    (opus, Read/Grep/Glob/Bash — no Edit/Write)
  - verifier    (opus, Read/Bash)
  - researcher  (opus, Read/Grep/Glob/WebFetch — spawned on-demand)

Tasks (4 total, in dependency order):
  #201  Add /api/smokes endpoint             (unblocked)
  #202  Wire /api/smokes to frontend list    (blocked_by #201)
  #203  Add rating column to smokes          (unblocked)
  #204  Display rating in history            (blocked_by #203)
```

## Playbook (what the lead does)

Full version: [`.claude/skills/team-dispatch/SKILL.md`](https://github.com/benjr70/Smart-Smoker-V2/blob/master/.claude/skills/team-dispatch/SKILL.md). Short version:

1. Read PRD (`gh issue view <prd>`) and open `team`-labeled issues (`gh issue list --label team --state open`).
2. Spawn implementer, reviewer, verifier as persistent teammates. Spawn researcher on-demand per issue with non-trivial "Interface Changes".
3. Populate the shared task list — one task per issue, `blocked_by` mirrors each issue's "Blocked by" section. Research tasks block their paired implementation tasks.
4. Coordinate the flow per issue: researcher memo → implementer claims + codes + stages → reviewer approves → verifier smokes + commits → implementer advances labels + closes issue.
5. Handle `BLOCKED` (release task to pending) and `smoke FAIL` (task stays in-progress; implementer re-iterates).
6. On empty queue: shut down each teammate, then run team cleanup.

## Label flow

```
team                → implementer claims, adds team:in-progress
team:in-progress    → reviewer approves + verifier commits
                    → implementer removes team:in-progress, adds team:done
team:done           → issue closed
```

Same pattern as Ralph, different label prefix. Do not mix — an issue must not carry both `team` and `ralph`.

## Hooks

Two quality gates attach via the Agent Teams hook surface (registered in `.claude/settings.json`):

### `TaskCompleted` → `task-completed-smoke.sh`

Runs when a teammate marks a task completed. Reads the latest commit's body. If the body looks like a team commit (conventional-commit subject + `Closes #N`) but lacks a `smoke: PASS|FAIL|SKIPPED` trailer, the hook exits `2` with a feedback message and the task stays in-progress. Verifier must amend the commit with the correct trailer.

Graceful fallback: if `git` fails or the commit doesn't match the team-commit shape, the hook exits `0` — we don't block on transient state or unrelated commits.

### `TeammateIdle` → `teammate-idle-review.sh`

Runs when a teammate is about to go idle. For the **implementer** only: reads the shared task list (`~/.claude/tasks/<team-name>/*.json`) and looks for unresolved reviewer change-requests addressed to the implementer. If any are pending, exits `2` with the list of asks. The implementer cannot idle on a task with open review comments.

Reviewer, verifier, and researcher idle freely — they have no pending-work contract analogous to open review comments.

Graceful fallback: if `jq` is missing or the task files can't be read, exits `0`. We don't block legit idles because of a tooling hiccup.

## Troubleshooting

- **Teammate stops unexpectedly** — spawn a replacement of the same role. The shared task list preserves state, and the new teammate picks up where the previous one left off.
- **Orphaned `team:in-progress` label** — at dispatch start, the lead checks for open issues labeled `team:in-progress` with no active task in the task list. Stale labels are removed before claiming new work.
- **Lead shuts down before work is done** (known CCT limitation) — if you realize you're about to quit while tasks remain, spawn a replacement teammate for any missing role and resume. Never run "clean up the team" unless the task list is empty.
- **`TaskCompleted` hook blocks a task** — the verifier committed without a `smoke:` trailer. Amend the HEAD commit with the correct trailer (`git commit --amend`) and re-mark the task completed.
- **tmux not installed** — split-pane mode needs tmux or iTerm2. Fall back to in-process mode: `claude --teammate-mode in-process`. All coordination still works; you just cycle teammates with Shift+Down instead of clicking panes.
- **Agent Teams disabled** — check `.claude/settings.json` contains `"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"` in the `env` block. Without it, the lead cannot spawn teammates — `/team-dispatch` will fail fast.

## Related

- [Roles](roles.md) — the four subagent definitions
- [`.claude/skills/team-dispatch/SKILL.md`](https://github.com/benjr70/Smart-Smoker-V2/blob/master/.claude/skills/team-dispatch/SKILL.md) — the full playbook
- [`docs/Harness/self-validation.md`](../Harness/self-validation.md) — the `smoke:` trailer contract the verifier produces
- [Agent Teams (official docs)](https://code.claude.com/docs/en/agent-teams) — underlying platform feature
