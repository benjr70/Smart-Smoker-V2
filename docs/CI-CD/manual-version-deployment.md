# Manual Deployment Runbook

!!! warning "This is not how you release"
    The normal release path is **merge the release PR** — see
    [Release Process](release-process.md). Merging it tags the repo, publishes a
    GitHub Release, builds the cloud images from that tag and deploys prod
    (today via one more approval click at the `production` environment gate,
    which is pending removal). Nothing on this page is part of that path.

    Everything below is an **escape hatch**: rolling back, re-running a deploy
    after a red smoke job, or pinning a host by hand. Drafting a Release
    manually to "make a release" is no longer correct — it skips the version
    bumps and the changelog that release-please generates.

## Overview

Cloud images are tagged with immutable semantic versions (`vX.Y.Z`). Production
pins a specific version; dev-cloud runs `:nightly`; the physical smoker follows
`:latest` via Watchtower. The escape hatches let you point a host at a specific
`vX.Y.Z` without cutting a new release.

## Prerequisites

- The target version already exists in Docker Hub (`vX.Y.Z` for every image you
  intend to run) — check before dispatching anything
- For local commands: Docker and Docker Compose on the target host, plus the
  deploy directory's `.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_CONTACT`,
  `MONGO_ROOT_PASSWORD`, `MONGO_APP_PASSWORD`, `ENCODED_MONGO_APP_PASSWORD`) —
  see [Option D](#option-d-local-shell-on-the-cloud-host)
- For workflow dispatch: permission to run Actions on `master`

## Option A: Re-run the production deploy (`prod-deploy.yml`)

Use this to roll back to an earlier released version, or to re-deploy the
current one after fixing something outside the images (host config, secrets, a
flaky smoke run).

```bash
gh workflow run prod-deploy.yml -f version=v1.6.0
```

- The workflow probes Docker Hub first. Because `v1.6.0` already exists, the
  build job is **skipped** and the exact same images are redeployed — `:vX.Y.Z`
  stays immutable and `:latest` never moves backwards.
- The deploy, health check, rollback-on-failure, Discord notification and the
  blocking smoke gate all run exactly as they do for a real release.
- The version must be `X.Y.Z` or `vX.Y.Z`; anything else fails fast.

## Option B: Re-publish smoker/device images (`release.yml`)

Use this only when the smoker-side images for an existing tag need rebuilding
(e.g. a publish step failed mid-release).

```bash
gh workflow run release.yml -f version=v1.6.0
```

Note: release mode also pushes `:latest`, which is what Watchtower follows —
running this against an **older** tag will roll the physical device backwards on
its next poll.

## Option C: Device Deploy (compose changes only)

Only needed when `smoker.docker-compose.yml` itself changed. Image updates need
no deploy — Watchtower applies them.

- Workflow: `.github/workflows/device-deploy.yml`
- Runner: self-hosted `proxmox` runner, reaching the device over the tailnet by
  SSH

Steps:

1. Actions → **Device Deploy** → Run workflow
2. Fill the inputs from the table in
   [Physical Smoker Device](smoker-device.md) — in particular
   `version: latest` (**never** `nightly`), `requires_arm_emulation: false`, and
   the prod `cloud_backend_url`
3. The workflow backs up the existing compose, copies the new one to
   `/opt/smoker-device`, recreates the containers, health-checks the device and
   rolls back automatically on failure

Notes:

- Ensure the target version exists in Docker Hub for all three device images
- `version` also accepts a `vX.Y.Z` tag, which **pins** the device. A pinned
  device never auto-updates again — treat it as break-glass rollback only

## Option D: Local shell on the cloud host

`cloud.docker-compose.yml` resolves images through a `VERSION` env var. Set it
to pin the deployment.

!!! danger "Run from the deploy directory — the secrets live in its `.env`"
    `cloud.docker-compose.yml` interpolates the Mongo credentials
    (`MONGO_ROOT_PASSWORD`, `MONGO_APP_PASSWORD`,
    `ENCODED_MONGO_APP_PASSWORD`) and the VAPID keys from the environment.
    `prod-deploy.yml` writes them to `<deploy_dir>/.env` (mode `600`) on every
    deploy, and Docker Compose only auto-loads `.env` **from the directory you
    run the command in**. Run from another directory and Compose substitutes
    empty strings: Mongo initialises with a blank root password and the backend
    fails authentication, so the break-glass path leaves prod down.

    `cd` to the prod deploy directory (the `PROD_DEPLOY_DIR` repo variable —
    the same directory that holds the compose file and `scripts/`) and confirm
    `.env` is there before touching anything:

    ```bash
    cd "$PROD_DEPLOY_DIR"        # e.g. /opt/smart-smoker
    test -f .env && grep -c MONGO_APP_PASSWORD .env
    ```

With that `.env` in place, `VERSION` is the only variable you supply:

```bash
cd "$PROD_DEPLOY_DIR"
VERSION=v1.2.3 docker compose -f cloud.docker-compose.yml pull
VERSION=v1.2.3 docker compose -f cloud.docker-compose.yml up -d --force-recreate
```

If `.env` is missing or you are bringing the stack up somewhere else, recreate
it first — do **not** pass these inline, and never invent new Mongo passwords
for an existing data volume (the app user already exists; changing the values
only breaks authentication):

```bash
# values come from the GitHub Actions secrets of the same name
cat > .env <<'EOF'
VAPID_PUBLIC_KEY=<vapid_public_key>
VAPID_PRIVATE_KEY=<vapid_private_key>
VAPID_CONTACT=mailto:<operator_contact_address>
MONGO_ROOT_USER=admin
MONGO_ROOT_PASSWORD=<mongo_root_password>
MONGO_APP_PASSWORD=<mongo_app_password>
ENCODED_MONGO_APP_PASSWORD=<mongo_app_password, percent-encoded for the URI>
EOF
chmod 600 .env
```

`ENCODED_MONGO_APP_PASSWORD` is `MONGO_APP_PASSWORD` URL-encoded because it is
substituted into `DB_URL`; the pipeline computes it with `jq -sRr @uri`.

Prefer Option A: it ships the current helper scripts, health-checks the result
and runs the smoke gate. Use this only when Actions cannot reach the host.

## Rollback

Rollback is a deploy of an older version — pin and recreate:

```bash
# Preferred: through the pipeline
gh workflow run prod-deploy.yml -f version=v1.2.2

# On the host, if Actions is unavailable — from the deploy dir, so .env loads
cd "$PROD_DEPLOY_DIR"
VERSION=v1.2.2 docker compose -f cloud.docker-compose.yml up -d --force-recreate
```

The same `.env` requirement as [Option D](#option-d-local-shell-on-the-cloud-host)
applies here.

`scripts/rollback.sh` is shipped to the prod host on every deploy and is invoked
automatically when the post-deploy health check fails.

## Verification

After any manual deployment:

- `docker ps` shows the expected containers on the expected tags
- Backend reachable at the configured port (default 8443)
- Frontend reachable at the configured port (default 80)
- Application logs show a healthy startup

## Related references

- [Release Process](release-process.md) — the real release path
- `cloud.docker-compose.yml`
- `.github/workflows/prod-deploy.yml`, `.github/workflows/release.yml`,
  `.github/workflows/device-deploy.yml`
