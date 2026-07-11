# e2e — Playwright user-journey suite

End-to-end tests that drive the **real** Smart Smoker V2 stack (web frontend +
smoker touchscreen web app) against a hermetic, docker-composed instance of
every service built from the current checkout. This is the tracer-bullet slice:
one lifecycle journey plus the page objects and compose harness that later
slices extend.

## What runs

`docker/docker-compose.e2e.yml` builds four services from source (amd64) plus a
fresh mongo:

| Service        | Host port | Notes                                              |
| -------------- | --------- | -------------------------------------------------- |
| backend        | 3001      | NestJS API + websocket gateway                     |
| device-service | 3003      | `NODE_ENV=local` emulator: synthetic temps/500ms   |
| frontend       | 3000      | nginx SPA, proxies `/api` + `/socket.io` → backend |
| smoker         | 8080      | touchscreen app served as a web page               |
| mongo          | —         | internal only; fresh volume each run               |

The smoker bundle is built with localhost-pointing backend env
(`docker/smoker.e2e.env`); it hardcodes `127.0.0.1:3003` for device-service in
source, which the published host port satisfies.

## Run it locally

Two commands. From this `e2e/` directory:

```bash
# 1. Build + boot the whole stack (first run pulls/builds images)
npm run stack:up

# 2. Run the suite against it
npm test
```

Tear down (removes the mongo volume so the next run starts fresh):

```bash
npm run stack:down
```

First-time-only Playwright browser install (chromium):

```bash
npx playwright install --with-deps chromium
```

## Layout

- `playwright.config.ts` — `hermetic` project, chromium, retries 2,
  trace-on-first-retry. Base URLs resolve from env with localhost defaults.
- `src/config/urls.ts` — env-overridable service URL resolution.
- `src/helpers/wait-for-healthy.ts` + `src/global-setup.ts` — block the run
  until every service answers its health endpoint.
- `src/pageObjects/FrontendApp.ts`, `SmokerApp.ts` — all selectors live here;
  specs contain journey logic only.
- `tests/lifecycle.spec.ts` — pre-smoke → start smoke (smoker UI) → live chart
  (frontend) → post-smoke → history.

## Notes

- This workspace is exempt from the repo coverage thresholds — it is a journey
  suite, not a coverage target.
- The existing `scripts/smoke/` deploy probe is untouched and unrelated.
