# Stack Runner

Hermetic per-PR stack runner. One command boots the entire Smart Smoker app
built from a PR checkout; one command tears it down cleanly. This is slice 1
(the tracer bullet) of the verify-pr harness — PRD #327 — and the foundation
every later slice drives through.

It wraps the merged e2e compose stack (PRD #314,
`e2e/docker/docker-compose.e2e.yml`) with per-PR isolation:

- **Per-PR project name** — `smoker-pr-<n>`, so many PR stacks coexist.
- **Alternate port block** — five host ports derived deterministically from the
  PR number in the 20000+ range, never colliding with the dev defaults
  (3000–3003, 8080, 27017) or with another PR's block.
- **Complete derived compose file** — because compose _concatenates_ `ports`
  across `-f` overlays (so an override cannot remap a hard-coded host port), the
  runner reads the base file and emits a full derived document with per-project
  container names, replaced host ports, a published mongo port, and an
  absolutised build context. The shared compose file is **never modified**.
- **Per-PR URL bake** — the smoker web bundle compiles its host URLs in at
  image-build time, so remapping its ports alone would leave the served page
  calling the default ports. The derived document passes the remapped host URLs
  to the smoker image build as `SMOKER_CLOUD_URL` / `SMOKER_CLOUD_URL_API`
  (backend REST + socket) and `SMOKER_DEVICE_URL` (device-service temp socket)
  args; `stack.Dockerfile` rewrites the static e2e env with them and recompiles
  the bundle before it is served. The smoker app reads the device URL through
  `apps/smoker/src/api/deviceUrl.ts`, which falls back to the loopback default
  when nothing was baked in — so the default e2e stack passes no args and builds
  exactly as before.
- **Per-PR CORS origins** — the backend's allowlist is a fixed list of deployed
  origins, so a per-PR UI's REST calls would be blocked in a host browser (the
  websocket gateway allows `*`, which makes that failure look partial). The
  derived document passes the per-PR smoker + frontend origins to the backend as
  `CORS_EXTRA_ORIGINS`, which `apps/backend/src/cors-origins.ts` appends to the
  static list at boot. Unset — every deployment and the default e2e stack — the
  allowlist is unchanged.
- **Per-PR image tags** — the derived document drops the base file's fixed
  `image:` tag from every built service, so compose tags each stack's build
  `<project>-<service>`. Two concurrent stacks therefore cannot retag one shared
  image between another's build and its container creation, and
  `down --rmi local` reclaims exactly those builds (the pulled `mongo:7.0` is
  left alone).
- **Master fallback** — a branch that predates the e2e compose file
  transparently uses the `master` copy (materialised via `git show`).

## Usage

```bash
cd scripts/stack-runner
npm install

# Boot the stack for PR 328 (builds images from the current checkout):
npx tsx cli.ts up --pr 328

# Tear it down (containers + volumes + this project's images; idempotent):
npx tsx cli.ts down --pr 328
# or by explicit project name:
npx tsx cli.ts down --project smoker-pr-328
```

`up` blocks until every service answers its health endpoint, then prints the
stdout contract (progress logs go to stderr, so stdout stays parseable):

```
E2E_FRONTEND_URL=http://localhost:23280
E2E_BACKEND_URL=http://localhost:23281
E2E_DEVICE_URL=http://localhost:23282
E2E_SMOKER_URL=http://localhost:23283
E2E_MONGO_URL=mongodb://localhost:23284/smartsmoker
STACK_PROJECT_NAME=smoker-pr-328
```

The keys are exactly the env vars the e2e Playwright suite reads, so the block
can be sourced directly as the environment for a later test-run slice.

## Tests

```bash
cd scripts/stack-runner
npm test         # unit tests (node:test via tsx) — no docker needed
npm run typecheck
```

Unit tests cover the pure, critical behaviors from issue #328 (all without
docker): deterministic naming/ports, the stdout contract, compose-file fallback,
the derive transform, down idempotency, and cleanup-on-failed-up.

### Manual verification (docker-dependent)

Behaviors that need a real docker daemon are verified by hand on the always-on
box (they are exercised through the injected command runner in unit tests, but a
live end-to-end run is the real proof):

- **Failed `up` leaves no orphans** — run `up` with a deliberately broken build,
  then confirm `docker ps -a`/`docker volume ls` show nothing for the project.
- **Live `up` → health probe → `down`** — `up --pr <n>`, curl the printed URLs,
  then `down --pr <n>` and confirm the containers, the mongo volume and the
  `<project>-<service>` images are gone.
- **Per-PR URLs reach the stack's own services** — open the printed
  `E2E_SMOKER_URL` in a host browser and confirm, in devtools, that its API and
  socket requests go to the printed backend/device ports (never 3001/3003) and
  return 200 rather than a CORS error.
