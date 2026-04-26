# verify-deploy — Operator Setup

One-time host setup so `/verify-deploy` runs end-to-end without prompts. Each
section ends with a verify command. If it returns the expected output, move to
the next.

## Targets (current)

| Role           | Tailscale name       | IP               | SSH user |
| -------------- | -------------------- | ---------------- | -------- |
| dev-cloud      | `smoker-dev-cloud-1` | `100.106.216.34` | `root`   |
| virtual-smoker | `virtual-smoker`     | `100.118.231.82` | `smoker` |

Re-confirm anytime:

```bash
tailscale status | grep -E 'smoker-dev-cloud|virtual-smoker'
```

If a name drifts, patch the three hardcodes in `SKILL.md` (search
`smoker-dev-cloud`) **and** the two allowlist entries in
`.claude/settings.json`.

---

## 1. MagicDNS (done)

```bash
sudo tailscale set --accept-dns=true
getent hosts smoker-dev-cloud-1.tail74646.ts.net
# expect: 100.106.216.34  smoker-dev-cloud-1.tail74646.ts.net
```

---

## 2. SSH key — `root@smoker-dev-cloud-1`

The `deployment-health-check.sh` script SSHes for FQDN lookup; the skill SSHes
for `docker ps`. Both need passwordless key auth from this host.

```bash
# Already have ~/.ssh/id_ed25519? Skip first command.
test -f ~/.ssh/id_ed25519 || ssh-keygen -t ed25519 -N '' -f ~/.ssh/id_ed25519

# Push to dev-cloud (will prompt for root password once)
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@smoker-dev-cloud-1

# Verify
ssh -o BatchMode=yes root@smoker-dev-cloud-1 "hostname && docker ps --format '{{.Names}}'"
# expect: smoker-dev-cloud-1
#         frontend_cloud / backend_cloud / mongo
```

If root login disabled, set in `/etc/ssh/sshd_config` on dev-cloud:
`PermitRootLogin prohibit-password` then `systemctl reload sshd`.

---

## 3. SSH key — `smoker@virtual-smoker`

Failed last run with `Permission denied (publickey)`. Same flow:

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub smoker@virtual-smoker

ssh -o BatchMode=yes smoker@virtual-smoker "hostname && docker ps --format '{{.Names}}'"
# expect: virtual-smoker
#         device_service / frontend_smoker / watchtower
```

If `smoker` user has no password (key-only host), copy via dev-cloud or
re-provision with cloud-init pubkey injection
(`infra/proxmox/terraform/environments/virtual-smoker/`).

---

## 4. Wake virtual-smoker (currently offline)

```bash
tailscale status | grep virtual-smoker
# trailing `-` means peer offline
```

Power on the VM in Proxmox or run `tailscale up` on the device. Re-check until
last-seen turns to a duration (e.g. `idle, tx ...`).

---

## 5. Smoke deps (one-time)

```bash
cd scripts/smoke
npm ci
npx playwright install --with-deps chromium
```

Verify:

```bash
test -d scripts/smoke/node_modules && echo "deps OK"
npx --prefix scripts/smoke playwright --version
```

---

## 6. End-to-end dry run

```bash
./scripts/deployment-health-check.sh smoker-dev-cloud-1 1
# expect: ✅ Backend API, ✅ Frontend, exit 0

npm --prefix scripts/smoke run smoke -- \
  --frontend https://smoker-dev-cloud-1.tail74646.ts.net \
  --backend  https://smoker-dev-cloud-1.tail74646.ts.net:8443 \
  --artifacts /tmp/smoke-artifacts
# expect: smoke: PASS (3/3)

./scripts/device-health-check.sh virtual-smoker 1
# expect: all device probes ✅
```

If all three exit 0, invoke `/verify-deploy` and expect `verify-deploy: PASS`
with every sub-row PASS.

---

## 7. Future drift guard (optional)

To avoid rediscovering peer-name drift:

- Add `tailscale status | grep -q smoker-dev-cloud-1` as the first command in
  the skill (already documented in §Steps).
- Or pin Tailscale node names in
  `infra/proxmox/ansible/inventory/host_vars/smart-smoker-dev-cloud.yml` so
  re-provisions stop appending `-1`, `-2`, etc.
