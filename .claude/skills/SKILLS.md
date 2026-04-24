# AI Tooling Reference

Full index of AI-facing surfaces wired into this repo: skills, subagent
definitions, hooks, autonomous loops, and the Agent Teams orchestration layer.
Skills extend what Claude can do via domain-specific instructions, checklists,
and workflows. Claude loads them automatically when relevant, or invoke directly
with `/skill-name`.

| Surface                        | Path                    | Purpose                                                 |
| ------------------------------ | ----------------------- | ------------------------------------------------------- |
| Skills                         | `.claude/skills/`       | Slash commands + auto-loaded playbooks                  |
| Subagent definitions (Level 7) | `.claude/agents/`       | Teammate roles for Agent Teams (impl/rev/ver/research)  |
| Hooks (Level 6 + 7)            | `.claude/hooks/`        | TaskCompleted + TeammateIdle quality gates              |
| Settings + permissions         | `.claude/settings.json` | Env flags, allow/deny rules, hook registration          |
| Ralph loop (Level 6)           | `scripts/ralph/`        | Single-agent autonomous issue implementation            |
| Smoke harness                  | `scripts/smoke/run.ts`  | Playwright probes — verifier invokes after diff approve |

Agent Teams (Level 7) has **no bootstrap script** — `/team-dispatch`
self-bootstraps labels + pre-flight on every run.

---

## Development Skills

### `/d3js` -- D3.js Visualization

**When to use:** Creating or modifying custom charts, graphs, or interactive SVG
visualizations. Directly relevant to the shared `packages/TemperatureChart/`
component.

**What it does:** Provides D3.js best practices including data binding patterns,
scale selection, transitions, responsive sizing, and interactivity (tooltips,
zoom/pan). Includes reference files for color schemes, common patterns, and
chart templates.

**Source:**
[chrisvoncsefalvay/claude-d3js-skill](https://github.com/chrisvoncsefalvay/claude-d3js-skill)

---

### `/electron` -- Electron Desktop App

**When to use:** Working on the smoker app (`apps/smoker/`), Electron
main/renderer/preload processes, IPC patterns, BrowserWindow configuration, or
Electron Forge build setup.

**What it does:** Covers the three-process model (Main, Preload, Renderer),
secure IPC via `contextBridge`, kiosk-mode configuration for the Raspberry Pi
display, Electron Forge + Webpack bundling, and testing patterns for Electron
APIs. Tailored to this project's specific setup (React renderer, Socket.io
communication, Docker deployment with Watchtower).

**Source:** Custom (project-specific)

---

### `/nestjs` -- NestJS Best Practices

**When to use:** Writing, reviewing, or refactoring NestJS code in the backend
(`apps/backend/`) or device service (`apps/device-service/`).

**What it does:** Provides 40+ rules across 10 categories: architecture,
dependency injection, error handling, security, performance, testing,
database/ORM, API design, microservices, and DevOps. Each rule links to a
detailed reference doc in `rules/`.

**Source:**
[Kadajett/agent-nestjs-skills](https://github.com/Kadajett/agent-nestjs-skills)

---

### `/tdd` -- Test-Driven Development

**When to use:** Building features or fixing bugs using TDD, or when you want
test-first development with the red-green-refactor loop.

**What it does:** Enforces vertical-slice TDD (one test, one implementation,
repeat). Includes guidance on writing behavior-focused tests through public
interfaces, mocking strategies, interface design for testability, and
refactoring patterns. Prevents the anti-pattern of writing all tests first then
all implementation.

**Source:** Custom (project-specific)

---

## Planning & Design Skills

### `/grill-me` -- Stress-Test a Plan

**When to use:** You have a plan or design idea and want it challenged before
committing. Say "grill me" or ask to stress-test your approach.

**What it does:** Interviews you relentlessly about every aspect of the plan,
walking down each branch of the decision tree and resolving dependencies between
decisions. Provides recommended answers for each question. If a question can be
answered by exploring the codebase, it explores instead of asking.

**Source:** Custom (project-specific)

---

### `/write-a-prd` -- Write a PRD

**When to use:** You want to formalize a feature idea into a structured Product
Requirements Document and submit it as a GitHub issue.

**What it does:** Guides you through a multi-step process: describe the problem,
explore the codebase for current state, intensive interview to resolve all
decisions, sketch major modules, then generate a PRD (problem statement,
solution, user stories, implementation decisions, testing decisions) and submit
it as a GitHub issue.

**Source:** Custom (project-specific)

---

### `/prd-to-issues` -- Break PRD into Issues

**When to use:** You have a PRD (as a GitHub issue) and want to break it into
independently-implementable GitHub issues using vertical slices.

**What it does:** Fetches the PRD, breaks it into thin tracer-bullet slices that
cut through all layers end-to-end (schema, API, UI, tests). Each slice is either
HITL (human-in-the-loop) or AFK (autonomous). AFK slices get the `ralph` label
for pickup by the Ralph autonomous loop. Creates GitHub issues with acceptance
criteria, interface changes, behaviors to test, and dependency ordering.

**Source:** Custom (project-specific)

---

### `/improve-codebase-architecture` -- Architecture Review

**When to use:** You want to find refactoring opportunities, consolidate
tightly-coupled modules, or make the codebase more testable and AI-navigable.

**What it does:** Explores the codebase organically to surface architectural
friction, then presents candidates for "module deepening" (small interface, deep
implementation). For a chosen candidate, spawns 3+ parallel subagents to design
radically different interface options, compares them, and creates a refactor RFC
as a GitHub issue.

**Source:** Custom (project-specific)

---

## Review & Quality Skills

### `/review-pr` -- PR Review with Specialized Subagents

**When to use:** You want a thorough code review of a pull request. Invoke
manually with `/review-pr [PR number]`.

**What it does:** Analyzes the PR diff, categorizes changed files by domain, and
conditionally spawns specialized reviewer subagents in parallel:

| Reviewer           | Triggered by                                             | Checks                                                       |
| ------------------ | -------------------------------------------------------- | ------------------------------------------------------------ |
| **DB Safety**      | `*.schema.ts`, `*Dto.ts`, `*.module.ts`                  | Breaking schema changes, missing defaults, migration needs   |
| **Event Contract** | `*/websocket/*`, `*/events.*`                            | Socket.io event name/payload consistency across all 3 apps   |
| **Infrastructure** | `infra/**`, `Dockerfile*`, `*.tf`, `.github/workflows/*` | Security, blast radius, destructive changes                  |
| **Coverage**       | Any file under `apps/` or `packages/`                    | Test coverage threshold impact, missing test files           |
| **General**        | All changed files                                        | Naming conventions, TypeScript strict, NestJS/React patterns |

Aggregates findings into a structured review with risk level
(LOW/MEDIUM/HIGH/CRITICAL) and optionally posts as a PR comment.

**Source:** Custom (project-specific)

---

## Orchestration Skills

### `/team-dispatch` -- Agent Teams Orchestration (Level 7)

**When to use:** You have a PRD with open issues labeled `team` and want
autonomous parallel implementation via the Claude Code Agent Teams feature
(implementer/reviewer/verifier/researcher coordinating through a shared task
list). Invoke with `/team-dispatch <prd-issue-number>` (add `--dry-run` to
preview the roster + task list without spawning).

**What it does:** Primes the running Claude session as the team lead. Reads the
PRD, enumerates `team`-labeled issues via `gh`, populates a shared task list
with `blocked_by` edges from issue bodies, spawns the four teammate roles, and
coordinates the per-issue flow: researcher memo → implementer claims + codes +
stages → reviewer approves → verifier smokes + commits with `smoke:` trailer →
labels advance `team` → `team:in-progress` → `team:done` → issue closed. Handles
`BLOCKED` and `smoke FAIL` states; cleans up on empty queue.

**Source:** Custom (project-specific). Full playbook at
[`.claude/skills/team-dispatch/SKILL.md`](team-dispatch/SKILL.md). Companion
docs at [`docs/Teams/`](../../docs/Teams/index.md).

---

---

## Subagent Definitions (Level 7)

Teammate roles spawned by the `/team-dispatch` lead. Each lives as a markdown
file in `.claude/agents/` with frontmatter (`name`, `description`, `tools`,
`model`) and a body appended to the teammate's system prompt. Claude Code
resolves definitions by `name` when the lead spawns a teammate. **All four run
on Opus** — implementer/reviewer separation is enforced by the tool allowlist +
prompt scoping, not by model choice.

| Role        | File                            | Tools                                    | Spawned                                                | Purpose                                                                         |
| ----------- | ------------------------------- | ---------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| implementer | `.claude/agents/implementer.md` | `Read, Edit, Write, Bash, Glob, Grep`    | up front, persistent                                   | TDD red-green-refactor; claims tasks, writes failing tests, implements, stages  |
| reviewer    | `.claude/agents/reviewer.md`    | `Read, Grep, Glob, Bash` (read-only git) | up front, persistent                                   | Reads staged diff, applies `/review-pr` checklist, posts approve/change-request |
| verifier    | `.claude/agents/verifier.md`    | `Read, Bash`                             | up front, persistent                                   | Runs `scripts/smoke/run.ts`, appends `smoke:` trailer, lands commit             |
| researcher  | `.claude/agents/researcher.md`  | `Read, Grep, Glob, WebFetch`             | on-demand per issue with non-trivial Interface Changes | Read-only memo into task description before implementer codes                   |

Reviewer has **no Edit/Write** — must not fix what it flags. Researcher has **no
Bash, no Edit/Write** — only mutates task description via task list.

---

## Hooks (Levels 6 + 7)

Shell scripts registered in `.claude/settings.json` under the `hooks` key. Both
exit `0` on pass / `2` on block-with-feedback. Graceful fallback: if a
dependency fails (e.g. `jq` missing, `git` unavailable), exit `0` rather than
block legit work.

| Hook                                    | Event           | Purpose                                                                                                                                          |
| --------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.claude/hooks/task-completed-smoke.sh` | `TaskCompleted` | Reads HEAD commit body. If team-shaped (`feat(...)/fix(...)/...:` + `Closes #N`) but missing `smoke: PASS\|FAIL\|SKIPPED` trailer, exit 2.       |
| `.claude/hooks/teammate-idle-review.sh` | `TeammateIdle`  | Implementer-only: scans `~/.claude/tasks/<team>/*.json` via `jq` for unresolved reviewer change-requests addressed to it. Exit 2 if any pending. |

The `caveman` plugin auto-activation also wires through `UserPromptSubmit` in
`.claude/settings.json` (intensity-aware compressed responses).

---

## External Plugin Skills

### `caveman` -- Token-Efficient Communication

**Source:** [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman)

A plugin that adds ultra-compressed communication modes to cut token usage ~75%
while preserving technical accuracy. Installed via Claude Code plugin system,
not in `.claude/skills/`.

| Skill             | Purpose                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `/caveman`        | Toggle caveman mode (intensity: lite, full, ultra, wenyan variants)                       |
| `/caveman-help`   | Quick-reference card for all caveman modes and commands                                   |
| `/caveman-commit` | Ultra-compressed commit message generator (Conventional Commits, subject ≤50 chars)       |
| `/caveman-review` | Ultra-compressed code review comments (one-line: location, problem, fix)                  |
| `/compress`       | Compress memory files (CLAUDE.md, todos) into caveman format; saves `.original.md` backup |

**When to use:** You want terser output to save context tokens, or you want
compact commit messages and PR review comments. Auto-triggers when token
efficiency is requested.

---

## Full Pipeline

These skills compose into a complete feature development pipeline. Two
implementation paths diverge at the issue-pickup step: **Ralph** (Level 6,
single-agent loop, `ralph` label) or **Agent Teams** (Level 7, parallel
multi-agent dispatch, `team` label). Pick one per PRD — do not mix labels on the
same issue.

```
/grill-me          Stress-test the idea
    |
/write-a-prd       Formalize as a GitHub issue PRD
    |
/prd-to-issues     Break into vertical-slice issues
                   (AFK slices labeled `ralph` OR `team`)
    |
git checkout -b feat/<name>
    |
    +─── Path A: Level 6 (Ralph)
    |        |
    |    ralph-afk.sh        Single-agent autonomous loop using /tdd
    |        |
    |    /review-pr          Review completed work (manual)
    |        |
    |    ralph-pr.sh         Open PR
    |
    +─── Path B: Level 7 (Agent Teams)
             |
         /team-dispatch <prd>          Self-bootstraps labels + pre-flight,
             |                          then spawns impl/rev/ver/research.
             |                          Parallel impl with built-in peer review
             |                          + smoke-trailer commits.
             |
         gh pr create                  Open PR (Teams writes commits already)
```

Selection guide:

- **Ralph** — small slice, one agent's context fits the whole change, no
  cross-cutting review needed. Faster bootstrap, simpler mental model.
- **Agent Teams** — multiple slices that benefit from parallel execution,
  high-blast-radius changes (backend services, device-service, infra,
  docker-compose) where plan-mode review matters, or PRDs where independent
  reviewer signal is worth the extra concurrency cost.
