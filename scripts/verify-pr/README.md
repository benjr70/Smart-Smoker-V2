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
  agent user's docker access, then **verifies** both harness MCP servers
  (`playwright-chrome` → `chrome-mcp-wrapper.sh`, `playwright-electron` →
  `electron-cdp-mcp-wrapper.sh`). Those two entries are **committed** to
  `.mcp.json` (issue #388), so a healthy box has nothing to do: the run logs
  `verified` and leaves the file byte-identical. Only a hand-edited, deleted, or
  cwd-dependent entry is `repaired`, and the repair reproduces exactly the
  committed, cwd-independent launch form (see below) — so a repair converges on
  the tracked bytes instead of dirtying them. Running it twice changes nothing
  the second time.
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
- **`electron-cdp-mcp-wrapper.sh`** — the Electron-path MCP launcher. Execs the
  Playwright MCP server attached over CDP (`--cdp-endpoint`) to the live
  Electron renderer, so the agent gets snapshot/click/type/network tools. It
  polls the fixed CDP endpoint first, but **briefly and non-fatally**: MCP stdio
  servers are spawned once, at session start, minutes before `/verify-pr`
  launches Electron, so a wrapper that exited on a dead endpoint would be
  dropped for the whole session and the verifier would have zero Electron tools
  (that, plus a 60s wait overrunning the runtime's 30s startup timeout, is why
  the tools kept going missing). Playwright dials `--cdp-endpoint` lazily, so
  the server always registers, warns when the endpoint is down, and a too-early
  tool call is what fails. It never launches a detached browser.
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

`.mcp.json` ships with the `playwright-chrome` and `playwright-electron` servers
already pointing at the two wrappers, so a fresh clone is registered before the
script ever runs — and the daemon's `git reset --hard` cleanup can no longer
wipe them (it used to, which is how the verifier lost its Electron tools).

Each entry is `bash -c '<resolve checkout root>; exec "$r/scripts/verify-pr/…"'`
rather than a bare path, because the MCP runtime spawns stdio servers with the
**session's cwd** — not the config file's directory. A `./scripts/…` command
therefore ENOENTs (silently, no tools, no diagnostic) whenever Claude is started
from a subdirectory such as `apps/backend`, and an absolute path cannot be
committed at all. `git rev-parse --show-toplevel` is correct from any
subdirectory and inside worktrees, so one committed line works everywhere.

The config stays static across reboots — the wrappers re-resolve the rotated
display environment / CDP endpoint on every launch, and nothing fails at
config-parse time. The two paths then degrade differently, on purpose: Chrome
_launches_ a browser, so no desktop session is a startup failure with a clear
error (never a silent headless fallback); Electron only _attaches_, and the app
does not exist yet when the session starts, so a dead endpoint only produces a
warning — the server registers and the failure lands on a premature tool call.

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
handling), the CDP wrapper's retry-then-register-anyway behavior (endpoint down
→ still hands off, with a warning, inside a wait short enough for the MCP
runtime's startup timeout), and provisioning idempotency (second run is a no-op)
for both MCP entries — plus the committed-entry contract: the shipped config
carries both harness servers, each launching its wrapper **from a subdirectory
cwd**, a fresh checkout verifies with zero repairs and zero bytes changed, a
missing / wrong / cwd-dependent-relative entry is repaired to exactly the
committed form (with a diagnostic saying why relative is wrong), an uncomputable
expectation fails loudly instead of reporting "verified", the other six servers
are untouched in both states, and neither entry fails at parse time (Chrome:
startup error without a desktop session; Electron: warn + register when no CDP
endpoint answers).
