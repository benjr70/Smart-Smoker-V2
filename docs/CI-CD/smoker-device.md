# Physical Smoker Device

The production smoker is a Raspberry Pi (`armv7l`, tailnet host `smoker`) running the
touchscreen kiosk, the device-service that reads the temperature probe, and Watchtower.

It is powered off most of the time, so it is **not** deployed to on a schedule. Watchtower
on the device pulls new images whenever it is next online.

## The operating rule

| What changed | How it reaches the device |
| --- | --- |
| Image content (app code) | **Watchtower**, on its next 300s poll after the device is online |
| `smoker.docker-compose.yml` | **Dispatch `Device Deploy`** — Watchtower recreates containers from the *running container's* config and never re-reads this file |

Watchtower only sees a new image when `:latest` moves, and **`:latest` moves only when a
GitHub Release is published**. Nightly builds publish `:nightly`, which the device must
never run (see the warning below). Merging to master alone never updates the smoker.

## What runs on the device

Compose lives at `/opt/smoker-device/smoker.docker-compose.yml` (project name
`smoker-device`, pinned in the file). Containers:

| Container | Image | Notes |
| --- | --- | --- |
| `device_service` | `benjr70/smart-smoker-device-service:latest` | Reads the Arduino on the GPIO UART `/dev/ttyS0` |
| `frontend_smoker` | `benjr70/smart-smoker-smoker:latest` | Touchscreen UI, port 8080 |
| `electron_shell` | `benjr70/smart-smoker-electron-shell:latest` | X11 kiosk that displays the UI |
| `watchtower` | `containrrr/watchtower:armhf-latest` | Scoped to the three above |
| `portainer_agent` | `portainer/agent` | Standalone, not in compose, not managed by Watchtower |

Watchtower is deliberately **scoped** to the three application containers. Unscoped it
would also manage `portainer_agent` and itself, and an unattended self-update on armv7 is
the one failure that removes the device's ability to update anything else. Bump the
Watchtower image deliberately via a deploy.

## Deploying a compose change

Dispatch the **Device Deploy** workflow on `master`:

| Input | Value |
| --- | --- |
| `device_host` | `smoker` |
| `version` | `latest` |
| `compose_file` | `smoker.docker-compose.yml` |
| `ssh_user` | `smoker` |
| `deploy_dir` | `/opt/smoker-device` |
| `environment` | `prod` |
| `cloud_backend_url` | `https://smokecloud.tail74646.ts.net:8443` |
| `requires_arm_emulation` | `false` |
| `expected_containers` | `device_service frontend_smoker electron_shell watchtower` |
| `wait_seconds` | `150` |

Three of those defaults are wrong for this device and must be overridden:

- **`version: latest`, never `nightly`.** `publish.yml` bakes the cloud URL into the smoker
  bundle at build time — `:nightly` points at dev-cloud. A `:nightly` device looks
  completely healthy (green health check, live temperatures, working UI) while writing
  every production cook into the dev database.
- **`cloud_backend_url`** defaults to dev-cloud. The check is advisory and always returns 0,
  so a wrong value produces a green run that proved nothing.
- **`requires_arm_emulation: false`.** The Pi *is* armv7; `true` would run
  `tonistiigi/binfmt --install arm` against live hardware.

`wait_seconds` must exceed the Electron kiosk's 60s `start_period`, hence 150.

## Verifying a deploy

```bash
ssh smoker@smoker.tail74646.ts.net \
  'sudo docker ps --format "{{.Names}}|{{.Image}}|{{.Status}}"'
```

Then, in order of how much they can hurt you:

1. **Serial.** `sudo docker logs device_service` shows `raw data {...}` with plausible,
   *moving* values, and the service logged `Running in production mode`. If it says
   `emulator mode`, every temperature on screen is fabricated.
2. **Kiosk.** `pgrep -x electron` passing proves nothing about what is on the screen —
   **look at the display**. No blank or error page, touch responds.
3. **Cloud target.** The served bundle must reference `smokecloud.tail74646.ts.net` and
   never `smart-smoker-dev-cloud`:
   ```bash
   curl -s http://smoker.tail74646.ts.net:8080/bundle.js \
     | grep -o 'https://[a-z0-9.:-]*ts.net[^"]*' | sort -u
   ```
4. **Watchtower armed.** `sudo docker logs watchtower` reports `Scanned=3`, `Failed=0`.
5. **Reboot test.** `sudo reboot`, then re-check 1 and 2. A kiosk that only survives until
   the next power cut is not fixed.

## Rollback

1. **Automatic.** A failed health check in `Device Deploy` restores the previous compose
   from `/opt/smoker-device/backups/` and recreates the containers.
2. **Re-pin to a known-good release.** Re-dispatch with `version: v1.6.0`. Because the
   images resolve through `${VERSION:-latest}`, this pins the device — and a scoped
   Watchtower on a pinned tag finds no update and leaves the rolled-back stack alone.
   ⚠️ **A pinned device never auto-updates.** Treat this as break-glass, and make
   "redeploy `latest`" the last step of any rollback.
3. **Full revert.** Older `benjr70/smart_smoker:*_V1.5.0` images remain on Docker Hub.
   Run `docker compose down` in `/opt/smoker-device` first — the old stack used a different
   Compose project name, and two projects with the same `container_name` values collide.

## Gotchas worth knowing

- **Device nodes are validated at container *create* time.** Naming a node that does not
  exist (the compose once mapped `/dev/ttyUSB0`, which this Pi does not have) breaks every
  recreate — including Watchtower's, which would take the container down permanently.
- **The deploy user is not in the `docker` group** on this device; it has passwordless
  `sudo` instead. `scripts/device-health-check.sh` falls back to `sudo docker inspect` for
  exactly this reason.
- **The device must never hold a git checkout.** It previously ran its stack out of a
  self-hosted runner's `_work` directory, which froze the compose at whatever commit last
  deployed — that is how it ended up stranded on 2024 images for ~10 months.
