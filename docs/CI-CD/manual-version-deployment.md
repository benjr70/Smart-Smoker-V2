# Manual Version Deployment

## Overview
Deploy a specific container version to the cloud environment using Docker Compose or GitHub Actions. Images are tagged with immutable semantic versions (`vX.Y.Z`), and production deploys pin to a chosen version while development may use `nightly`.

## Prerequisites
- Docker and Docker Compose installed on the target host
- Access to the repository (Actions runner or shell on the cloud host)
- Environment values for `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`
- Images published in Docker Hub with version tags (e.g., `v1.2.3`)

## Option A: GitHub Release (Preferred)
- Workflow: `.github/workflows/release.yml` (triggered by Release → Published)
- Tag format: `vX.Y.Z` (e.g., `v1.2.3`)
- Behavior: Builds from the tag, publishes Docker images with both `latest` and `vX.Y.Z`, and deploys cloud pinned to `vX.Y.Z`.

Steps:
1) GitHub → Releases → “Draft a new release”
2) Set tag to `vX.Y.Z` and publish
3) The workflow runs automatically and deploys cloud with `VERSION=vX.Y.Z`

Notes:
- Smoker devices auto-update from `latest` via Watchtower; the release also updates `latest`.
  The device applies it on its next poll after it is powered on — there is no push deploy.

## Option B: GitHub Actions (Device Deploy)

Use this only when `smoker.docker-compose.yml` itself changed. Image updates need no deploy —
Watchtower applies them.

- Workflow: `.github/workflows/device-deploy.yml`
- Runner: self-hosted `proxmox` runner, reaching the device over the tailnet by SSH

Steps:
1) Actions → “Device Deploy” → Run workflow
2) Fill the inputs from the table in [Physical Smoker Device](smoker-device.md) — in
   particular `version: latest` (**never** `nightly`), `requires_arm_emulation: false`, and
   the prod `cloud_backend_url`
3) The workflow backs up the existing compose, copies the new one to `/opt/smoker-device`,
   recreates the containers, health-checks the device and rolls back automatically on failure

Notes:
- Ensure the target version exists in Docker Hub for all three device images
- `version` also accepts a `vX.Y.Z` tag, which **pins** the device. A pinned device never
  auto-updates again — treat it as break-glass rollback only

## Option B: Local Shell on Cloud Host
The compose file supports a `VERSION` env var. Set it to a specific version tag to pin the deployment:

Quick commands:
```bash
VERSION=v1.2.3 \
VAPID_PUBLIC_KEY=<your_public_key> \
VAPID_PRIVATE_KEY=<your_private_key> \
docker compose -f cloud.docker-compose.yml pull

VERSION=v1.2.3 \
VAPID_PUBLIC_KEY=<your_public_key> \
VAPID_PRIVATE_KEY=<your_private_key> \
docker compose -f cloud.docker-compose.yml up -d --force-recreate
```

Note: We previously supported a helper script and mise tasks, but deployment is now standardized via GitHub Actions or direct Docker Compose commands shown above.

## Rollback
Rollback is identical to deployment—pin to a previous version tag:
```bash
VERSION=v1.2.2 docker compose -f cloud.docker-compose.yml up -d --force-recreate
```

## Verification
After deployment:
- `docker ps` shows updated containers
- Backend reachable at configured port (default 8443)
- Frontend reachable at configured port (default 80)
- Check application logs for healthy startup

## Related References
- `cloud.docker-compose.yml`
- `docs/Infrastructure/phase-1-container-standardization.md`
- `.github/workflows/cloud-deploy.yml`
