# Skills Reference

This document lists all custom skills available in this project. Skills extend what Claude can do by providing domain-specific instructions, checklists, and workflows. Claude loads them automatically when relevant, or you can invoke one directly with `/skill-name`.

---

## Development Skills

### `/d3js` -- D3.js Visualization

**When to use:** Creating or modifying custom charts, graphs, or interactive SVG visualizations. Directly relevant to the shared `packages/TemperatureChart/` component.

**What it does:** Provides D3.js best practices including data binding patterns, scale selection, transitions, responsive sizing, and interactivity (tooltips, zoom/pan). Includes reference files for color schemes, common patterns, and chart templates.

**Source:** [chrisvoncsefalvay/claude-d3js-skill](https://github.com/chrisvoncsefalvay/claude-d3js-skill)

---

### `/electron` -- Electron Desktop App

**When to use:** Working on the smoker app (`apps/smoker/`), Electron main/renderer/preload processes, IPC patterns, BrowserWindow configuration, or Electron Forge build setup.

**What it does:** Covers the three-process model (Main, Preload, Renderer), secure IPC via `contextBridge`, kiosk-mode configuration for the Raspberry Pi display, Electron Forge + Webpack bundling, and testing patterns for Electron APIs. Tailored to this project's specific setup (React renderer, Socket.io communication, Docker deployment with Watchtower).

**Source:** Custom (project-specific)

---

### `/nestjs` -- NestJS Best Practices

**When to use:** Writing, reviewing, or refactoring NestJS code in the backend (`apps/backend/`) or device service (`apps/device-service/`).

**What it does:** Provides 40+ rules across 10 categories: architecture, dependency injection, error handling, security, performance, testing, database/ORM, API design, microservices, and DevOps. Each rule links to a detailed reference doc in `rules/`.

**Source:** [Kadajett/agent-nestjs-skills](https://github.com/Kadajett/agent-nestjs-skills)

---

### `/tdd` -- Test-Driven Development

**When to use:** Building features or fixing bugs using TDD, or when you want test-first development with the red-green-refactor loop.

**What it does:** Enforces vertical-slice TDD (one test, one implementation, repeat). Includes guidance on writing behavior-focused tests through public interfaces, mocking strategies, interface design for testability, and refactoring patterns. Prevents the anti-pattern of writing all tests first then all implementation.

**Source:** Custom (project-specific)

---

## Planning & Design Skills

### `/grill-me` -- Stress-Test a Plan

**When to use:** You have a plan or design idea and want it challenged before committing. Say "grill me" or ask to stress-test your approach.

**What it does:** Interviews you relentlessly about every aspect of the plan, walking down each branch of the decision tree and resolving dependencies between decisions. Provides recommended answers for each question. If a question can be answered by exploring the codebase, it explores instead of asking.

**Source:** Custom (project-specific)

---

### `/write-a-prd` -- Write a PRD

**When to use:** You want to formalize a feature idea into a structured Product Requirements Document and submit it as a GitHub issue.

**What it does:** Guides you through a multi-step process: describe the problem, explore the codebase for current state, intensive interview to resolve all decisions, sketch major modules, then generate a PRD (problem statement, solution, user stories, implementation decisions, testing decisions) and submit it as a GitHub issue.

**Source:** Custom (project-specific)

---

### `/prd-to-issues` -- Break PRD into Issues

**When to use:** You have a PRD (as a GitHub issue) and want to break it into independently-implementable GitHub issues using vertical slices.

**What it does:** Fetches the PRD, breaks it into thin tracer-bullet slices that cut through all layers end-to-end (schema, API, UI, tests). Each slice is either HITL (human-in-the-loop) or AFK (autonomous). AFK slices get the `ralph` label for pickup by the Ralph autonomous loop. Creates GitHub issues with acceptance criteria, interface changes, behaviors to test, and dependency ordering.

**Source:** Custom (project-specific)

---

### `/improve-codebase-architecture` -- Architecture Review

**When to use:** You want to find refactoring opportunities, consolidate tightly-coupled modules, or make the codebase more testable and AI-navigable.

**What it does:** Explores the codebase organically to surface architectural friction, then presents candidates for "module deepening" (small interface, deep implementation). For a chosen candidate, spawns 3+ parallel subagents to design radically different interface options, compares them, and creates a refactor RFC as a GitHub issue.

**Source:** Custom (project-specific)

---

## Review & Quality Skills

### `/review-pr` -- PR Review with Specialized Subagents

**When to use:** You want a thorough code review of a pull request. Invoke manually with `/review-pr [PR number]`.

**What it does:** Analyzes the PR diff, categorizes changed files by domain, and conditionally spawns specialized reviewer subagents in parallel:

| Reviewer | Triggered by | Checks |
|----------|-------------|--------|
| **DB Safety** | `*.schema.ts`, `*Dto.ts`, `*.module.ts` | Breaking schema changes, missing defaults, migration needs |
| **Event Contract** | `*/websocket/*`, `*/events.*` | Socket.io event name/payload consistency across all 3 apps |
| **Infrastructure** | `infra/**`, `Dockerfile*`, `*.tf`, `.github/workflows/*` | Security, blast radius, destructive changes |
| **Coverage** | Any file under `apps/` or `packages/` | Test coverage threshold impact, missing test files |
| **General** | All changed files | Naming conventions, TypeScript strict, NestJS/React patterns |

Aggregates findings into a structured review with risk level (LOW/MEDIUM/HIGH/CRITICAL) and optionally posts as a PR comment.

**Source:** Custom (project-specific)

---

---

## External Plugin Skills

### `caveman` -- Token-Efficient Communication

**Source:** [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman)

A plugin that adds ultra-compressed communication modes to cut token usage ~75% while preserving technical accuracy. Installed via Claude Code plugin system, not in `.claude/skills/`.

| Skill | Purpose |
|-------|---------|
| `/caveman` | Toggle caveman mode (intensity: lite, full, ultra, wenyan variants) |
| `/caveman-help` | Quick-reference card for all caveman modes and commands |
| `/caveman-commit` | Ultra-compressed commit message generator (Conventional Commits, subject ≤50 chars) |
| `/caveman-review` | Ultra-compressed code review comments (one-line: location, problem, fix) |
| `/compress` | Compress memory files (CLAUDE.md, todos) into caveman format; saves `.original.md` backup |

**When to use:** You want terser output to save context tokens, or you want compact commit messages and PR review comments. Auto-triggers when token efficiency is requested.

---

## Full Pipeline

These skills compose into a complete feature development pipeline:

```
/grill-me          Stress-test the idea
    |
/write-a-prd       Formalize as a GitHub issue PRD
    |
/prd-to-issues     Break into vertical-slice issues (AFK slices get `ralph` label)
    |
git checkout -b feat/<name>
    |
ralph-afk.sh       Autonomously implement issues using /tdd
    |
/review-pr          Review the completed work
    |
ralph-pr.sh         Open a PR
```
