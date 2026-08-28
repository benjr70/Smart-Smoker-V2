# Contributing

Thanks for taking an interest in Smart Smoker V2. This is a personal IoT project
published as a showcase, so the maintainer's own hardware and cloud environment
drive most of the roadmap — but bug reports, questions and focused pull requests
are welcome.

## Getting set up

The repo is an npm workspaces monorepo. Peer dependencies across the React,
Electron and NestJS apps do not resolve cleanly on npm's default algorithm, so
**every** install in this repo needs `--legacy-peer-deps`. The bootstrap script
already passes it:

```bash
npm run bootstrap
```

Start everything with `npm start`, or a single service:

```bash
npm run back:start      # Backend  (http://localhost:3001)
npm run front:start     # Frontend (http://localhost:3000)
npm run devices:start   # Device service (http://localhost:3003)
npm run smoker:start    # Electron smoker app
```

## Running tests

Tests are run **from inside each app directory**, not from the repo root — each
workspace has its own Jest config, and the root has no aggregate test script.

```bash
cd apps/backend && npm test
cd apps/device-service && npm test
cd apps/frontend && npm test
cd apps/smoker && npm test
cd packages/TemperatureChart && npm test
```

Add `npm run test:cov` in the same directory to check coverage, and
`npm run test:e2e` in `apps/backend` for the backend end-to-end suite.

There are also shell test suites for repo-level contracts (compose files, deploy
scripts, release config, repo shape). Run one directly, for example:

```bash
bash scripts/repo-shape.test.sh
```

### Coverage thresholds

CI fails a pull request that drops any workspace below its threshold, so run
`npm run test:cov` locally before pushing.

| App              | Lines | Functions | Branches | Statements |
| ---------------- | ----- | --------- | -------- | ---------- |
| backend          | 80%   | 80%       | 80%      | 80%        |
| device-service   | 75%   | 75%       | 75%      | 75%        |
| frontend         | 75%   | 75%       | 70%      | 75%        |
| smoker           | 80%   | 80%       | 75%      | 80%        |
| TemperatureChart | 75%   | 75%       | 75%      | 75%        |

## Lint and formatting

Run these from the repo root before you open a pull request; CI checks both.

```bash
npm run lint:fix
npm run format
```

`npm run lint` and `npm run format:check` are the read-only equivalents CI uses.

## Pull requests

- **Conventional-commit PR titles are enforced.** The title must look like
  `type(scope): summary` — for example
  `fix(backend): stop double-counting probe ticks`. Allowed types follow the
  Conventional Commits spec (`feat`, `fix`, `chore`, `docs`, `refactor`, `test`,
  `ci`, `build`, `perf`, `style`, `revert`). Scope is usually the app most
  affected (`backend`, `frontend`, `smoker`, `device-service`), or `monorepo`
  when a change spans several.
- **Merges are squash-only.** The PR title becomes the commit subject on
  `master`, which is what release-please reads to cut the next release and
  changelog entry — so the title matters more than your individual commits.
- Write tests with the change, not after it. New behaviour should be verifiable
  through a public interface (an HTTP route, an exported function, rendered UI),
  not by asserting on internals.
- Keep pull requests to a single vertical slice where you can. Small, reviewable
  changes get merged; sweeping refactors usually do not.

## Reporting problems

Open a GitHub issue for bugs and feature ideas. For anything security-sensitive,
follow [SECURITY.md](SECURITY.md) instead of filing a public issue.
