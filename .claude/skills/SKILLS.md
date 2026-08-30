# AI Tooling Reference

Full index of AI-facing surfaces wired into this repo: skills, subagent
definitions, hooks, autonomous loops, and the AFK orchestration layer (Level 7).
Skills extend what Claude can do via domain-specific instructions, checklists,
and workflows. Claude loads them automatically when relevant, or invoke directly
with `/skill-name`.

| Surface                        | Path                    | Purpose                                                 |
| ------------------------------ | ----------------------- | ------------------------------------------------------- |
| Skills                         | `.claude/skills/`       | Slash commands + auto-loaded playbooks                  |
| Subagent definitions (Level 7) | `.claude/agents/`       | Teammate roles for Agent Teams (impl/rev/ver/research)  |
| Hooks (Level 6 + 7)            | `.claude/hooks/`        | TaskCompleted + TeammateIdle quality gates              |
| Settings + permissions         | `.claude/settings.json` | Env flags, allow/deny rules, hook registration          |
| Smoke harness                  | `scripts/smoke/run.ts`  | Playwright probes — verifier invokes after diff approve |

AFK (Level 7) has **no bootstrap script** — `/afk-dispatch` self-bootstraps
labels + pre-flight on every run.

**Upstream provenance and `skills-lock.json`.** The root `skills-lock.json`
records every skill pulled from
[mattpocock/skills](https://github.com/mattpocock/skills). It is written by the
[`skills`](https://www.npmjs.com/package/skills) CLI, whose `computedHash` is a
SHA-256 over the skill folder's sorted `relativePath + file bytes` — i.e. the
hash of the **local** folder as installed, not an upstream fingerprint. The CLI
reinstalls (and so overwrites) any skill whose folder no longer hashes to its
lock entry.

Two classes of entry live in the lock:

| Class          | Entries                                     | `forked` | Meaning                                                                                                      |
| -------------- | ------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| Upstream-track | `grill-me`, `improve-codebase-architecture` | absent   | Synced verbatim. Hash drift is a signal to **re-sync from upstream**.                                        |
| Repo-owned     | `tdd`, `to-spec`, `to-tickets`, `wayfinder` | `true`   | Deliberately diverged. Hash is pinned to the local content so a sync sees "up to date" and does not clobber. |

`to-spec`, `to-tickets` and `wayfinder` are forks carrying harness labels,
Project #1 wiring and native dependencies; `tdd` is locally extended
(CONTEXT.md/ADR pointer, `codebase-design` reference, repo `deep-modules.md`).
When you intentionally edit any repo-owned skill, refresh its `computedHash`
with the CLI's own algorithm rather than hand-writing a value, and keep
`forked: true` in place.

`forked` and `note` are **repo conventions**, not upstream lock schema — the CLI
parses the lock as plain JSON and ignores unknown keys, but it rewrites an entry
wholesale if it ever reinstalls that skill, which would drop both fields. Re-add
them if that happens.

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

**Source:** [mattpocock/skills](https://github.com/mattpocock/skills), locally
extended (repo-owned fork — see `skills-lock.json`).

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

### `/wayfinder` -- Chart a Big Effort as a Map

**When to use:** An effort is too big for one session and wrapped in fog. Chart
it as a **Map** issue whose children are **Decision tickets**, then work them
one at a time until the way to the destination is clear.

**What it does:** Names the destination, grills breadth-first for the open
decisions, creates the Map (`wayfinder:map`) and its child tickets with native
blocking edges. Research and human-free task tickets get `AFK` + Project #1 +
Priority (default P1) so the Daemon can resolve them; grilling and prototype
tickets get `HITL`. Chart-time research fires as `/afk-resolve` subagents that
persist findings under `docs/research/`.

**Source:** Fork of [mattpocock/skills](https://github.com/mattpocock/skills) —
repo-local copy overrides the user-level skill.

---

### `/to-spec` -- Write a Spec

**When to use:** A Map has reached its destination, or a grilling session has
settled the decisions, and you want the result written down as the issue Slices
are cut from and reviewed against.

**What it does:** Synthesizes the conversation (no interview) into a Spec issue:
problem statement, user stories, implementation decisions, **module design**
(deep modules and which get tests), testing decisions, out of scope. Labelled
`spec`, never `AFK`. Born from a Map, it carries `Part of #<map>` and is added
as a sub-issue of the Map.

**Source:** Fork of [mattpocock/skills](https://github.com/mattpocock/skills) —
repo-local copy overrides the user-level skill.

---

### `/to-tickets` -- Cut a Spec into Slices

**When to use:** You have a Spec issue and want it broken into
independently-implementable **Slices**.

**What it does:** Breaks the Spec into thin tracer-bullet slices cutting through
all layers end-to-end. Bootstraps the `AFK` / `HITL` / `spec` / `AFK:*` labels,
creates one issue per Slice (Parent → What to build → Acceptance criteria → User
stories → Interface changes → Behaviors to test → Testing priority → Blocked
by), wires **native** GitHub `blocked_by` dependencies and sub-issue links to
the Spec, then labels AFK Slices `AFK` and adds them to Project #1 with a
Priority quizzed once per batch (default P2). HITL Slices get `HITL` and stay
off the project. `--dry-run` prints the plan without mutating anything.

**Source:** Fork of [mattpocock/skills](https://github.com/mattpocock/skills) —
repo-local copy overrides the user-level skill.

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

### `/afk-dispatch` -- AFK Orchestration (Level 7)

**When to use:** You have a PRD with open issues labeled `AFK` and want
autonomous parallel implementation via the Claude Code Agent Teams feature
(implementer/reviewer/verifier/researcher coordinating through a shared task
list). Invoke with `/afk-dispatch <prd-issue-number>` (add `--dry-run` to
preview the roster + task list without spawning).

**What it does:** Primes the running Claude session as the team lead. Reads the
PRD, enumerates `AFK`-labeled issues via `gh`, populates a shared task list with
`blocked_by` edges from issue bodies, spawns the four teammate roles, and
coordinates the per-issue flow: researcher memo → implementer claims + codes +
stages → reviewer approves → verifier smokes + commits with `smoke:` trailer →
labels advance `AFK` → `AFK:in-progress` → `AFK:done` → issue closed. Handles
`BLOCKED` and `smoke FAIL` states; cleans up on empty queue.

**Source:** Custom (project-specific). Full playbook at
[`.claude/skills/afk-dispatch/SKILL.md`](afk-dispatch/SKILL.md). Companion docs
at [`docs/AFK/`](../../docs/AFK/index.md).

---

### `/afk-resolve` -- Resolve One Wayfinder Decision Ticket (Level 7)

**When to use:** A `wayfinder:research` or human-free `wayfinder:task` Decision
ticket needs resolving without a human. Fired automatically by `/afk-pickup` §2b
on triage verdict `pick-wayfinder`; `/wayfinder` also fires it as a subagent for
chart-time research. Invoke with
`/afk-resolve --issue <N> --type <research|task>`.

**What it does:** Claims the ticket (assignee + `AFK:in-progress`), runs the
`research` skill against primary sources, persists findings to
`docs/research/<map-slug>/<ticket-slug>.md` with a ticket/map/date/sources
header, opens a `docs(research): … (#N)` PR off `research/<ticket-slug>`, drives
`/pr-watch` to green, merges through the docs-only gate
(`scripts/claude-agent/lib/docs-only-gate.sh`), posts the resolution comment
linking the file on master, closes the ticket, appends the Map's Decisions so
far, and graduates fog into at most three new sub-issues under strict depth and
routing guardrails. Task tickets follow the same skeleton without the file/PR; a
task needing product code is relabelled `HITL`. Writes no application code.

**Source:** Custom (project-specific). Full playbook at
[`.claude/skills/afk-resolve/SKILL.md`](afk-resolve/SKILL.md).

---

## Subagent Definitions (Level 7)

Teammate roles spawned by the `/afk-dispatch` lead. Each lives as a markdown
file in `.claude/agents/` with frontmatter (`name`, `description`, `tools`,
`model`) and a body appended to the teammate's system prompt. Claude Code
resolves definitions by `name` when the lead spawns a teammate. **Researcher
runs on Fable at medium effort; implementer/reviewer/verifier run on Opus**
(dialed off Fable 2026-08-14 — Fable's weekly bucket was outpacing the overall
weekly usage, and these three are the highest-volume spawns) —
implementer/reviewer separation is enforced by the tool allowlist + prompt
scoping, not by model choice.

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

These skills compose into a complete feature development pipeline.
Implementation is carried out by **AFK dispatch** (Level 7, parallel multi-agent
dispatch, `AFK` label) once the Spec has been cut into Slices.

```
/grill-me          Stress-test the idea
    |
/wayfinder         Chart a too-big effort as a Map of Decision tickets
    |                (skip for efforts that fit one session)
    |
/to-spec           Write the Spec as a GitHub issue (label `spec`)
    |
/to-tickets        Cut into vertical-slice issues (Slices)
                   (AFK Slices labeled `AFK` + Project #1 + Priority)
    |
git checkout -b feat/<name>
    |
/afk-dispatch <spec>         Self-bootstraps labels + pre-flight, then spawns
    |                          impl/rev/ver/research. Parallel impl with
    |                          built-in peer review + smoke-trailer commits.
    |
gh pr create                  Open PR (AFK writes commits already)
```

AFK dispatch suits multiple slices that benefit from parallel execution,
high-blast-radius changes (backend services, device-service, infra,
docker-compose) where plan-mode review matters, and Specs where independent
reviewer signal is worth the extra concurrency cost.
