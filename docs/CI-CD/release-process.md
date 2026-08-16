# Release Process

Releasing to production is **one deliberate action: merge the release PR**.
Everything before that merge is automated bookkeeping, and everything after it
is a pipeline that builds from the release tag, deploys prod and gates on smoke
tests.

There is no longer a version number to invent or a tag to cut by hand.

!!! warning "Two repo settings are still pending"
    Parts of this flow depend on maintainer-only settings changes that have
    **not** been made yet (PRD #498 maintainer checklist):

    - **`production` environment gate** — still configured with required
      reviewer **benjr70** and a **5-minute wait timer**, so the deploy job
      currently pauses for an approval click after the Release is published.
      The intent is to remove it so the release-PR merge is the sole approval;
      until then the merge is the *first* approval, not the only one.
    - **Squash-only merging** — merge commits and rebase merges are still
      enabled repo-wide. release-please only reads what lands on `master`, so a
      non-squash merge of a feature branch feeds it the branch's individual
      commit subjects instead of the PR title.

    Both are called out inline below where they matter.

## The flow end to end

```mermaid
flowchart TD
    A["PR merged to master<br/>(squash, conventional title)"] --> B["release-please.yml<br/>(push: master)"]
    B --> C["Release PR<br/>'chore(master): release X.Y.Z'<br/>version bumps + CHANGELOG"]
    C -->|maintainer merges<br/>(admin bypass)| D["Tag vX.Y.Z<br/>+ GitHub Release published"]
    D --> E["prod-deploy.yml<br/>build cloud images from tag → environment approval (pending removal) → deploy prod → smoke gate"]
    D --> F["release.yml<br/>build smoker images from tag → push :latest"]
    F --> G["Watchtower on the Pi<br/>picks up :latest on its next poll"]
```

| Stage | Where it lives | Trigger |
| --- | --- | --- |
| Maintain the release PR | `.github/workflows/release-please.yml` | every push to `master` |
| Cut the tag + Release | same workflow, on merge of the release PR | merge of the release PR |
| Build + deploy the cloud | `.github/workflows/prod-deploy.yml` | `release: published` |
| Build + publish smoker images | `.github/workflows/release.yml` | `release: published` |
| Ship to the physical device | Watchtower on the Pi | `:latest` moving |

## 1. What creates a release PR

release-please reads the **commit subjects on `master`**. The intended shape is
one squashed commit per PR, so the subject is the **PR title** — squash-only
merging is a pending repo setting (merge commits and rebase merges are still
enabled), so until it is flipped, take care to squash-merge. Bump rules are the
release-please defaults:

| Title prefix | Effect |
| --- | --- |
| `feat: …` / `feat(scope): …` | minor bump |
| `fix: …` / `fix(scope): …` | patch bump |
| `feat!: …`, `fix(scope)!: …`, or `BREAKING CHANGE:` in the body | major bump |
| `chore`, `docs`, `ci`, `refactor`, `test`, `perf`, `build`, `style`, `revert` | **no release** |

A stretch of master containing only chore/docs/ci commits produces **no release
PR at all** — that is intended, not a failure. If you expected a release PR and
none appeared, the first thing to check is whether the merged PR titles were
conventional (see [PR title convention](#2-pr-title-convention)).

The release PR is always open and always up to date: every further merge to
master amends it with the new changelog entries and, if warranted, a bigger
bump. It contains:

- the new version in the root `package.json` and `.release-please-manifest.json`
- the same version in `apps/backend`, `apps/frontend`, `apps/smoker`,
  `apps/device-service` and `packages/TemperatureChart` (`extra-files` in
  `release-please-config.json`)
- the `temperaturechart` dependency range in `apps/frontend` and `apps/smoker`
  rewritten to match, so `npm ci` keeps resolving the workspace link across a
  major bump
- the generated `CHANGELOG.md` entry

The other workspaces are deliberately **not** versioned — they are internal and
never published. `packages/theme`, `packages/api-transport` and
`packages/smoke-session` stay at `1.0.0` so the `^1.0.0` ranges that
`apps/frontend` and `apps/smoker` use to link them keep resolving; `e2e` is at
`0.1.0` and nothing depends on it by range at all.

Configuration lives in `release-please-config.json` (manifest mode, single
repo-wide version, `release-type: node`) and `.release-please-manifest.json`
(bootstrapped at `1.7.0`). Both are pinned by
`scripts/release/release-please-config.test.sh`.

## 2. PR title convention

On a squash merge the PR title *is* the commit that release-please parses. A
non-conventional title is invisible to the release machinery — it ships in the
diff but contributes nothing to the version or the changelog. (Squash-only
merging is not enforced in repo settings yet — see the pending-settings note at
the top — so a merge-commit or rebase merge currently bypasses the title
entirely and feeds branch commit subjects to release-please instead.)

Format:

```
<type>[(scope)][!]: <subject>
```

- **type** — one of `feat`, `fix`, `chore`, `docs`, `ci`, `refactor`, `test`,
  `perf`, `build`, `style`, `revert`. Lowercase.
- **scope** — optional, no spaces or parentheses: `backend`, `frontend`,
  `smoker`, `device-service`, `monorepo`, `ci`, …
- **`!`** — the breaking-change marker; forces a major bump.
- **subject** — required, after `": "`.

The issue reference goes in the **PR body**, not the title:

```
feat(backend): add probe-alert thresholds endpoint

Closes #503
```

GitHub still auto-closes the issue from the body, and the title stays parseable.
The legacy `Closes #N: …` title shape is explicitly rejected by the validator.

### Check a title before opening the PR

```bash
bash scripts/validate-pr-title.sh "feat(backend): add probe-alert thresholds endpoint"
# → PR title OK: feat(backend): add probe-alert thresholds endpoint

bash scripts/validate-pr-title.sh "Closes #503: add endpoint"
# → Invalid PR title: legacy 'Closes #N: ...' shape is no longer allowed …  (exit 1)
```

The script is the single source of truth for the rules: it takes a title (arg or
`PR_TITLE` env var), prints the reason on stderr and exits `0`/`1`/`2`. Its own
test suite is `scripts/validate-pr-title.test.sh`.

`.github/workflows/pr-title-lint.yml` is a thin wrapper around that same script
and runs on every PR. It is currently **advisory** (`continue-on-error`) — a bad
title annotates a warning rather than turning the PR red — and it is not yet in
branch protection. Flipping it to a required check is a maintainer settings
change, done once the agent PR templates emit conventional titles. The
`validator-tests` job in the same workflow is *not* advisory and must stay green.

## 3. Merging the release PR

Merging the release PR is the release, and it is intended to become the only
human approval in the pipeline (one further approval click is still required at
the `production` environment gate until that setting is removed — see
[§4](#cloud-prod-prod-deployyml)). On merge, release-please:

1. lands the version-bump + CHANGELOG commit on master,
2. creates the `vX.Y.Z` tag,
3. publishes the GitHub Release with the changelog as its body.

!!! note "Admin bypass is expected"
    The release PR is authored under the maintainer's own PAT identity, so it
    cannot be self-approved under master's 1-review branch protection. The
    maintainer merges it with an admin bypass. This is a deliberate trade-off
    accepted instead of introducing a GitHub App identity.

**Do not** create tags or Releases by hand as the normal path. A hand-cut tag
skips the version bumps and the changelog, so the version an app reports stops
matching what was deployed.

## 4. What the published Release does

### Cloud (prod) — `prod-deploy.yml`

1. **Resolve version** from the release tag (or from the `workflow_dispatch`
   input), normalized to `X.Y.Z` / `vX.Y.Z`; a malformed version fails fast.
2. **Probe Docker Hub** for `smart-smoker-backend:vX.Y.Z` and
   `smart-smoker-frontend:vX.Y.Z`.
3. **Build from the tag** (`publish.yml`, `mode: release`, `ref: vX.Y.Z`,
   `prebuild: true`, amd64 + arm/v7) — skipped when both images already exist,
   which keeps `:vX.Y.Z` immutable and stops a re-deploy from dragging `:latest`
   backwards.
4. **Deploy** — the deploy job targets the `production` GitHub environment,
   which **currently gates it on a required-reviewer approval (benjr70) plus a
   5-minute wait timer**. The run therefore parks until that approval is given.
   Once approved, the deploy runs on the self-hosted proxmox runner via
   `scripts/deploy-cloud.sh` over SSH: compose file, mongo init, `deployment-backup.sh`,
   `deployment-health-check.sh` and `rollback.sh` are shipped to the host, prod
   secrets are written to `.env`, containers are recreated pinned to `vX.Y.Z`,
   and a failed health check triggers the rollback script.
5. **Notify Discord** with success/failure and the run URL.
6. **Smoke gate (blocking)** — `scripts/smoke` runs against the public funnel
   URLs on a GitHub-hosted runner; a red smoke job fails the whole release run
   and uploads screenshots/traces as `prod-deploy-smoke-artifacts`.

Images are built **from the release tag**, never promoted from `:nightly`.
Promotion could ship a different commit than the one that was tagged; building
at the tag removes that class of "released X but deployed Y" incident entirely.

!!! warning "The environment approval gate is still in place (pending removal)"
    The `production` environment currently has **required reviewer benjr70 and a
    5-minute wait timer**, so a published Release parks at the deploy job until
    it is approved. Removing that gate — making the release-PR merge the sole
    approval and the deploy unattended — is a maintainer-only settings change
    from the PRD #498 checklist that has not been done yet. Until then, watch
    for the pending-approval notification after merging the release PR.

    Every other safeguard — health check with retries, rollback script on the
    host, Discord notification, blocking post-deploy smoke — is unchanged and
    stays in place after the gate is removed.

### Smoker device — `release.yml`

Unchanged by the release-please cutover: the same `release: published` event
builds `smoker`, `device-service` and `electron-shell` from the tag and
publishes `:latest`. There is no deploy job for the device — publishing
`:latest` *is* the deployment, applied by Watchtower on its next 300s poll after
the device is powered on. See
[Physical Smoker Device](smoker-device.md).

## 5. Token requirements (`RUNNER_PAT`)

`release-please.yml` authenticates with the **`RUNNER_PAT`** secret, not the
default `GITHUB_TOKEN`.

**Why `GITHUB_TOKEN` cannot work:** GitHub deliberately suppresses workflow
events for actions taken by `GITHUB_TOKEN`. A Release created with it emits no
`release: published` event, so `prod-deploy.yml` and `release.yml` would never
fire — the release would be tagged and then silently go nowhere.

**Required access** on `benjr70/Smart-Smoker-V2`:

| Permission | Why |
| --- | --- |
| Contents: read & write | push the release commit, create the `vX.Y.Z` tag and the Release |
| Pull requests: read & write | open and keep updating the release PR |

A classic PAT with the `repo` scope covers both. The same secret is also used
for runner auto-registration (which additionally needs Administration: read &
write) — see
[Secrets Management](../Infrastructure/features/security/secrets-management.md).

**When the PAT expires or loses scope**, the failure is quiet in the worst way:

- release-please's job fails (or 403s) on push to master → **no release PR is
  created or updated**, and master silently accumulates unreleased features;
- if a Release is somehow cut with a weaker token, **prod-deploy and the smoker
  image build never trigger** — you get a tag and a Release with nothing
  deployed.

So: note the expiry, rotate ahead of it, and if releases "stop happening",
check the Release Please workflow runs before suspecting the bump rules.

## 6. Escape hatches

The manual entry points still exist. They are for recovery, not for routine
releases.

| Situation | Action |
| --- | --- |
| Re-deploy an already-released version (rollback, or re-run after a red smoke job) | `gh workflow run prod-deploy.yml -f version=v1.6.0` — idempotent: the build is skipped because `vX.Y.Z` already exists, so the exact same images are redeployed |
| Re-publish smoker/device images for an existing tag | `gh workflow run release.yml -f version=v1.6.0` |
| `smoker.docker-compose.yml` changed (Watchtower will not pick it up) | Dispatch **Device Deploy** — see [Physical Smoker Device](smoker-device.md) |
| Pin the cloud host to a version by hand | See [Manual Deployment Runbook](manual-version-deployment.md) |

Using `workflow_dispatch` with a version that was never released will attempt a
build from a tag that may not exist, and will not update the changelog or any
`package.json`. Prefer landing a `fix:` and merging the release PR.

## 7. Troubleshooting

| Symptom | Likely cause | Check |
| --- | --- | --- |
| No release PR after merging a feature | PR title was not conventional, or only chore/docs/ci landed | the merged titles on master; re-run `bash scripts/validate-pr-title.sh "<title>"` |
| No release PR *and* nothing in Actions | `RUNNER_PAT` expired or lost scope | the **Release Please** workflow runs |
| Release published but prod never deployed | Release was created by `GITHUB_TOKEN` (e.g. a hand-rolled workflow) or by hand without triggering | the **Production Deploy** run list for the tag |
| `publish-cloud` skipped | `:vX.Y.Z` images already exist — expected on a re-deploy | the "Check whether release images already exist" step log |
| Deploy green, smoke red | app-level regression on prod | `prod-deploy-smoke-artifacts` (screenshots + traces) |
| Version bump landed but an app still reports the old version | that workspace is not in `extra-files` | `release-please-config.json` |

## Related pages

- [GitHub Actions CI/CD](github-actions.md) — the workflow inventory
- [Workflow Architecture](workflow-architecture.md) — how the reusable workflows compose
- [Manual Deployment Runbook](manual-version-deployment.md) — escape-hatch deploys and rollback
- [Physical Smoker Device](smoker-device.md) — how a release reaches the Pi
- [Deployment & Infrastructure](deployment-infrastructure.md) — hosts, Tailscale, monitoring
