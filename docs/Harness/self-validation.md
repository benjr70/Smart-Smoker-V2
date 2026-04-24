# Self-Validation

Runtime gates. These let a running service or an agent verify the system is actually working — not just that the build passed.

## Health and readiness endpoints

Every NestJS app exposes two endpoints under `/api/`:

| Endpoint | Purpose | Status codes |
|----------|---------|--------------|
| `GET /api/health` | Liveness — "am I running?" | 200 always (unless the process is dead) |
| `GET /api/ready` | Readiness — "can I serve traffic?" | 200 healthy, 503 degraded |

### Backend (`apps/backend`)

`/api/ready` checks Mongoose connection state:

```bash
curl http://localhost:3001/api/health
# {"status":"ok","timestamp":"2026-04-20T...","uptime":123.45,"environment":"production"}

curl http://localhost:3001/api/ready
# {"status":"ready","timestamp":"...","checks":{"mongo":"connected"}}
```

If Mongo is disconnected, `/api/ready` returns 503 with `"checks": {"mongo": "disconnected"}`.

### Device Service (`apps/device-service`)

`/api/ready` checks serial port + backend socket. In `NODE_ENV=local` (emulator mode) it reports `"serial":"emulator"` because there is no real USB device.

```bash
curl http://localhost:3003/api/ready
# {"status":"ready","timestamp":"...","checks":{"serial":"emulator","backend":"connected"}}
```

## Structured JSON logs

Backend and device-service use [`nestjs-pino`](https://github.com/iamolegga/nestjs-pino) instead of the default NestJS logger.

- **Production** (`NODE_ENV=production`): raw JSON on stdout. Log aggregators (Loki, ELK) ingest without transformation.
- **Local dev** (`NODE_ENV=local`): `pino-pretty` is wired, so you get human-readable colored output.

Tail a container:

```bash
docker logs backend-container 2>&1 | jq 'select(.level >= 40)'   # warnings and above
docker logs device-service-container 2>&1 | jq 'select(.req)'    # just HTTP request logs
```

The frontend and Electron apps still use `console.*` — they run in browsers/Electron renderer, where pino adds weight without matching upside.

## Smoke script

`scripts/smoke/run.ts` is a Playwright-based probe. It checks backend health + readiness, device service health + readiness (if provided), then loads the frontend and takes a screenshot.

### Install

```bash
npm --prefix scripts/smoke ci                   # installs playwright + tsx
npm --prefix scripts/smoke run smoke:install    # downloads chromium
```

### Invoke

```bash
# Defaults: localhost:3000 frontend, localhost:3001 backend
npm --prefix scripts/smoke run smoke

# Explicit targets
npm --prefix scripts/smoke run smoke -- \
  --frontend https://smoker-dev-cloud.tail74646.ts.net \
  --backend https://smoker-dev-cloud.tail74646.ts.net:8443 \
  --device http://localhost:3003 \
  --artifacts /tmp/smoke-artifacts \
  --timeout 30000

# Env var fallbacks
SMOKE_FRONTEND_URL=... SMOKE_BACKEND_URL=... npm --prefix scripts/smoke run smoke
```

### Exit codes

- `0` — all checks passed
- `1` — one or more probes failed
- `2` — unexpected error (browser launch, config parse, etc.)

### Artifacts

On success: `frontend-ok.png` saved to `--artifacts` directory.
On failure: `frontend-fail.png` or `frontend-error.png` plus a stack trace in the console.

### Output format

```
[HEALTH] backend  ... PASS (42ms)
[READY]  backend  ... PASS (15ms)
[HEALTH] device   ... PASS (11ms)
[READY]  device   ... PASS (8ms)
[LOAD]   frontend ... PASS (2141ms)   screenshot=frontend-ok.png
smoke: PASS (5/5)
```

The final `smoke: PASS (n/n)` or `smoke: FAIL (k/n failed)` line is parsed by Ralph's validator (see below).

## Ralph self-validation

Ralph (`scripts/ralph/ralph-prompt.md`) runs the smoke script after finishing TDD on an issue. The result lands in the commit body as a trailer:

```
feat(backend): add /api/smokes endpoint

... body ...

smoke: PASS — 5/5 probes green
```

Possible trailer values:

- `smoke: PASS — <detail>` — all probes passed against a local `docker compose up -d` target
- `smoke: FAIL — <detail>` — one or more probes failed; Ralph will also self-label the issue `ralph:blocked` so the next iteration skips it
- `smoke: SKIPPED — <reason>` — environment cannot run the smoke (no docker, offline, etc.); Ralph reports the reason rather than silently passing

This trailer is required. A PR reviewer can scan commit bodies and see that every Ralph-authored change had its smoke reported.

## Deploy workflow integration

The smoke script runs post-deploy in three workflows:

| Workflow | Target | Runs after | Artifact name |
|----------|--------|------------|---------------|
| `cloud-deploy.yml` | `localhost:3000` / `localhost:3001` (runner-local) | 60s startup sleep | `cloud-deploy-smoke-artifacts` |
| `dev-deploy.yml` | `smoker-dev-cloud.tail74646.ts.net` via Tailscale | Tailscale Serve config | `dev-deploy-smoke-artifacts` |
| `smoker-deploy.yml` | `localhost:3003` (backend-only, Electron GUI skipped) | 30s stabilize sleep | `smoker-device-smoke-artifacts` |

All three steps are currently `continue-on-error: true` (advisory). They upload screenshots as GitHub Actions artifacts with 7–14 day retention so you can debug a failed probe without redeploying.

Each step is tagged `id: smoke` so the Week-3 blocking flip is a grep-and-edit across those three files.

## When a probe fails

1. Check the artifact — screenshot tells you if the frontend rendered at all
2. SSH in and curl the endpoint manually — `/api/ready` returns structured `checks` explaining which dep is failing
3. Check the container logs — pino JSON is searchable with `jq`
4. If it is a transient Mongo/Tailscale hiccup, re-run the workflow; if it reproduces, investigate the dep that `/api/ready` flagged

## Related

- [Backpressure](backpressure.md) — commit + PR gates (the layer above these)
- [Infrastructure](infra.md) — infra-level validation (post-provision smoke, compose healthchecks)
- [Deployment / Health Checks](../Infrastructure/features/deployment/health-checks.md) — the deploy-side of the same story
