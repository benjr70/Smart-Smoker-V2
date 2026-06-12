# Pre-Cutover Production Verification Runbook (Issue #224)

Step-by-step **human-in-the-loop** guide for the first gated production
release against the temp prod host, per PRD #216 "Cutover sequence" step 2.
Everything automatable was verified by agent pre-flight on 2026-06-11; the
steps below require a human because they cut a real release, click a real
approval gate, and judge real verification output.

## Context & topology

| Box                  | Tailnet name         | Role                                                            |
| -------------------- | -------------------- | --------------------------------------------------------------- |
| Legacy prod          | `smokecloud`         | Still serving users. Untouched by this runbook.                  |
| **New prod (temp)**  | **`smokecloud-2`**   | Target of this runbook. Renamed to `smokecloud` at cutover #225. |
| Dev cloud            | `smoker-dev-cloud-1` | Receives nightly builds. Not involved.                           |

> **Naming note:** PRD/issues refer to the temp host as `smoke-prod-cloud`;
> the hostname that actually landed during #223 is `smokecloud-2`
> (`PROD_HOST` / `PROD_FQDN` repo variables are the source of truth).

What fires when a GitHub Release is published:

1. **`prod-deploy.yml`** — the pipeline under test:
   `promote` (GitHub-hosted, retags `:nightly` → `vX.Y.Z` + `:latest`) →
   `deploy` (self-hosted `proxmox-runner`, gated by the `production`
   environment: required reviewer **benjr70** + 5-minute wait timer) →
   `smoke` (GitHub-hosted, blocking Playwright/API smoke against the public
   funnel URLs).
2. **`release.yml`** — independent smoker-device path: builds + publishes
   smoker/device-service/electron-shell images for the tag, then runs
   `deploy-smoker` on the `Smoker` runner. **That runner is not currently
   registered** (device offline), so this job will sit queued — expected
   noise, see step 7.

Legacy `cloud-deploy.yml` is `workflow_call`-only (manual
`deploy-version.yml`), so cutting a release **cannot** touch the old prod box.

## Step 1 — Pre-flight checklist (5 min)

Run each command; every one must match "expect" before proceeding.

| # | Command | Expect |
| - | ------- | ------ |
| 1 | `gh api repos/benjr70/Smart-Smoker-V2/actions/runners --jq '.runners[] \| "\(.name) \(.status)"'` | `proxmox-runner online` |
| 2 | `tailscale status \| grep smokecloud-2` | host listed, not `offline` |
| 3 | `curl -fsS https://hub.docker.com/v2/repositories/benjr70/smart-smoker-backend/tags/nightly \| jq .last_updated` | timestamp from last night (repeat for `smart-smoker-frontend`) |
| 4 | `gh run list --workflow=ansible-prod-cloud.yml --limit 1` | latest run `success` |
| 5 | `gh variable list \| grep PROD` | `PROD_HOST=smokecloud-2`, `PROD_FQDN=smokecloud-2.tail74646.ts.net`, `PROD_DEPLOY_DIR=/opt/smart-smoker-prod` |
| 6 | `gh secret list` | `SSH_PRIVATE_KEY`, `DOCKERHUB_*`, `VAPID_*`, `MONGO_*` present |

The nightly images are what get promoted — **whatever was on `master` at the
last nightly build is what ships**. If master moved since, either wait for
tonight's nightly or trigger `nightly.yml` manually and let it finish first.

## Step 2 — Pick the version

Last release is `1.5.1` (2024). Recommended: **`v1.6.0`** (minor bump — new
deploy pipeline, no breaking app change). `promote-images.sh` accepts
`X.Y.Z` with optional `v` and normalizes to `vX.Y.Z`.

⚠️ Promotion also moves the `:latest` tag for `smart-smoker-backend` /
`smart-smoker-frontend`. Nothing in CI consumes `:latest` (dev uses
`:nightly`, prod composes pin `${VERSION}`), but be aware if anything ad-hoc
pulls `latest`.

## Step 3 — Cut the release

```bash
gh release create v1.6.0 --target master --title "v1.6.0" --generate-notes
```

(Or GitHub UI → Releases → "Draft a new release" → tag `v1.6.0` on `master`
→ "Publish release".)

Publishing immediately starts both workflows. Confirm:

```bash
gh run list --limit 5
# expect: "Production Deploy" (event: release) and "Release Smart Smoker v2" both queued/running
```

## Step 4 — Watch promote, then approve the gate

The `promote` job needs ~1 minute. When it completes, the `deploy` job
pauses for the `production` environment gate:

1. Open the run: `gh run watch` or Actions → **Production Deploy** → the
   release-triggered run.
2. Click **"Review deployments"** → tick **production** → **"Approve and
   deploy"** (reviewer must be benjr70).
3. A **5-minute wait timer** runs after approval before the job starts —
   this is configured on the environment, do not panic when nothing happens
   immediately.

CLI alternative to the browser:

```bash
RUN_ID=$(gh run list --workflow=prod-deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh api -X POST "repos/benjr70/Smart-Smoker-V2/actions/runs/${RUN_ID}/pending_deployments" \
  -f "environment_ids[]=$(gh api repos/benjr70/Smart-Smoker-V2/environments/production --jq .id)" \
  -f state=approved -f comment="pre-cutover verification #224"
```

## Step 5 — Watch the deploy job (~5–8 min after the wait timer)

`deploy-cloud.sh` runs on the proxmox runner against `smokecloud-2`:
backup → pull `v1.6.0` → compose down → up --force-recreate → wait 120 s →
`tailscale serve reset` + funnel 443→80 and 8443→3001 → health-check
(5 retries, 10 s apart).

What good looks like in the log: `✅ Cloud deploy complete`. Failure
semantics:

- Backup or pull failure → aborts **before** touching running containers.
- Health-check failure → automatic rollback to previous version, job fails.
- `🛑 Rollback FAILED` (exit 2) → manual intervention; see Failure playbook.

A Discord notification fires either way (if webhook configured).

## Step 6 — Blocking smoke job (~3 min)

Runs automatically after deploy, GitHub-hosted, against the **public**
funnel:

- frontend: `https://smokecloud-2.tail74646.ts.net`
- backend: `https://smokecloud-2.tail74646.ts.net:8443` (probes `/api/health`)

A red smoke job fails the whole run — that is the restored blocking gate.
Artifacts (screenshots/traces) upload as `prod-deploy-smoke-artifacts` on
failure and success.

## Step 7 — Tidy the release.yml side-run

`Release Smart Smoker v2` will build + publish smoker images (multi-arch
arm/v7 — slow, ~30+ min) and then its `deploy-smoker` job will queue forever
because no `Smoker` runner is registered. Once `publish-smoker` is green,
**cancel the stuck run**:

```bash
gh run list --workflow=release.yml --limit 1   # grab the run id
gh run cancel <run-id>
```

This does not affect prod-deploy. The published smoker images are wanted for
cutover (#225) — they are baked to call `https://smokecloud.tail74646.ts.net`,
which is exactly right once the name moves to the new box.

## Step 8 — Manual verification on the box (the human-judgement part)

```bash
ssh root@smokecloud-2
```

1. **Containers up with the release tag:**

   ```bash
   docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
   # expect: backend_cloud  benjr70/smart-smoker-backend:v1.6.0   Up … (healthy)
   #         frontend_cloud benjr70/smart-smoker-frontend:v1.6.0  Up … (healthy)
   #         mongo          mongo:7.0                             Up … (healthy)
   ```

2. **Health-check script (AC: passes at temp host :8443):**

   ```bash
   cd /opt/smart-smoker-prod && bash scripts/deployment-health-check.sh localhost 3
   ```

3. **Mongo bound to localhost only (hardening from #219):**

   ```bash
   ss -tlnp | grep -E '27017|3001|:80 '
   # every listener must be 127.0.0.1, never 0.0.0.0
   ```

4. **From your workstation — API smoke against the temp host (AC):**

   ```bash
   curl -k https://smokecloud-2.tail74646.ts.net:8443/api/health
   # expect HTTP 200 JSON

   npm --prefix scripts/smoke ci && npm --prefix scripts/smoke run smoke:install
   npm --prefix scripts/smoke run smoke -- \
     --frontend https://smokecloud-2.tail74646.ts.net \
     --backend  https://smokecloud-2.tail74646.ts.net:8443
   ```

5. **Spot-check the UI** at `https://smokecloud-2.tail74646.ts.net` — it
   should render *and* show live data, because the web frontend calls the
   backend through a **relative `/api/` path proxied by its own nginx** to
   the backend container on the same box. (No dependency on legacy prod —
   see Known limitations.)

## Step 9 — Record results & close

On issue #224: tick the four acceptance-criteria boxes, paste the
prod-deploy run URL + the version deployed, note any deviations, close the
issue. That unblocks #225 (cutover).

## Known limitations (pre-cutover)

- **Smoker devices still point at legacy prod.** Release-mode smoker/Electron
  images are build-baked to `https://smokecloud.tail74646.ts.net`. Physical
  smokers keep talking to the old box until cutover (#225) moves the
  `smokecloud` tailnet name to the new box. This is by design.
- **Web frontend is *not* baked to a backend host** (contrary to older issue
  text): since the nginx `/api/` reverse-proxy change, the cloud frontend
  image is host-agnostic. Full frontend e2e against the real client URL is
  still deferred to post-cutover, when `smokecloud` resolves to the new box.
- **Users on the temp host are fresh** (mongo-init seeded, empty data). Real
  data arrives via `migrate-prod-data.sh` at cutover.

## Failure playbook

| Symptom | Likely cause | Action |
| ------- | ------------ | ------ |
| `promote` fails | `:nightly` tag missing or Docker Hub creds | check pre-flight #3; re-run job |
| `deploy` gate never appears | promote failed, or looking at the `release.yml` run by mistake | open the **Production Deploy** run |
| Health-check fails, rollback OK | new images broken | `ssh root@smokecloud-2 'cd /opt/smart-smoker-prod && docker compose -f cloud.docker-compose.yml logs --tail 100 backend'` |
| `🛑 Rollback FAILED` | box in bad state | manual: `bash scripts/rollback.sh` on the box; worst case re-run ansible `setup-prod-cloud.yml` then redeploy |
| Funnel URLs 404/timeout | tailscale serve state | `ssh root@smokecloud-2 'tailscale serve status'`; funnel CLI was modernized in #253/#254 — re-run deploy step or the two `tailscale funnel --bg` commands manually |
| Smoke job red | check `prod-deploy-smoke-artifacts` | screenshots/traces in run artifacts; fix, then re-run via `workflow_dispatch` with the same version |
| Need a clean re-run | any | `gh workflow run prod-deploy.yml -f version=v1.6.0` — fully idempotent (re-promotes same images, redeploys) |
