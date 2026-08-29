# AGENTS.md

> Index for AI agents (Claude Code, agent teams, future tools) working on this
> repo. Keep this file short — it is a **table of contents**, not documentation.
> Update when you add a new agent-facing surface.

---

## Start here

| File                                                   | Purpose                                                                                                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`CLAUDE.md`](CLAUDE.md)                               | Core project guide: monorepo layout, build commands, testing rules, conventions, default ports                                                                  |
| [`.claude/skills/SKILLS.md`](.claude/skills/SKILLS.md) | Catalog of every custom + plugin skill (`/tdd`, `/review-pr`, `/grill-me`, `/caveman`, etc.)                                                                    |
| [`.mcp.json`](.mcp.json)                               | MCP servers available (context7, playwright, terraform, docker, mongodb, github, plus the verify-pr harness's playwright-chrome / playwright-electron wrappers) |
| [`.claude/settings.json`](.claude/settings.json)       | Project-scoped permissions, hooks, Claude Code config                                                                                                           |
| [`docs/agents/`](docs/agents/)                         | Issue-tracker, triage-label and domain-doc config read by the mattpocock engineering skills (`/wayfinder`, `/to-spec`, `/to-tickets`, `/triage`)                |
| [`CONTEXT.md`](CONTEXT.md)                             | Domain glossary — the vocabulary every issue, test name and interface uses. Read with the relevant [`docs/adr/`](docs/adr/) entries before writing code         |

## Planning flow

Three repo-local forks of the mattpocock skills in
[`.claude/skills/`](.claude/skills/) override their user-level copies and carry
this repo's conventions (`AFK` / `HITL` / `spec` labels, Project #1 + Priority,
native GitHub dependencies and sub-issues):

```
/wayfinder   Map of Decision tickets (only when the effort is too big for one session)
    |
/to-spec     Spec issue (label `spec`, includes Module design)
    |
/to-tickets  Slices (AFK -> label `AFK` + Project #1 + Priority; HITL -> label `HITL`)
    |
Daemon       /afk-pickup -> /afk-dispatch implements the AFK Slices
```

The old `/write-a-prd` and `/prd-to-issues` skills are gone; "PRD" is now
**Spec** and "issue breakdown" is now **Slices** (see `CONTEXT.md`).

## Monorepo layout at a glance

| Path                         | Tech                                    | Port |
| ---------------------------- | --------------------------------------- | ---- |
| `apps/backend/`              | NestJS + Mongoose + Socket.io + Swagger | 3001 |
| `apps/frontend/`             | React 18 + MUI + D3.js + Webpack        | 3000 |
| `apps/smoker/`               | Electron Forge + React + MUI + D3.js    | 8080 |
| `apps/device-service/`       | NestJS + SerialPort + node-wifi         | 3003 |
| `packages/TemperatureChart/` | Shared D3.js chart                      | n/a  |

Data flow:
`Frontend/Smoker → Backend (REST + WebSocket) → Device Service (serial) → MicroController → Hardware`

## Build, test, lint, format

All commands documented in [`CLAUDE.md`](CLAUDE.md). TL;DR:

- Bootstrap (once): `npm run bootstrap` — always uses `--legacy-peer-deps`
- Start everything: `npm start`
- Lint + format: `npm run lint`, `npm run lint:fix`, `npm run format`,
  `npm run format:check`
- Tests: **run from each app dir, not root** — `cd apps/<app> && npm test`
- Coverage thresholds: see table in `CLAUDE.md` — CI-enforced

## Harness / feedback loops (PRD [#183](https://github.com/benjr70/Smart-Smoker-V2/issues/183))

The repo uses automated feedback (Level 6 agentic engineering) so agents can
self-correct without human review:

| Pillar               | Surface                                                  | Doc                               |
| -------------------- | -------------------------------------------------------- | --------------------------------- |
| Pre-commit           | `.husky/pre-commit` + `lint-staged` in `package.json`    | `docs/harness/backpressure.md`    |
| PR typecheck         | `.github/workflows/typecheck.yml`                        | `docs/harness/backpressure.md`    |
| PR E2E               | extended `.github/workflows/test.yml`                    | `docs/harness/backpressure.md`    |
| Runtime health       | `GET /health` + `GET /ready` on backend + device-service | `docs/harness/self-validation.md` |
| Structured logs      | `nestjs-pino` in backend + device-service                | `docs/harness/self-validation.md` |
| Post-deploy smoke    | `scripts/smoke/run.ts` (Playwright)                      | `docs/harness/self-validation.md` |
| Terraform plan on PR | `.github/workflows/terraform-plan.yml`                   | `docs/harness/infra.md`           |
| Terraform drift      | `.github/workflows/terraform-drift.yml` (nightly)        | `docs/harness/infra.md`           |
| Ansible dry-run      | extended `.github/workflows/ansible-lint.yml`            | `docs/harness/infra.md`           |
| Docker build PR gate | `.github/workflows/docker-build-pr.yml`                  | `docs/harness/infra.md`           |
| Compose healthchecks | `*.docker-compose.yml`                                   | `docs/harness/infra.md`           |
| Docs freshness       | `.github/workflows/docs-freshness.yml`                   | `docs/harness/backpressure.md`    |

Gates ship in **advisory mode** (warnings, non-blocking) and flip to blocking
after a ~2-week bake window.

## AFK (Level 7)

**AFK** ("away from keyboard") is this repo's Level 7 layer: parallel
multi-agent implementation via
[Claude Code Agent Teams](https://code.claude.com/docs/en/agent-teams) — an
implementer, reviewer, verifier, and on-demand researcher coordinate through a
shared task list. Separate `AFK` label taxonomy. See
[`docs/AFK/`](docs/AFK/index.md) for the full playbook.

| Surface                                                                        | Purpose                                                                                                                                               |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`.claude/agents/`](.claude/agents/)                                           | Four subagent definitions: implementer, reviewer, verifier, researcher (all Opus; separation via tool allowlist)                                      |
| [`.claude/skills/afk-dispatch/SKILL.md`](.claude/skills/afk-dispatch/SKILL.md) | The lead's playbook — invoke as `/afk-dispatch <prd>` from inside Claude. Self-bootstraps labels + pre-flight on every run; no external setup script. |
| [`.claude/hooks/`](.claude/hooks/)                                             | `TaskCompleted` (smoke-trailer enforcement) + `TeammateIdle` (unresolved-review blocker)                                                              |

Agent Teams is enabled via `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in
[`.claude/settings.json`](.claude/settings.json) and requires Claude Code ≥
2.1.32.

## Infrastructure

- Terraform: `infra/proxmox/terraform/` — envs: `dev-cloud`, `prod-cloud`,
  `github-runner`, `virtual-smoker`
- Proxmox scripts + cloud-init: `infra/proxmox/scripts/`
- See [`infra/README.md`](infra/README.md) for provisioning walkthrough
- Tailscale Serve fronts backend + frontend; CORS origins whitelisted in backend
- Docs: `docs/infrastructure/*.md` (MkDocs `mise run docs-serve`)

## Docs

Full docs live in [`docs/`](docs/) and render via MkDocs (`mkdocs.yml`). Key
sections:

- `docs/apps/{backend,frontend,smoker,device-service}/` — per-app guides
- `docs/CI-CD/` — GitHub Actions, coverage, deploy
- `docs/Infrastructure/` — Terraform, Ansible, Docker, Tailscale, networking, DR
- `docs/harness/` — harness engineering (this PRD)

PRs touching controllers/DTOs or infra paths must update the corresponding docs;
the `docs-freshness` workflow flags missing updates.

## When unsure

1. Read `CLAUDE.md` first.
2. Grep `docs/` for the topic.
3. Check `.claude/skills/` for a matching skill (e.g. `/tdd` for feature work,
   `/review-pr` for reviews).
4. Invoke an MCP (context7 for framework docs, playwright for UI verification,
   terraform/docker/mongodb for infra + data).
5. If still stuck, ask the user — do not guess on deploy workflows, credentials,
   or destructive commands.
