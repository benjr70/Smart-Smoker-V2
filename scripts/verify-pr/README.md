# verify-pr — box provisioning + headful Chrome & Electron MCP wrappers

Part of PRD #327 (agent PR verification harness). These host-side pieces let the
`/verify-pr` harness drive **real, headful** browsers on the box's
GNOME/XWayland display through the Playwright MCP server, surviving reboots:

- the **web path** — a real, headful Google Chrome (slice #329);
- the **Electron path** — the real smoker desktop app wired to a hermetic per-PR
  stack and driven over the Chrome DevTools Protocol (CDP) (slice #330).

## Contents

- **`provision-box.sh`** — one-time, idempotent box provisioning. Verifies (and
  installs when absent) real Chrome, Playwright browsers + system deps, the
  agent user's docker access, and the smoker shell's own prerequisites — the
  workspace dependencies including the Electron binary the launcher executes,
  and the **built** main-process bundle (issue #390). That last one matters
  because the app's `package.json` `main` points at the gitignored
  `.webpack/main` build artifact: an unbuilt checkout gives the launcher nothing
  to run, and a bundle older than the shell sources starts fine and answers CDP
  while running the OLD main process, so it would silently ignore the renderer
  URL the harness exports. Absent or stale ⇒ rebuild, otherwise no-op. Because
  the launcher invokes Electron by name (its `ELECTRON_BIN` default is a bare
  `electron`) while the workspace install lands the binary under `node_modules`,
  provisioning also installs a small **wrapper shim** under that name in a PATH
  directory (`~/.local/bin` by default, `SMOKER_ELECTRON_SHIM_DIR` to override)
  which `exec`s the workspace binary — `exec`, so the PID the launcher records
  is the Electron process and its `stop` still kills the shell. Already correct
  ⇒ no-op, stale (wrong target or wrong sandbox mode) ⇒ rewritten, a foreign
  `electron` already on PATH ⇒ left alone. The shim exists because the
  **sandbox** has to be handled where the launcher invokes the name, which
  leaves `electron-launcher.sh` byte-for-byte as shipped: an npm-unpacked
  `chrome-sandbox` is owned by the installing user without the setuid bit, and
  Chromium refuses to run that way, while its user-namespace fallback is off on
  modern distros (`kernel.apparmor_restrict_unprivileged_userns=1`) — so the
  shell aborted at startup on a box that had just reported itself provisioned.
  Provisioning prefers the correct fix and degrades deliberately: helper already
  `root:root 4755` ⇒ sandbox stays on; repairable with **non-interactive** sudo
  (`sudo -n`, never a bare `sudo` that could hang an unattended round on a
  password prompt) ⇒ repaired, sandbox stays on; otherwise the shim exports
  `ELECTRON_DISABLE_SANDBOX=1` for the harness process only, and says so loudly.
  Finally the name is **launch-probed** (`timeout 60 <cmd> --version`,
  `SMOKER_ELECTRON_PROBE_CMD` to override — `--version` is dispatched after
  Chromium's sandbox setup, so it aborts exactly where the shell would, with no
  display or app needed): resolving is not starting, and an Electron that cannot
  start fails the run rather than reporting a box the launcher would die on. So
  `electron-launcher.sh start` works with no `ELECTRON_BIN` and no
  `ELECTRON_DISABLE_SANDBOX` prefix after provisioning. It then **verifies**
  both harness MCP servers (`playwright-chrome` → `chrome-mcp-wrapper.sh`,
  `playwright-electron` → `electron-cdp-mcp-wrapper.sh`). Those two entries are
  **committed** to `.mcp.json` (issue #388), so a healthy box has nothing to do:
  the run logs `verified` and leaves the file byte-identical. Only a
  hand-edited, deleted, or cwd-dependent entry is `repaired`, and the repair
  reproduces exactly the committed, cwd-independent launch form (see below) — so
  a repair converges on the tracked bytes instead of dirtying them. Running it
  twice changes nothing the second time.
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
- **`detect-ui-change.sh`** — the screenshot-tour gate. Reads the PR's changed
  paths on stdin and prints the UI surfaces to screenshot (`frontend`, `smoker`,
  or both — a shared `packages/*/src` file renders in both apps); empty output
  means the diff moves no pixels and the round skips the tour. Only rendering
  extensions under an app/package source root count, and test / story / snapshot
  files never do, because a false positive costs a full browser tour on the box.
- **`tour-viewport.sh`** — the viewport each tour surface is captured at:
  `frontend` → `390x844` (the web app is a **mobile app**, held portrait — a
  desktop-width window documents a layout no user sees), `smoker` → `800x480`
  (the device's kiosk panel). The smoker number is mirrored from the kiosk
  `BrowserWindow` in `apps/smoker/electron-app/index.ts`, and the sibling test
  parses that file and fails on drift — change the panel, and the tour table has
  to follow. The Electron shell runs fullscreen on the box's much larger
  desktop, so the verifier resizes down to the panel before capturing.
- **`inject-screenshots.sh`** — puts the `## Screenshots` section into the PR
  description from `caption<TAB>url` lines on stdin. It **replaces** the section
  it owns (marked `<!-- verify-pr-screenshots -->`) rather than appending, so
  round 3 refreshes the tour instead of stacking a third copy under the first
  two; empty input leaves the body byte-identical, and a `## Screenshots`
  heading a human wrote by hand is left alone. The URLs come from
  [`scripts/pr-images`](../pr-images/README.md), which uploads the PNGs through
  a real logged-in Chrome — GitHub has no attachment API.

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
System boundaries (`npx`, `docker`, `apt-get`, `usermod`, `sudo`, `stat`, the
X-authority glob, the Electron binary and its launch probe, the CDP readiness
probe) are injected via env-var overrides or a PATH-prepended stub bin; no real
browser, Electron, daemon, CDP endpoint, desktop session, privileged user, or
write to the real `~/.local/bin` is required.

```bash
bash scripts/verify-pr/chrome-mcp-wrapper.test.sh
bash scripts/verify-pr/electron-launcher.test.sh
bash scripts/verify-pr/electron-cdp-mcp-wrapper.test.sh
bash scripts/verify-pr/provision-box.test.sh
bash scripts/verify-pr/parse-checklist.test.sh
bash scripts/verify-pr/tick-checklist.test.sh
bash scripts/verify-pr/check-harness-runbook.test.sh
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

### The Electron runbook check (slice #391)

Both documents carry the same Electron runbook — display truth from
`lib/resolve-display-env.sh` only (an unset shell `$DISPLAY` proves nothing),
the launcher-start → CDP-attach → drive → launcher-stop chain, the shell-drift
note for PRs touching the shell's own code or any build input the provisioner
rebuilds it from, `docker stop`/`docker start` allowed strictly inside the
per-PR compose project, the device-service emulator feed, the dual-driver
both-directions procedure, and the hermetic wifi bound. Those rules are what
turn "the harness has an Electron chain" into "the round actually drives it", so
a text check guards them:

```bash
bash scripts/verify-pr/check-harness-runbook.sh          # 0 = every rule present in both docs
bash scripts/verify-pr/check-harness-runbook.sh --list   # the enforced rule table
```

Matching runs over a whitespace-normalized copy of each document, so Prettier's
80-column re-wrap can never break a multi-word phrase. CI runs the suite via
`.github/workflows/harness-runbook.yml` whenever either definition or the check
itself changes; the test suite deletes each rule phrase in turn (from either
document) and requires the checker to fail naming that rule, and pins the
shell-drift path list to `provision-box.sh`'s `SMOKER_SHELL_SOURCES` plus the
forge thin-mode entry document so a new shell build input cannot be added
without teaching the runbook about it.

Covered: display-env resolution (found / rotated / absent → clear error),
headful real-Chrome argument construction, fresh-unique-profile-per-run,
hermetic URL/CDP-port wiring, the CDP-ready bounded wait (ready vs. timeout →
cleanup), the PID-file lifecycle (kill + clean, idempotent stop, stale-file
handling), the CDP wrapper's retry-then-register-anyway behavior (endpoint down
→ still hands off, with a warning, inside a wait short enough for the MCP
runtime's startup timeout), the launcher-shim sandbox ladder (working SUID
helper ⇒ nothing disabled and no escalation attempted; unfixable helper with no
passwordless sudo ⇒ shim degrades loudly, and never a bare `sudo`), the launch
probe (an Electron that resolves but dies on exec fails the run, which never
reports "provisioning complete") and the shim's `exec` (the PID the launcher
would record is the Electron process), and provisioning idempotency (second run
is a no-op — the shim included) for both MCP entries — plus the committed-entry
contract: the shipped config carries both harness servers, each launching its
wrapper **from a subdirectory cwd**, a fresh checkout verifies with zero repairs
and zero bytes changed, a missing / wrong / cwd-dependent-relative entry is
repaired to exactly the committed form (with a diagnostic saying why relative is
wrong), an uncomputable expectation fails loudly instead of reporting
"verified", the other six servers are untouched in both states, and neither
entry fails at parse time (Chrome: startup error without a desktop session;
Electron: warn + register when no CDP endpoint answers).
