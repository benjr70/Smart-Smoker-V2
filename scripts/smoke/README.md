# Smoke Test

Post-deploy + Ralph self-validation smoke. Probes `/api/health` + `/api/ready`
on backend (and device-service if `--device` set) and boots the frontend in
headless Chromium, screenshotting the result.

Part of PRD #183 (Level 6 harness). Reused by:

- `scripts/ralph/ralph-prompt.md` (Ralph self-validation step)
- `.github/workflows/cloud-deploy.yml`, `dev-deploy.yml`, `smoker-deploy.yml`
  (post-deploy gate — coming in later PR)
- `.github/workflows/infra-provision-vm.yml` (post-provision check — coming in
  later PR)

## One-time install

```bash
cd scripts/smoke
npm install
npm run smoke:install   # downloads chromium binary + system deps
```

## Run

```bash
# defaults: frontend localhost:3000, backend localhost:3001, no device probe
npm run smoke

# explicit URLs
npx tsx run.ts \
  --frontend http://localhost:3000 \
  --backend  http://localhost:3001 \
  --device   http://localhost:3003

# or via env
SMOKE_FRONTEND_URL=https://smokecloud.tail74646.ts.net \
SMOKE_BACKEND_URL=https://smokecloud.tail74646.ts.net/api \
npm run smoke
```

Exit codes: `0` PASS, `1` one or more checks failed, `2` unexpected error.

Artifacts (screenshots) land in `./smoke-artifacts/` by default — override with
`--artifacts <dir>` or `SMOKE_ARTIFACT_DIR`.

## Output shape

Last line is always `smoke: PASS (n/n)` or `smoke: FAIL (k/n failed)` so Ralph +
CI can grep one line.
