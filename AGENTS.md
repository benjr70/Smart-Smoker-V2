# AGENTS.md

> Index for AI agents (Claude Code, Ralph autonomous loop, future tools) working
> on this repo. Keep this file short — it is a **table of contents**, not
> documentation. Update when you add a new agent-facing surface.

---

## Start here

| File                                                   | Purpose                                                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| [`CLAUDE.md`](CLAUDE.md)                               | Core project guide: monorepo layout, build commands, testing rules, conventions, default ports, Ralph pipeline |
| [`.claude/skills/SKILLS.md`](.claude/skills/SKILLS.md) | Catalog of every custom + plugin skill (`/tdd`, `/review-pr`, `/grill-me`, `/caveman`, etc.)                   |
| [`scripts/ralph/USAGE.md`](scripts/ralph/USAGE.md)     | How to run the Ralph autonomous implementation loop                                                            |
| [`.mcp.json`](.mcp.json)                               | MCP servers available (context7, playwright, terraform, docker, mongodb)                                       |
| [`.claude/settings.json`](.claude/settings.json)       | Project-scoped permissions, hooks, Claude Code config                                                          |

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

| Pillar                | Surface                                                  | Doc                               |
| --------------------- | -------------------------------------------------------- | --------------------------------- |
| Pre-commit            | `.husky/pre-commit` + `lint-staged` in `package.json`    | `docs/harness/backpressure.md`    |
| PR typecheck          | `.github/workflows/typecheck.yml`                        | `docs/harness/backpressure.md`    |
| PR E2E                | extended `.github/workflows/test.yml`                    | `docs/harness/backpressure.md`    |
| Runtime health        | `GET /health` + `GET /ready` on backend + device-service | `docs/harness/self-validation.md` |
| Structured logs       | `nestjs-pino` in backend + device-service                | `docs/harness/self-validation.md` |
| Post-deploy smoke     | `scripts/smoke/run.ts` (Playwright)                      | `docs/harness/self-validation.md` |
| Terraform plan on PR  | `.github/workflows/terraform-plan.yml`                   | `docs/harness/infra.md`           |
| Terraform drift       | `.github/workflows/terraform-drift.yml` (nightly)        | `docs/harness/infra.md`           |
| Ansible dry-run       | extended `.github/workflows/ansible-lint.yml`            | `docs/harness/infra.md`           |
| Docker build PR gate  | `.github/workflows/docker-build-pr.yml`                  | `docs/harness/infra.md`           |
| Compose healthchecks  | `*.docker-compose.yml`                                   | `docs/harness/infra.md`           |
| Docs freshness        | `.github/workflows/docs-freshness.yml`                   | `docs/harness/backpressure.md`    |
| Ralph self-validation | `scripts/ralph/ralph-prompt.md`                          | `scripts/ralph/USAGE.md`          |

Gates ship in **advisory mode** (warnings, non-blocking) and flip to blocking
after a ~2-week bake window.

## Ralph autonomous loop

See [`scripts/ralph/USAGE.md`](scripts/ralph/USAGE.md) for full workflow. Entry
points:

```bash
./scripts/ralph/ralph-setup.sh                       # one-time labels + prereqs
./scripts/ralph/ralph-once.sh <issue>                # single-issue HITL
./scripts/ralph/ralph-afk.sh <max-iters> [--sandbox] # autonomous
./scripts/ralph/ralph-pr.sh <prd-issue> [base]       # open PR after Ralph
```

Ralph picks up issues labeled `ralph`. It runs TDD, enforces coverage, and (post
PRD #183) reports a `smoke: PASS|FAIL` line in each commit body.

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
