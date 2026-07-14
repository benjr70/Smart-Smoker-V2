# verify-pr — box provisioning + headful Chrome & Electron MCP wrappers

Part of PRD #327 (agent PR verification harness). These host-side pieces let the
`/verify-pr` harness drive **real, headful** browsers on the box's
GNOME/XWayland display through the Playwright MCP server, surviving reboots:

- the **web path** — a real, headful Google Chrome (slice #329);
- the **Electron path** — the real smoker desktop app wired to a hermetic per-PR
  stack and driven over the Chrome DevTools Protocol (CDP) (slice #330).

## Contents

- **`provision-box.sh`** — one-time, idempotent box provisioning. Verifies (and
  installs when absent) real Chrome, Playwright browsers + system deps, and the
  agent user's docker access, then registers **both** MCP servers
  (`playwright-chrome` → `chrome-mcp-wrapper.sh`, `playwright-electron` →
  `electron-cdp-mcp-wrapper.sh`) in `.mcp.json`. Running it twice changes
  nothing the second time.
- **`lib/resolve-display-env.sh`** — shared, sourced helper that resolves
  `DISPLAY` + the rotating X-authority file (mutter writes a fresh
  `.mutter-Xwaylandauth.XXXXXX` under the user runtime dir every boot) **by glob
  at launch**. One source of truth for both the Chrome wrapper and the Electron
  launcher; no desktop session → returns non-zero with a clear error, never
  falls back to headless.
- **`chrome-mcp-wrapper.sh`** — the web-path MCP launcher. Resolves the display
  env via the shared lib, then execs the Playwright MCP server for real Chrome
  (`--browser chrome`), headful, with a fresh unique `--user-data-dir` per run.
- **`electron-launcher.sh`** — `start`/`stop` the smoker Electron app on the box
  display, wired to a hermetic stack. `start` refuses to run without the stack
  URLs (`E2E_BACKEND_URL`, `E2E_SMOKER_URL` from the stack-runner output), maps
  them into the app's environment (no hardcoded dev ports), launches Electron
  with `--remote-debugging-port=<CDP_PORT>` (fixed known port) on the resolved
  display, records a PID file, and **blocks until the CDP endpoint answers**
  (bounded wait; non-zero exit + reason on timeout, killing the app and clearing
  the PID file). `stop` kills the app via the PID file and is idempotent — a
  second stop, or a stale PID file whose process is already gone, is a clean
  no-op.
- **`electron-cdp-mcp-wrapper.sh`** — the Electron-path MCP launcher. Polls the
  fixed CDP endpoint (bounded retries) and only once it answers execs the
  Playwright MCP server attached over CDP (`--cdp-endpoint`) to the live
  Electron renderer, so the agent gets snapshot/click/type/network tools.
  Endpoint never comes up → non-zero exit + clear error; it never launches a
  detached browser.
- **`parse-checklist.sh`** — the `/verify-pr` round's checklist reader (slice
  #331). Reads a PR body (file arg or stdin) and emits, one per line, the
  **unchecked** items under `## Manual verification` (tag `manual`) and
  `## Human verification required` (tag `human`), tab-separated as
  `<section>\t<item text>`. Ticked items and boxes in any other section (e.g.
  Acceptance criteria) are ignored, so a re-run never re-verifies a signed-off
  box.
- **`tick-checklist.sh`** — the round's box-ticker (slice #331). Given a PR body
  (file arg) and the item texts that PASSED (stdin, one per line), it flips
  exactly those `- [ ]` boxes to `- [x]` — only inside the two verification
  sections, only on exact text match, never un-ticking an already-checked box —
  and emits the rewritten body. This is the mutation `/verify-pr` applies to the
  PR at the end of a round.

## Provision the box (one-time, idempotent)

```bash
scripts/verify-pr/provision-box.sh
```

After it runs, `.mcp.json` has `playwright-chrome` and `playwright-electron` MCP
servers pointing at the two wrappers. The config stays static across reboots —
the wrappers re-resolve the rotated display environment / CDP endpoint on every
launch.

## Drive the Electron path (against a hermetic stack)

```bash
# 1. bring the hermetic stack up (slice #328) and source its KEY=value output
eval "$(tsx scripts/stack-runner/cli.ts up --pr <n> | grep '^E2E_')"

# 2. start the smoker Electron app against it, on the box display
scripts/verify-pr/electron-launcher.sh start   # blocks until CDP is ready

# 3. the agent uses the `playwright-electron` MCP tools (snapshot/click/...)

# 4. tear down
scripts/verify-pr/electron-launcher.sh stop
tsx scripts/stack-runner/cli.ts down --pr <n>
```

## Tests

Shell script-test style (prior art: the deploy scripts' `.test.sh` pattern).
System boundaries (`npx`, `docker`, `apt-get`, `usermod`, the X-authority glob,
the Electron binary, the CDP readiness probe) are injected via env-var overrides
or a PATH-prepended stub bin; no real browser, Electron, daemon, CDP endpoint,
or desktop session is required.

```bash
bash scripts/verify-pr/chrome-mcp-wrapper.test.sh
bash scripts/verify-pr/electron-launcher.test.sh
bash scripts/verify-pr/electron-cdp-mcp-wrapper.test.sh
bash scripts/verify-pr/provision-box.test.sh
bash scripts/verify-pr/parse-checklist.test.sh
bash scripts/verify-pr/tick-checklist.test.sh
```

The checklist helpers are pure text transforms, so their tests need no injected
boundaries — each feeds a PR body and asserts on stdout. Covered: unchecked-only
extraction from both verification sections (ignoring other sections and ticked
boxes), case-insensitive/section-bounded header matching, and the ticker's
pass-list-only / exact-match / never-un-tick / verbatim-preservation rules.

## The `/verify-pr` round (slice #331)

The `manual-verifier` agent (`.claude/agents/manual-verifier.md`) and the
`/verify-pr` skill (`.claude/skills/verify-pr/SKILL.md`) tie the above together:
the skill parses the PR checklist, boots the hermetic stack, spawns the agent to
exercise each item in real headful Chrome / Electron against the hermetic Mongo,
ticks the passing boxes, posts one evidence comment, emits a
`manual-verify: <pass>/<total> PASS, <deferred> deferred, <fail> FAIL` line, and
tears everything down unconditionally. The end-to-end demo runs on the always-on
verify-pr box (see the skill's "Demo" section) — not from CI or a dev laptop.

Covered: display-env resolution (found / rotated / absent → clear error),
headful real-Chrome argument construction, fresh-unique-profile-per-run,
hermetic URL/CDP-port wiring, the CDP-ready bounded wait (ready vs. timeout →
cleanup), the PID-file lifecycle (kill + clean, idempotent stop, stale-file
handling), the CDP wrapper's retry-until-up / give-up-with-error behavior, and
provisioning idempotency (second run is a no-op) for both MCP entries.
