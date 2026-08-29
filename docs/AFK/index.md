# AFK (Level 7)

Level 6 gives agents **backpressure** — the harness catches regressions on commit, PR, and deploy. Level 7 gives them **parallelism and peer review** — multiple Claude instances working on the same PRD, each in its own context window, coordinating through a shared task list and a mailbox. You stop writing code and start dispatching.

**AFK** — "away from keyboard" — is this repo's name for the Level 7 layer: the label taxonomy (`AFK`, `AFK:in-progress`, …), the `/afk-dispatch` and `/afk-pickup` skills, and the daemon that fires them. It is the team built on top of [Claude Code Agent Teams](https://code.claude.com/docs/en/agent-teams) (experimental, shipped Feb 2026, requires Claude Code ≥ 2.1.32). Ralph — the Level 6 autonomous loop — still lives at [`scripts/ralph/`](https://github.com/benjr70/Smart-Smoker-V2/tree/master/scripts/ralph) and is untouched by this work. The two systems share the harness ([`docs/Harness/`](../Harness/index.md)) but run on separate label taxonomies (`AFK` vs `ralph`).

## The one-paragraph walkthrough

You start with a PRD that has been broken into issues via `/prd-to-issues`. Issues labeled `AFK` are eligible for the team. You open Claude Code in the repo root and invoke `/afk-dispatch <prd-number>`. The running session becomes the **team lead**: it reads the PRD, spawns three teammates (implementer, reviewer, verifier) plus a researcher on-demand, populates a shared task list with one task per issue, and coordinates the flow. An implementer drives TDD. The reviewer reads the staged diff and posts approval or change-requests through the mailbox. The verifier runs `scripts/smoke/run.ts`, writes a `smoke: …` trailer, commits. Labels advance `AFK` → `AFK:in-progress` → `AFK:done`. When the queue is empty, the lead shuts down each teammate and runs team cleanup. You come back to a clean commit log and a set of closed issues.

Fully hands-off, the same flow runs without you invoking anything: the [Autonomous Loop](autonomous-loop.md) daemon fires `/afk-pickup` whenever Claude budget allows, working one unit per fire — reconcile an open PR a human handed back (or that master conflicted), resume paused work, or pick the next issue — and every PR gets CI babysitting plus a live manual-verification sweep before the fire ends.

## Pillars

| Pillar | What it is | Docs |
|--------|------------|------|
| **Roles** | Four subagent definitions in `.claude/agents/` — implementer, reviewer, verifier, researcher. Each a separate teammate with its own context window and tool allowlist. | [Roles](roles.md) |
| **Dispatch** | The `/afk-dispatch` skill in `.claude/skills/afk-dispatch/`. The playbook the team lead executes. Self-bootstrapping — pre-flight + label creation run on every dispatch (idempotent). | [Dispatch](dispatch.md) |
| **Hooks** | Two quality-gate hooks in `.claude/hooks/` — `task-completed-smoke.sh` (enforces the `smoke:` trailer), `teammate-idle-review.sh` (blocks the implementer from idling with open reviewer change-requests). | [Dispatch](dispatch.md#hooks) |
| **Autonomous Loop** | The always-on pipeline: a budget-paced systemd daemon fires `/afk-pickup`, which reconciles PRs needing attention (merge conflicts, `AFK:revise` review hand-backs), resumes paused work, or picks the next issue — then babysits CI (`/pr-watch`) and executes the PR's manual-verification checklist. | [Autonomous Loop](autonomous-loop.md) |

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

## Rollout runbook (team → AFK rename)

The rename to `AFK` is code-side only — the nine GitHub labels must be renamed by
hand, and only once the queue is quiet. Run this **after** the rename PR merges,
as a human or an authenticated Claude session, so the daemon never double-picks.
The old label names below are the only historical `team`-prefixed strings kept in
the repo.

1. Confirm nothing is in flight: `gh issue list --label team:in-progress` (historical name) must return empty, and so must the same listing for the historical paused label.
2. `git pull` in the daemon checkout so it has the renamed skills and scripts.
3. Kill the daemon MainPID (`Restart=always` brings it back on the new code):
   `sudo systemctl show -p MainPID --value agent-daemon`, then `sudo kill <pid>`.
4. Rename the nine labels in place — every issue keeps its label:

   ```bash
   for old in team team:done team:failed team:revise team:paused team:in-progress team:rebase-failed team:revise-failed team:checks-failed; do  # historical names
     gh label edit "$old" --name "AFK${old#team}"
   done
   ```

5. Verify the next fire: the log lands at `~/claude-agent/logs/afk-pickup-<TS>.log`
   and opens with `afk-pickup: triage verdict=…`.
6. The historical `team-pickup-*.log` files stay on disk under their old names —
   the dashboard reads both prefixes, so fire history survives the rename.
