# Backpressure

Commit-time and PR-time gates. These run before code lands and catch regressions at the earliest, cheapest point.

All gates here are currently **advisory** per the [PRD #183 rollout plan](index.md#advisory-blocking-rollout). They warn but do not block — flip to blocking ~2 weeks after the original merge.

## Pre-commit hook

`.husky/pre-commit` runs `lint-staged` on staged files. `lint-staged` config lives in the root `package.json`.

What it does per file type:

- `*.{ts,tsx,js,jsx}` — eslint `--fix` then prettier
- `*.{json,md,yml,yaml}` — prettier only

What it does when missing `npx`: the hook prepends `~/.local/share/mise/shims` and common node paths to PATH, then checks `command -v npx`. If still missing (Docker Desktop git commits, CI sandbox), it prints a warning and exits 0 — the commit still succeeds during the advisory window.

Manual trigger (useful when debugging):

```bash
npx lint-staged        # run against currently staged files
npm run fix            # repo-wide lint + format pass (escape hatch)
```

Bypass (during advisory window only — do not ship muscle memory):

```bash
git commit --no-verify
```

## Typecheck CI

`.github/workflows/typecheck.yml` is a reusable workflow called from `ci-tests.yml`. Runs `tsc --noEmit` per app.

Why it exists: `tsc` only runs as a side-effect of `npm run build` today, so a broken type imported by an app that is not built in CI can slip through. This makes the check explicit and cheap.

## E2E in CI

`.github/workflows/e2e.yml` is reusable (`workflow_call`). The `apps` input is a JSON array — it iterates and runs `npm run test:e2e` in each matching app directory, skipping apps that have no `test/jest-e2e.json`.

Invoked today from `ci-tests.yml`:

```yaml
e2e:
  uses: ./.github/workflows/e2e.yml
  with:
    apps: '["device-service"]'
    blocking: false   # advisory until Week-3 flip
```

Add an app to the matrix when it grows real E2E coverage. Today only `device-service` is wired.

## Docker build on PR

`.github/workflows/docker-build-pr.yml` builds every app's Dockerfile on PRs that touch `apps/*/Dockerfile` or `*.docker-compose.yml`. No push — the image is discarded after build.

Matrix: `[backend, device-service, frontend, smoker]`, `platforms: linux/amd64` only (arm/v7 is reserved for the publish workflow to save CI minutes).

What this catches: broken `FROM`, missing `COPY` sources, `npm install` failures that today only surface when `publish.yml` runs on merge.

## Docs-freshness

`.github/workflows/docs-freshness.yml` checks that PRs which modify public surfaces also update the corresponding docs.

Pairing rules:

| Change trigger | Required docs update |
|----------------|----------------------|
| `apps/backend/src/**/*.{controller,dto}.ts` | `docs/Backend/**` |
| `apps/device-service/src/**/*.{controller,dto}.ts` | `docs/Device Service/**` |
| `infra/proxmox/terraform/**` | `docs/Infrastructure/**` |
| `infra/proxmox/ansible/**` | `docs/Infrastructure/**` |

The workflow posts a sticky PR comment listing which pairing failed. Opt-in only for the four categories above — adding a new pair means editing the `check_pair` calls in the workflow.

Bypass during advisory window: the workflow sets `continue-on-error: true`, so a failure is a warning comment, not a red X.

## When a gate fires

Advisory output shows up as:

- GitHub Actions: job succeeds but the step summary contains `::warning::` lines
- PR comments: sticky comments with a marker like `<!-- docs-freshness -->` or `<!-- terraform-plan-pr -->`
- Local commits: husky prints the lint-staged output inline; the commit succeeds

When we flip blocking (Week 3):

- Workflows fail the job; PR checks show red
- Husky exits non-zero; commit is rejected
- Bypass becomes `--no-verify` (and requires a good reason in the PR description)

## Related

- [Self-validation](self-validation.md) — runtime + post-deploy gates (the layer below these)
- [Infrastructure](infra.md) — infra-specific gates (terraform, ansible, compose)
- [CI-CD / GitHub Actions](../CI-CD/github-actions.md) — the broader CI overview
