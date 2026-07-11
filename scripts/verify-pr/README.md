# verify-pr — box provisioning + headful Chrome MCP wrapper

Part of PRD #327 (agent PR verification harness). This slice (#329) provides the
two host-side pieces the `/verify-pr` harness needs to drive a **real, headful
Google Chrome** on the box's GNOME/XWayland display through the Playwright MCP
server, surviving reboots.

## Contents

- **`provision-box.sh`** — one-time, idempotent box provisioning. Verifies (and
  installs when absent) real Chrome, Playwright browsers + system deps, and the
  agent user's docker access, then registers the wrapper as an MCP server in
  `.mcp.json`. Running it twice changes nothing the second time.
- **`chrome-mcp-wrapper.sh`** — the MCP server launcher the config points at.
  Resolves `DISPLAY` + the rotating X-authority file (mutter writes a fresh
  `.mutter-Xwaylandauth.XXXXXX` under the user runtime dir every boot) **by glob
  at launch**, then execs the Playwright MCP server for real Chrome
  (`--browser chrome`), headful, with a fresh unique `--user-data-dir` per run.
  No desktop session (no auth file) → exits non-zero with a clear error naming
  the missing precondition. It **never** falls back to headless.

## Provision the box (one-time, idempotent)

```bash
scripts/verify-pr/provision-box.sh
```

After it runs, `.mcp.json` has a `playwright-chrome` MCP server whose `command`
is `chrome-mcp-wrapper.sh`. The config stays static across reboots — the wrapper
re-resolves the rotated display environment on every launch.

## Tests

Shell script-test style (prior art: the deploy scripts' `.test.sh` pattern).
System boundaries (`npx`, `docker`, `apt-get`, `usermod`, the X-authority glob)
are mocked via a PATH-prepended stub bin; no real browser, daemon, or desktop
session is required.

```bash
bash scripts/verify-pr/chrome-mcp-wrapper.test.sh
bash scripts/verify-pr/provision-box.test.sh
```

Covered: auth-file resolution (found / rotated / absent → clear error), headful
real-Chrome argument construction, fresh-unique-profile-per-run, and
provisioning idempotency (second run is a no-op).
