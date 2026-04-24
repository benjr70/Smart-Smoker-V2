# Agent Teams (Level 7)

Level 6 gives agents **backpressure** — the harness catches regressions on commit, PR, and deploy. Level 7 gives them **parallelism and peer review** — multiple Claude instances working on the same PRD, each in its own context window, coordinating through a shared task list and a mailbox. You stop writing code and start dispatching.

This section covers the team built on top of [Claude Code Agent Teams](https://code.claude.com/docs/en/agent-teams) (experimental, shipped Feb 2026, requires Claude Code ≥ 2.1.32). Ralph — the Level 6 autonomous loop — still lives at [`scripts/ralph/`](https://github.com/benjr70/Smart-Smoker-V2/tree/master/scripts/ralph) and is untouched by this work. The two systems share the harness ([`docs/Harness/`](../Harness/index.md)) but run on separate label taxonomies (`team` vs `ralph`).

## The one-paragraph walkthrough

You start with a PRD that has been broken into issues via `/prd-to-issues`. Issues labeled `team` are eligible for the team. You open Claude Code in the repo root and invoke `/team-dispatch <prd-number>`. The running session becomes the **team lead**: it reads the PRD, spawns three teammates (implementer, reviewer, verifier) plus a researcher on-demand, populates a shared task list with one task per issue, and coordinates the flow. An implementer drives TDD. The reviewer reads the staged diff and posts approval or change-requests through the mailbox. The verifier runs `scripts/smoke/run.ts`, writes a `smoke: …` trailer, commits. Labels advance `team` → `team:in-progress` → `team:done`. When the queue is empty, the lead shuts down each teammate and runs team cleanup. You come back to a clean commit log and a set of closed issues.

## Pillars

| Pillar | What it is | Docs |
|--------|------------|------|
| **Roles** | Four subagent definitions in `.claude/agents/` — implementer, reviewer, verifier, researcher. Each a separate teammate with its own context window and tool allowlist. | [Roles](roles.md) |
| **Dispatch** | The `/team-dispatch` skill in `.claude/skills/team-dispatch/`. The playbook the team lead executes. Self-bootstrapping — pre-flight + label creation run on every dispatch (idempotent). | [Dispatch](dispatch.md) |
| **Hooks** | Two quality-gate hooks in `.claude/hooks/` — `task-completed-smoke.sh` (enforces the `smoke:` trailer), `teammate-idle-review.sh` (blocks the implementer from idling with open reviewer change-requests). | [Dispatch](dispatch.md#hooks) |

## Why agent teams over a Ralph-style loop

Ralph is one Claude instance, one issue, one context window. That works well for Level 6 autonomous single-issue implementation — the loop runs TDD, smokes, commits, advances labels. What it cannot do:

- **Peer review** — Ralph grades its own exam. A second Claude with a different prompt and (critically) a tool allowlist that excludes `Edit` is a meaningful second reader.
- **Parallel slicing** — Ralph processes one issue at a time. An agent team can split an N-issue PRD across teammates (bounded by file conflicts — the lead assigns non-overlapping work).
- **Plan-mode gating with independent judgment** — the team lead approves or rejects plans submitted by the implementer, advised by the reviewer. Ralph has no equivalent — it either plans or doesn't, with the same model doing both.
- **On-demand research** — a researcher teammate writes a short memo before the implementer opens any files. Ralph reads and codes in the same context.

The trade-off is token cost: each teammate is a separate Claude instance, so a 4-person team uses roughly 3-4× a single Ralph loop. For the cost you get a second opinion on every commit and a cleaner implementer context.

## Related

- [Harness overview](../Harness/index.md) — the Level 6 gates that run under both Ralph and Teams
- [`docs/Harness/self-validation.md`](../Harness/self-validation.md) — the `smoke:` trailer contract that the verifier produces and the `TaskCompleted` hook enforces
- [Claude Code Agent Teams (official docs)](https://code.claude.com/docs/en/agent-teams) — the underlying platform feature
