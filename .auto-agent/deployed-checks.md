# Deployed checks — Smart Smoker

What the live environment is, for a deployed verification round. The round is
read-only: it runs a merged PR's `<!-- post-deploy: … -->` items against the
block `scripts/verify/provider status` prints, and never deploys, restarts or
changes anything.

## The environment

A merge to the default branch deploys to **dev-cloud** and to the **virtual
smoker**, both reachable on the tailnet only:

| Key                | What it is                                      |
| ------------------ | ----------------------------------------------- |
| `E2E_FRONTEND_URL` | dev-cloud's web app (Tailscale Serve, 443)      |
| `E2E_BACKEND_URL`  | dev-cloud's backend (Tailscale Serve, 8443)     |
| `E2E_SMOKER_URL`   | the virtual smoker's web bundle (port 8080)     |
| `E2E_DEVICE_URL`   | the virtual smoker's device-service (port 3003) |

`status` resolves dev-cloud's full tailnet name through
`scripts/smoke/resolve-host.ts` (never a hard-coded FQDN), reaches the virtual
smoker by its tailnet name, and answers healthy only when all four respond.

## What healthy looks like

- `GET $E2E_BACKEND_URL/api/health` answers `{"status":"ok"}`, and `/api/ready`
  answers 200 with `mongo: connected`.
- `$E2E_FRONTEND_URL` serves the web app with no uncaught console error.
- `GET $E2E_DEVICE_URL/api/health` answers 200, and `$E2E_SMOKER_URL` serves the
  smoker bundle.
- On dev-cloud, `backend_cloud`, `frontend_cloud` and `mongo` are healthy; on
  the virtual smoker, `device_service`, `frontend_smoker` and `watchtower` are
  running. `scripts/deployment-health-check.sh` and
  `scripts/device-health-check.sh` are the existing probes for both.

## Bounds

- Read-only. No `terraform apply`, no `ansible-playbook`, no container restart,
  no `tailscale up`.
- The physical smoker is not this environment: an item that needs the Pi, a
  probe or the panel is a human's.
- A deploy takes a few minutes to land after a merge. A check that fails on the
  version it expects is retried in a later round, not reported as a regression
  of the change.
