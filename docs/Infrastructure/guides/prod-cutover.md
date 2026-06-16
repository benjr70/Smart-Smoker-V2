# Production Cutover Runbook (Issue #225)

**Human-in-the-loop** procedure that cut production from the legacy box to the
new Proxmox box, migrated the live data once, and (pending soak) retires the
legacy deploy path. PRD #216 "Cutover sequence" steps 3–5.

> This is the **as-executed** record of the 2026-06-16 cutover, corrected from
> the original plan. The two biggest surprises vs the plan are called out inline
> — read them before reusing this for any future box move.

## Topology (as found at cutover)

| Box | Tailnet name (after) | SSH | Mongo | App DB | Notes |
| --- | --- | --- | --- | --- | --- |
| **New prod** | `smokecloud` (was `smokecloud-2`) | `root@smokecloud` | `mongo:7.0`, **auth** (`admin` / `MONGO_ROOT_PASSWORD` in `/opt/smart-smoker-prod/.env`), bound `127.0.0.1` | **`smartsmoker`** | LXC VMID **104** (`smart-smoker-cloud-prod`) on Proxmox `192.168.1.151`, bridge IP `10.20.0.30`, app v1.6.0 |
| **Legacy** | `smokecloud-legacy` (was `smokecloud`) | `ubuntu@smokecloud-legacy` | `mongo:4.4`, **no auth**, bound `0.0.0.0` | **`test`** | app v1.5.x, the only copy of real prod data pre-backup |

> ⚠️ **Surprise 1 — DB name changed.** The v1.5 app wrote to mongo's default
> `test` db; v1.6 uses `smartsmoker`. Migration must **cross-rename**
> `test.*` → `smartsmoker.*` (`mongorestore --nsFrom 'test.*' --nsTo 'smartsmoker.*'`).
>
> ⚠️ **Surprise 2 — the original `scripts/migrate-prod-data.sh` did NOT work
> here.** It defaulted `--db smart-smoker`, passed no mongo auth, ran host-level
> `mongodump`/`mongorestore` (tools live only inside the containers), and
> couldn't cross-rename. The 2026-06-16 migration was therefore done **manually**
> with the corrected mechanic (Step 2). The script has since been **rewritten**
> (#257) to do exactly that — docker-exec, auth sourced from the box env file,
> and namespace cross-rename — so the codified path now matches reality:
>
> ```bash
> scripts/migrate-prod-data.sh smokecloud-legacy smokecloud \
>   --old-user ubuntu --src-db test --dst-db smartsmoker
> ```

All commands below run from an ops host on the tailnet with an SSH key
authorized as `root@` on the new box and `ubuntu@` on legacy.

---

## Step 0 — Recover the new box if tailscale is down

The new LXC stayed up on Proxmox but `tailscaled` dropped (its node-key
expired), so it showed offline in the tailnet. You don't need the tailnet name
to get in — go through Proxmox:

```bash
ssh root@192.168.1.151      # Proxmox hypervisor
pct enter 104               # into the prod LXC as root (no password)
```

Inside the container:

```bash
systemctl restart tailscaled
tailscale status            # if "Logged out", it prints a login URL
# open the printed https://login.tailscale.com/a/... URL in a browser to re-auth
tailscale status            # confirm the node is back, name + 100.92.43.59
```

> Do **not** run tailscale's suggested `tailscale up --hostname=smokecloud` here
> — that prematurely starts the name swap and, while legacy still owns
> `smokecloud`, tailscale would dedup the node. The name swap is Step 3, done in
> the admin console.

Verify the app before proceeding:

```bash
ssh root@smokecloud-2 'docker ps --format "{{.Names}}\t{{.Image}}\t{{.Status}}"'  # v1.6.0, all healthy
ssh root@smokecloud-2 'cd /opt/smart-smoker-prod && bash scripts/deployment-health-check.sh localhost 3'
ssh root@smokecloud-2 "ss -tlnp | grep -E '27017|3001|:80 '"   # all 127.0.0.1 (hardening #219)
```

---

## Step 1 — Back up legacy `test` (rollback net — do FIRST)

Legacy held the only copy of real prod data. Take a verified off-box backup
before anything. `mongodump` is **read-only** on the source.

```bash
mkdir -p ./backups; TS=$(date +%Y%m%d-%H%M%S)
# copy #1 — stream legacy 'test' to the ops host
ssh ubuntu@smokecloud-legacy 'docker exec mongo mongodump --db test --archive --gzip' \
  > ./backups/legacy-test-$TS.archive.gz
gunzip -t ./backups/legacy-test-$TS.archive.gz && ls -lh ./backups/legacy-test-$TS.archive.gz
# copy #2 — stash on the new box too
ssh root@smokecloud-2 'mkdir -p /opt/smart-smoker-prod/backups'
scp ./backups/legacy-test-$TS.archive.gz root@smokecloud-2:/opt/smart-smoker-prod/backups/
```

Prove the archive actually restores — into a **throwaway** db, touching neither
legacy nor `smartsmoker`:

```bash
ssh root@smokecloud-2 "set -a; . /opt/smart-smoker-prod/.env; set +a
  docker cp /opt/smart-smoker-prod/backups/legacy-test-$TS.archive.gz mongo:/tmp/v.gz
  docker exec mongo mongorestore -u admin -p \"\$MONGO_ROOT_PASSWORD\" --authenticationDatabase admin \
    --archive=/tmp/v.gz --gzip --nsFrom 'test.*' --nsTo 'backup_verify.*'
  docker exec mongo mongosh -u admin -p \"\$MONGO_ROOT_PASSWORD\" --authenticationDatabase admin --quiet \
    --eval 'var s=db.getSiblingDB(\"backup_verify\"); s.getCollectionNames().forEach(c=>print(c+\": \"+s.getCollection(c).countDocuments()))'
  docker exec mongo mongosh -u admin -p \"\$MONGO_ROOT_PASSWORD\" --authenticationDatabase admin --quiet \
    --eval 'db.getSiblingDB(\"backup_verify\").dropDatabase()'
  docker exec mongo rm -f /tmp/v.gz"
```

✅ Gate: gzip valid, two copies, throwaway restore counts == source.

---

## Step 2 — Freeze, migrate once, verify

Downtime starts at the freeze and ends at the Step 3 name swap (~2 min). Pick a
low-traffic moment.

```bash
# 1. freeze legacy writes (stop app; mongo stays up for the dump)
ssh ubuntu@smokecloud-legacy 'docker stop backend_cloud frontend_cloud'

# 2. migrate: dump legacy 'test' | restore --drop into new 'smartsmoker' (auth + cross-rename)
ssh ubuntu@smokecloud-legacy 'docker exec mongo mongodump --db test --archive --gzip' \
| ssh root@smokecloud-2 'set -a; . /opt/smart-smoker-prod/.env; set +a;
    docker exec -i mongo mongorestore -u admin -p "$MONGO_ROOT_PASSWORD" \
      --authenticationDatabase admin --archive --gzip --drop \
      --nsFrom "test.*" --nsTo "smartsmoker.*"'
```

`--drop` replaces only the new box's seed collections; legacy is never written.

```bash
# 3. verify counts on new box == legacy
ssh root@smokecloud-2 'set -a; . /opt/smart-smoker-prod/.env; set +a;
  docker exec mongo mongosh -u admin -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin --quiet \
    --eval "var s=db.getSiblingDB(\"smartsmoker\"); s.getCollectionNames().sort().forEach(c=>print(c+\": \"+s.getCollection(c).countDocuments()))"'

# 4. restart new backend so mongoose re-applies schema indexes (the dump carried only _id)
ssh root@smokecloud-2 'docker restart backend_cloud'
```

✅ Gate (2026-06-16 actual): temps 68231, smokes 18, presmokes 18, postsmokes
19, ratings 16, smokeprofiles 16, states/settings/notificationsettings 1,
notificationsubscriptions 0. 68,321 docs total, 0 failed.

> VAPID continuity: legacy had `notificationsubscriptions: 0`, so no web-push
> subs to break. If a future box has subs, confirm the new box's
> `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` match legacy before exposing it.

---

## Step 3 — Move the `smokecloud` name + Funnel (Tailscale admin console)

In <https://login.tailscale.com/admin/machines>:

1. Rename legacy node `smokecloud` → `smokecloud-legacy`.
2. Rename new node `smokecloud-2` → `smokecloud`.

Then re-assert Funnel on the new box (target by IP to dodge DNS-propagation lag;
a fresh TLS cert auto-provisions for the new name):

```bash
ssh root@100.92.43.59 'tailscale serve reset; tailscale funnel --bg 80; tailscale funnel --bg --https=8443 3001; tailscale serve status'
```

✅ Gate: `tailscale status` shows `smokecloud` = new box; `serve status` lists
both funnel endpoints.

---

## Step 4 — Verify on the public name

```bash
curl -k -s -o /dev/null -w '%{http_code}\n' https://smokecloud.tail74646.ts.net/      # 200
curl -k -s https://smokecloud.tail74646.ts.net:8443/api/health                         # {"status":"ok","database":{"name":"smartsmoker",...}}
curl -k -s https://smokecloud.tail74646.ts.net:8443/api/history | head -c 200          # real migrated cooks
```

Human spot-check at `https://smokecloud.tail74646.ts.net`: login, past cooks
list populated, open a cook → temp graph renders, settings load.

> `/api/smoke/current` returns 500 — **not a bug**: there is no such route, so
> "current" hits `@Get('/:id')` and fails the ObjectId cast. The frontend never
> calls it. Ignore.

The Playwright smoke (`scripts/smoke`) checks API + browser; the API checks pass
anywhere, but the browser leg needs a host where Playwright's chromium installs
(it does **not** on ubuntu 26.04). Live user traffic is the de-facto e2e pass.

---

## Step 5 — Hold legacy as fallback

- Keep `smokecloud-legacy` powered, mongo up, app containers **stopped**. Data
  intact, no divergent writes.
- **Rollback** = admin-console rename `smokecloud` back to the legacy node, then
  `ssh ubuntu@smokecloud-legacy 'docker start backend_cloud frontend_cloud'`.
- Soak 1–2 weeks before Step 6.

---

## Step 6 — Retire the legacy deploy path (after soak)

Normal PR, gated on a clean soak:

- Delete `.github/workflows/cloud-deploy.yml`.
- Remove its references in `.github/workflows/deploy-version.yml`,
  `.github/workflows/nightly.yml`, `.github/actionlint.yaml`.
- Deregister the `SmokeCloud` self-hosted runner (GitHub → Settings → Actions →
  Runners) and uninstall its service on the legacy box.
- Only `prod-deploy.yml` (proxmox-runner) deploys prod afterward.
- Close #225.

## Rollback playbook

| Symptom | Action |
| --- | --- |
| Migration fails mid-stream | Guard not relevant (manual); fix connectivity; re-run the Step 2 pipe. Legacy untouched. |
| New box unhealthy after name swap | Rename `smokecloud` back to legacy node, `docker start` its containers. |
| Public URL 404/timeout | `ssh root@smokecloud 'tailscale serve status'`; re-run the three funnel commands. |
| Data looks wrong on new box | Re-restore the Step 1 archive into `smartsmoker` (`--drop`), or roll the name back and triage offline. |
