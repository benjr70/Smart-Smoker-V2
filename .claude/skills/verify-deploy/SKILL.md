---
name: verify-deploy
description:
  Verify deployed dev-cloud and virtual-smoker apps end-to-end (infra
  reachability + container health + Playwright frontend probe). Use when user
  says "verify the deploy", "is dev-cloud healthy", "check deployed apps",
  "verify infra", or invokes /verify-deploy.
---

# Verify Deploy

Runs the existing dev-cloud + virtual-smoker verification scripts and reports
one consolidated pass/fail block. **Reuses**
`scripts/deployment-health-check.sh`, `scripts/device-health-check.sh`, and
`scripts/smoke/run.ts` — do not author new probes.

## When to invoke

- `/verify-deploy` slash command
- User asks: "verify deploy", "is dev-cloud up", "check deployed apps", "are
  apps healthy", "verify infra and apps"

## Args

Optional positional arg:

| Arg              | Behavior                                         |
| ---------------- | ------------------------------------------------ |
| (none) or `all`  | Verify both dev-cloud + virtual-smoker (default) |
| `dev-cloud`      | Skip steps 5–6                                   |
| `virtual-smoker` | Skip steps 1–4                                   |

## Targets

- **dev-cloud**: host `smoker-dev-cloud-1`, FQDN resolved via
  `scripts/smoke/resolve-host-cli.ts` (see **FQDN Resolution** below).
  Tailscale Serve on 443 (frontend) + 8443 (backend). Containers:
  `backend_cloud`, `frontend_cloud`, `mongo`.
- **virtual-smoker**: host `virtual-smoker`, SSH user `smoker`. Containers:
  `device_service`, `frontend_smoker`, `watchtower`.

## FQDN Resolution

All Tailscale peer FQDNs **must** be computed via the resolver — never hardcode
FQDNs or inline `tailscale status --self --json | jq` pipes.

```bash
# Resolve any short name or FQDN → canonical ts.net FQDN
node --import tsx/esm scripts/smoke/resolve-host-cli.ts smoker-dev-cloud-1
# → smoker-dev-cloud-1.tail74646.ts.net
```

The resolver (`scripts/smoke/resolve-host.ts`) handles:
- Short hostname → peer lookup via `tailscale status --json`
- Exact FQDN passthrough (strips trailing `.`)
- Suffix drift (`smoker-dev-cloud` → `smoker-dev-cloud-1`)
- Multi-suffix ambiguity: picks highest numeric suffix, emits a warning
- No-match: throws with actionable message (exits non-zero)

`scripts/deployment-health-check.sh` already calls the resolver for all
non-localhost targets. When referencing the dev-cloud FQDN in step 3 below,
obtain it from the resolver rather than hardcoding it.

## Steps (run sequentially, fail-fast)

### 0. Pre-flight: smoke deps installed?

If `scripts/smoke/node_modules` is missing, install once:

```bash
cd scripts/smoke && npm ci && npx playwright install --with-deps chromium
```

### 1. Tailnet reachable

```bash
tailscale status --self --json
```

If host not on tailnet → emit `verify-deploy: SKIPPED — tailnet unreachable` and
stop. Do not proceed.

### 2. dev-cloud reachability + Tailscale Serve

```bash
./scripts/deployment-health-check.sh smoker-dev-cloud-1 3
```

Probes `https://<fqdn>:8443/api/health` and `https://<fqdn>/`. Captures
`dev-cloud` row.

### 3. dev-cloud Playwright smoke

```bash
npm --prefix scripts/smoke run smoke -- \
  --frontend https://smoker-dev-cloud-1.tail74646.ts.net \
  --backend  https://smoker-dev-cloud-1.tail74646.ts.net:8443 \
  --artifacts /tmp/smoke-artifacts
```

Last line of output is `smoke: PASS (n/n)` or `smoke: FAIL (k/n failed)`. Parse
it for the `smoke (cloud)` row. Screenshots land in `/tmp/smoke-artifacts/`.

### 4. dev-cloud container health

```bash
ssh root@smoker-dev-cloud-1 "docker ps --filter health=healthy --format '{{.Names}}'"
```

Count names matching `mongo|backend_cloud|frontend_cloud`. Expect 3.

### 5. virtual-smoker reachability

```bash
./scripts/device-health-check.sh virtual-smoker 3
```

Probes device-service `:3003/health`, frontend `:8080`, and cloud-backend
connectivity from the device. Captures `virtual-smoker` row.

### 6. virtual-smoker container status

```bash
ssh smoker@virtual-smoker "docker ps --format '{{.Names}} {{.State}}'"
```

Count `device_service`, `frontend_smoker`, `watchtower` in `running` state.
Expect 3.

## Output contract

Always end with this exact block (parsable by hooks):

```
verify-deploy: PASS|FAIL
  dev-cloud:         PASS|FAIL — <detail>
  smoke (cloud):     PASS|FAIL — <n>/<n> probes
  cloud containers:  PASS|FAIL — <n>/3 healthy
  virtual-smoker:    PASS|FAIL — <detail>
  device containers: PASS|FAIL — <n>/3 running
artifacts: /tmp/smoke-artifacts
```

Top-line `verify-deploy: PASS` only if every sub-row is `PASS` (or skipped per
arg). Any `FAIL` → top-line `FAIL`.

## Hard rules

- Never report `PASS` without the underlying script returning exit 0. If a
  script could not run (deps missing despite step 0, ssh refused, tailnet down)
  emit `SKIPPED — <one-line reason>` for that row, never `PASS`.
- Do not rewrite or extend the underlying scripts. They are the contract.
- Do not run `terraform apply`, `ansible-playbook`, container restarts, or any
  destructive action — verification is read-only.
- Do not log the user in via `tailscale up`; if tailnet down, ask the user.
