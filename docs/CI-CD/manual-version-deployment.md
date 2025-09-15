# Manual Version Deployment

## Overview
Deploy a specific container version to the cloud environment using Docker Compose or GitHub Actions. Images are tagged with immutable semantic versions (`vX.Y.Z`), and production deploys pin to a chosen version while development may use `nightly`.

## Prerequisites
- Docker and Docker Compose installed on the target host
- Access to the repository (Actions runner or shell on the cloud host)
- Environment values for `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`
- Images published in Docker Hub with version tags (e.g., `v1.2.3`)

## Option A: GitHub Actions (Deploy Version)
- Workflow: `.github/workflows/deploy-version.yml`
- Inputs: `version` (accepts `1.2.3`, `v1.2.3`, or `nightly`), toggles for cloud/smoker
- Runner: Cloud uses self-hosted `SmokeCloud`; smoker uses `Smoker`

Steps:
1) Open Actions → “Deploy Version” → Run workflow
2) Enter the version (`1.2.3`, `v1.2.3`, or `nightly`). The workflow normalizes to `vX.Y.Z` when needed.
3) Select deploy targets (cloud and/or smoker)
4) The workflow calls existing deploy jobs and executes on the target runners:
   - `docker compose -f cloud.docker-compose.yml pull`
   - `docker compose -f cloud.docker-compose.yml build`
   - `docker compose -f cloud.docker-compose.yml down`
   - `docker compose -f cloud.docker-compose.yml up -d --force-recreate`

Notes:
- Secrets `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are used by the workflow
- Ensure the target version exists in Docker Hub for both backend and frontend images

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
