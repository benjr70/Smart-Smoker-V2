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
- **Per-PR URL bake (backend only)** — the smoker web bundle compiles its cloud
  URLs in at image-build time, so remapping its ports alone would leave the
  served page calling the default ports. The derived document passes the
  remapped **backend** host URLs to the smoker image build as `SMOKER_CLOUD_URL`
  / `SMOKER_CLOUD_URL_API` args, and `stack.Dockerfile` rewrites the static e2e
  env with them before webpack runs. The default e2e stack passes no args and
  builds exactly as before.

  **Known gaps — the smoker page is not yet fully reachable in a per-PR stack**
  (tracked in [#400](https://github.com/benjr70/Smart-Smoker-V2/issues/400)):
  the device-service URL is _not_ baked, because the smoker app hardcodes it
  (`apps/smoker/src/api/client.ts`, `home.tsx`), so its temp socket still dials
  `:3003`; and the backend's CORS allowlist (`apps/backend/src/main.ts`) does
  not include the per-PR smoker origin, so cloud REST responses are blocked in a
  browser even though websockets pass (the gateway allows `*`). Both must be
  fixed before the slice-4 pilot.

- **Master fallback** — a branch that predates the e2e compose file
  transparently uses the `master` copy (materialised via `git show`).

## Usage

```bash
cd scripts/stack-runner
npm install

# Boot the stack for PR 328 (builds images from the current checkout):
npx tsx cli.ts up --pr 328

# Tear it down (containers + volumes; idempotent):
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
  then `down --pr <n>` and confirm the containers and the mongo volume are gone.
