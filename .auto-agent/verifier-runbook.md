# Verifier runbook — Smart Smoker

What a healthy per-PR environment looks like, and the project facts a
verification round needs. The auto-agent harness hands this file to the verifier
verbatim; the round itself (boot, launchers, checklist, evidence) is the
harness's.

## The environment

`scripts/verify/provider up --pr <N>` boots the whole app from the PR's checkout
as one compose project and prints:

| Key                  | What it is                                              |
| -------------------- | ------------------------------------------------------- |
| `E2E_FRONTEND_URL`   | the cloud web app (the `frontend` Surface)              |
| `E2E_SMOKER_URL`     | the smoker web bundle the Electron shell loads          |
| `E2E_BACKEND_URL`    | the backend REST API and its WebSocket gateway          |
| `E2E_DEVICE_URL`     | the device-service API and its temperature socket       |
| `E2E_MONGO_URL`      | the stack's own MongoDB (`smartsmoker` database)        |
| `STACK_PROJECT_NAME` | the compose project every container of this stack is in |

Healthy means: `GET $E2E_BACKEND_URL/api/health` answers `{"status":"ok"}` and
`/api/ready` answers 200 with `mongo: connected`;
`GET $E2E_DEVICE_URL/api/health` and `/api/ready` answer 200;
`$E2E_FRONTEND_URL` and `$E2E_SMOKER_URL` serve their pages with no uncaught
console error.

## The Surfaces

- **`frontend`** is a **mobile** web app: its users hold a phone, so it is
  captured at 427x952. A desktop-width window documents a layout no user sees.
- **`smoker`** is the device's kiosk: an 800x480 panel. The Electron shell runs
  fullscreen on the Host's much larger display, so resize down to the panel
  before capturing.
- **`backend`** and **`device-service`** are APIs: drive them with HTTP calls
  and read the stack's database through `$E2E_MONGO_URL` to confirm a write.

The shell's main process is built from the PR's own checkout when the
environment boots, and its renderer content is the PR's own build served at
`$E2E_SMOKER_URL`. Shell behaviour is therefore the PR's, and is verified like
any other item.

## Project facts that are never a reason to defer

- **Live temperature data needs no hardware.** The stack runs the device-service
  in emulator mode (`NODE_ENV=local`): synthetic ramping temperatures every 500
  ms. "No probe attached" is never a reason to defer a temperature-chain item.
- **Both-direction propagation** (rename, start and stop of a cook) is verified
  by driving the `frontend` Surface and the `smoker` Surface at the same time,
  on the same stack, and asserting the change in both directions: made in the
  web app and observed in the shell, made in the shell and observed in the web
  app.
- **Offline batching and reconnect flush** are exercised against a real
  connectivity loss: `docker stop` the backend container of this stack, keep
  driving the shell, `docker start` it again, then show the buffered
  temperatures flushing. Cite the container name and the timestamps.

## Bounds

- **Stack-mutation authority.** You may `docker stop` and `docker start`
  containers strictly within this round's compose project
  (`$STACK_PROJECT_NAME`). Nothing outside that project may be stopped, started,
  built, pulled or pruned: no other PR's stack, no Host container, no dev or
  production anything.
- **Wifi.** The wifi adapter stays off in a hermetic build. Verify the wifi
  indicator through the store snapshot flag and the wifi screen's navigation,
  and state that bound in the evidence rather than claiming a network actually
  connected.
- **Real hardware** (the Pi, the probes, the physical panel) is not in the
  environment. An item that needs it is deferred to a human with the hardware
  named.
