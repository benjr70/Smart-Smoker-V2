# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Smart Smoker V2 is an IoT smoking device management system. It controls and monitors smoking equipment through multiple interconnected applications: web frontend, Electron desktop app, NestJS API backend, a hardware bridge microservice, and Arduino firmware.

## Monorepo Structure

npm workspaces monorepo with 4 apps and 1 shared package:

- **`apps/backend/`** — NestJS API server (MongoDB/Mongoose, WebSockets via Socket.io, Swagger)
- **`apps/device-service/`** — NestJS microservice bridging serial/USB/WiFi to Arduino hardware
- **`apps/frontend/`** — React 18 + Material-UI + D3.js web app (Webpack)
- **`apps/smoker/`** — Electron desktop app (Electron Forge + React + MUI + D3.js)
- **`packages/TemperatureChart/`** — Shared D3.js temperature chart component used by frontend and smoker

Data flow: `Frontend/Smoker App → Backend (REST + WebSocket) → Device Service (serial) → MicroController → Physical Hardware`

## Build & Development Commands

**Always run bootstrap first** (uses `--legacy-peer-deps` — required for all `npm install` in this repo):
```bash
npm run bootstrap
```

Start all services: `npm start`

Individual services from root:
```bash
npm run back:start        # Backend (NestJS dev mode)
npm run front:start       # Frontend (webpack dev server)
npm run smoker:start      # Electron app
npm run devices:start     # Device service
```

Lint and format from root:
```bash
npm run lint              # ESLint all apps + packages
npm run lint:fix          # ESLint with auto-fix
npm run format            # Prettier write
npm run format:check      # Prettier check
```

Clean reinstall: `npm run clean:install`

## Testing

**Tests must be run from within each app directory, not from root.**

```bash
cd apps/backend && npm test            # Unit tests
cd apps/backend && npm run test:cov    # With coverage
cd apps/backend && npm run test:e2e    # E2E tests

cd apps/device-service && npm test
cd apps/device-service && npm run test:cov

cd apps/frontend && npm test
cd apps/smoker && npm test
cd packages/TemperatureChart && npm test
```

### Coverage Thresholds (CI-enforced)

| App | Lines | Functions | Branches | Statements |
|-----|-------|-----------|----------|------------|
| backend | 80% | 80% | 80% | 80% |
| device-service | 75% | 75% | 75% | 75% |
| frontend | 75% | 75% | 70% | 75% |
| smoker | 80% | 80% | 75% | 80% |
| TemperatureChart | 75% | 45% | 75% | 75% |

## Architecture & Conventions

### Backend (NestJS)
- Modular architecture: each feature is a NestJS module (smoke, temps, smokeProfile, presmoke, postSmoke, notifications, history, ratings, settings, health)
- Pattern: Controller → Service → Mongoose Model, with DTOs for validation (class-validator)
- WebSocket Gateways handle real-time updates; State module is the central state singleton
- Swagger/OpenAPI decorators on all controllers

### Frontend / Smoker (React)
- **Functional components with hooks only** — no class components (exception: error boundaries)
- Material-UI for all UI components
- D3.js for temperature visualization via shared TemperatureChart package

### Naming Conventions
- Backend files: `kebab-case` (e.g., `smoke-profile.service.ts`)
- Frontend components: `PascalCase` (e.g., `TemperatureChart.tsx`)
- Constants/env vars: `UPPER_SNAKE_CASE`

### TypeScript
- Strict mode enforced in all apps
- Prefer explicit types over `any`

## Infrastructure

- **Docker**: Dockerfiles per app, compose files: `cloud.docker-compose.yml`, `smoker.docker-compose.yml`, `virtual-smoker.docker-compose.yml`
- **Terraform**: `infra/proxmox/terraform/` with environments: dev-cloud, prod-cloud, github-runner, virtual-smoker
- **CI/CD**: GitHub Actions — tests, builds, Docker multi-arch publishing (amd64 + arm/v7), Terraform validation, Ansible linting
- **Docs**: MkDocs (`mise run docs-serve` to preview locally)

## Default Ports

| Service | Port |
|---------|------|
| Backend | 3001 |
| Frontend | 3000 |
| Device Service | 3003 |
| Smoker (Electron) | 8080 |

## Ralph Loop (Autonomous Issue Implementation)

Autonomous development pipeline that takes features from idea to PR. See [scripts/ralph/USAGE.md](scripts/ralph/USAGE.md) for the full workflow guide.

```bash
# One-time setup (creates GitHub labels, checks prerequisites)
./scripts/ralph/ralph-setup.sh

# Human-in-the-loop (single issue, you approve each edit)
./scripts/ralph/ralph-once.sh [issue-number]

# Fully autonomous (implements up to N issues)
./scripts/ralph/ralph-afk.sh <max-iterations> [--sandbox]

# Open a PR after Ralph completes
./scripts/ralph/ralph-pr.sh <prd-issue-number> [base-branch]
```

### Full Pipeline
1. `/grill-me` — stress-test a feature idea
2. `/write-a-prd` — formalize as a GitHub issue PRD
3. `/prd-to-issues` — break PRD into vertical-slice issues (AFK slices get `ralph` label)
4. `git checkout -b feat/<name>` — create feature branch
5. `./scripts/ralph/ralph-afk.sh 10` — autonomously implement all issues using TDD
6. `./scripts/ralph/ralph-pr.sh <prd-number>` — open a PR
