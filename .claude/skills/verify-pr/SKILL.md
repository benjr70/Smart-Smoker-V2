---
name: verify-pr
description:
  Run one manual-verification round against an open PR — parse its verification
  checklist, boot a hermetic per-PR stack, spawn the manual-verifier agent to
  exercise each item in a real headful browser / Electron, tick the passing
  boxes, post one evidence comment, emit a `manual-verify:` summary line, and
  tear everything down. Use when anyone says "verify PR <n>", "run manual
  verification", or invokes /verify-pr — a human, an agent calling the Skill
  tool, or a subagent delegated the round by team-pickup §6a.2 or pr-reconcile
  §3.
argument-hint: '<PR number>'
---

# Verify PR

You are the orchestrator of a single **manual-verification round** for one open
PR. You wire together the slice 1–3 machinery (hermetic stack-runner, headful
Chrome MCP, Electron+CDP MCP) and the `manual-verifier` agent, then reconcile
the result back onto the PR. You do not verify anything yourself — the agent
does the testing; you own setup, mutation, and teardown.

This is the harness's brain. It must be **honest** (never fabricate a verdict),
**self-cleaning** (teardown on every exit path), and **idempotent on the PR**
(only ever ticks boxes that passed; never un-ticks, never re-verifies a box a
human already signed off).

## Invocation

```
/verify-pr <PR#>
```

One argument: the PR number. If it is missing or not an open PR, stop with a
clear message — do not guess.

### Callers — any caller is legitimate

This harness is **runnable from anywhere**. All three of these are ordinary,
equally valid entry points, and none of them needs a human in the loop:

1. A human typing `/verify-pr <PR#>`.
2. An agent calling the **`Skill` tool** for `verify-pr`.
3. A `general-purpose` subagent spawned via the **`Agent` tool** that is told to
   invoke this skill — the shape both automated callers use: **`team-pickup`
   §6a.2** and **`pr-reconcile` §3**, each of which delegates its blocking
   verification round here and consumes the terminal `manual-verify:` line this
   skill emits.

Do not refuse, defer, or downgrade a round because the caller is a model rather
than a person: an unrun round is the pipeline's last quality gate going missing.
Whoever calls, the contract is identical — same prerequisites, same evidence
comment, same honest terminal line. If the round genuinely cannot run, say so
with `manual-verify: infra-error …`; never hand the round back to a human as a
silent skip.

## Prerequisites (fail fast, do not auto-install)

The box must already be provisioned (slice 2) and the stack-runner deps present
(slice 1). Verify cheaply; if anything is missing, abort with the specific
prerequisite — never `apt-get`/`npm install` your way out (installing is the
verifier agent's forbidden zone too):

All of these checks (gh auth, the four verify-pr scripts, stack-runner deps, and
the _soft_ screenshot-tour prerequisite — `scripts/pr-images` deps, which WARN
but never fail a round) are executed by `scripts/verify-pr/preflight-boot.sh`,
the single call that also boots the stack in §4. Do **not** run them as separate
turns here — a hard prerequisite failure surfaces as the boot call exiting 3
with the specific missing piece on stderr, before anything is booted.

The `playwright-chrome` and `playwright-electron` MCP servers are **committed**
to `.mcp.json`, so every checkout has them — they no longer depend on a
provisioning run having happened (and can no longer be wiped by the daemon's
`git reset --hard`). Each entry launches through `bash -c` and resolves the
checkout root with `git rev-parse --show-toplevel`, so it works from any session
cwd, in any clone or worktree.

**The Electron server registers before the app exists — that is by design.** MCP
stdio servers are spawned once, when the session starts, which is long before
step 5 launches Electron. So `electron-cdp-mcp-wrapper.sh` probes CDP briefly,
warns if nothing answers, and starts the MCP server anyway; Playwright dials the
CDP endpoint lazily, on the first tool call. Consequence for this round:
`mcp__playwright-electron__*` tools exist from the start, but **calling one
before step 5 has launched the app fails with a connection error**. Launch the
app first, then use the tools — a failed early call is a sequencing mistake, not
a missing precondition.

If a session genuinely lists **no** `playwright-electron` server, re-running
`provision-box.sh` will not help — it only verifies the file, and a running
session never re-reads it. Diagnose instead:

```bash
claude mcp list   # shows per-scope endpoints, conflicts, and connect errors
```

- **A local-scope entry shadowing the project one** (`claude mcp list` reports
  "defined in multiple scopes"): the stale local copy wins and may point at an
  old path or the pre-#388 blocking wrapper. Drop it with
  `claude mcp remove playwright-electron -s local` and start a new session.
- **A session started before the committed entries landed**: start a new session
  from the current checkout.
- **`.mcp.json` actually hand-edited** (rare):
  `scripts/verify-pr/provision-box.sh` reports each entry as `verified` or
  `repaired` — a repair means the file was damaged, and the new session picks up
  the fix.

## The round, step by step

### 1. Fetch the PR and parse its checklist

Read the PR body and branch:

```bash
gh pr view "$PR" --json number,headRefName,body,state -q '{number,headRefName,body,state}'
```

If `state` is not `OPEN`, stop. Extract the unchecked verification items with
the tested helper — it reads both `## Manual verification` and
`## Human verification required`, unchecked (`- [ ]`) items only, and tags each
`manual` or `human`:

```bash
gh pr view "$PR" --json body -q .body | scripts/verify-pr/parse-checklist.sh
```

If the helper prints nothing, there is nothing to verify — but check §1b before
concluding the round is a no-op: a UI-changing PR still earns a screenshot tour.
With no items **and** no UI surfaces, post a short comment saying so, emit
`manual-verify: 0/0 PASS, 0 deferred, 0 FAIL` plus
`screenshots: none (no UI change)`, and stop (no stack needed).

### 1b. Decide whether this PR needs a screenshot tour

A PR whose diff changes user-visible UI gets its screenshots posted into the
**PR description** — a reviewer should see the pixels without pulling the
branch. Whether a diff counts as "UI" is a tested file-path judgement, not a
call you make per round:

```bash
UI_SURFACES=$(gh pr diff "$PR" --name-only | scripts/verify-pr/detect-ui-change.sh)
```

Output is one surface per line — `frontend`, `smoker`, or both (a shared package
under `packages/*/src` renders in both apps). Empty output means no UI change:
skip the tour entirely, and emit `screenshots: none (no UI change)` alongside
the summary line. Non-empty means step 6 asks the verifier for a tour of exactly
those surfaces and step 7.2 posts it.

**Each surface has a mandatory tour viewport** — neither app is a desktop app,
so a default browser window documents a shape no user ever sees:

```bash
scripts/verify-pr/tour-viewport.sh frontend   # 427x952 — Pixel 10 Pro, portrait
scripts/verify-pr/tour-viewport.sh smoker     # 800x480 — the device panel
```

The frontend is used on a **Pixel 10 Pro held portrait** — the customer's phone;
its 1280x2856 panel at DPR 3 gives a 427x952 CSS viewport. The smoker shell runs
on the device's fixed 800x480 kiosk panel, and that number is mirrored from the
kiosk `BrowserWindow` in `apps/smoker/electron-app/index.ts` (a sibling test
parses that file and fails on drift, so the tour can never document a panel the
device no longer has). Resolve the viewport per surface and pass it into the
step 6 prompt — never let the verifier pick one.

### 2. Prepare the per-PR artifact directory

One timestamped directory per round, on the box, holding screenshots and full
logs. Its path is cited in the evidence comment (AC 7):

```bash
ARTIFACT_DIR="/tmp/verify-pr/${PR}/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$ARTIFACT_DIR"
```

### 3. Check out the PR branch

```bash
gh pr checkout "$PR"
```

The stack-runner builds images **from this checkout**, so the stack under test
is the PR's code, not master.

### 4. Preflight + boot the hermetic stack (one call, one retry built in)

`preflight-boot.sh` chains the §0 prerequisite checks, the stack-runner boot
with the one-retry rule, and (when asked) the §5 Electron launch — one Bash call
instead of the old 8–10 separate turns. Its stdout is ONLY the sourceable
contract; all progress and failure tails go to stderr:

```bash
# Pass --electron ONLY when a parsed item targets the smoker desktop app
# (§5's "do not launch needlessly" rule).
eval "$(scripts/verify-pr/preflight-boot.sh --pr "$PR")"   # add --electron if needed
```

Branch on its exit code:

- **0** — stack healthy (and Electron up, if requested); the `E2E_*` /
  `STACK_PROJECT_NAME` contract is now in your env. Proceed to §6.
- **3** — hard prerequisite failure (gh auth, missing scripts, missing
  stack-runner deps); nothing was booted. Abort with the specific prerequisite
  from stderr — never `apt-get`/`npm install` your way out.
- **4** — boot failed **twice** (the one-retry rule already ran, teardown
  already happened). **Infrastructure error, not a verdict**: do **not** spawn
  the agent, do **not** fabricate item verdicts; post the distinct
  infrastructure-error comment (with the stderr tail), emit
  `manual-verify: infra-error — stack boot failed (0 items verified)`, stop.
- **5** — stack healthy but the Electron launch failed; the stack is left UP and
  the contract was still emitted. Retry
  `scripts/verify-pr/electron-launcher.sh start` once yourself; if it fails
  again, treat the Electron-dependent items per the Electron runbook and
  continue browser-only where the checklist allows.

### 5. The smoker Electron app (folded into §4's call)

Electron starts via §4's `--electron` flag — pass it only when a parsed item
targets the smoker desktop app. There is no separate launch step on the happy
path; `electron-launcher.sh start` remains the manual retry tool for exit 5.

This step is the Electron tools' real precondition: the MCP server is already
registered, but it only connects on the first tool call. Do not call an
`mcp__playwright-electron__*` tool before this step succeeds; if one errors on
connection, the app is not up — launch it and retry, do not report a missing
tool.

Follow the **Electron runbook** below for the full chain, the display-truth
rule, and the shell-drift check before you launch.

### 6. Spawn the manual-verifier agent

Spawn the `manual-verifier` subagent (definition in
`.claude/agents/manual-verifier.md`). Pass it, in the prompt:

- the full list of parsed items (with their `manual`/`human` tags);
- the sourced stack contract (`E2E_*`, `STACK_PROJECT_NAME`);
- the `ARTIFACT_DIR` to write screenshots/logs into;
- the `UI_SURFACES` from §1b, when non-empty, with the **screenshot tour**
  instruction below.

The agent classifies each item (local → execute in real browser/Electron;
deployed-env → defer + demand a spec; hardware → defer to human with a named
blocker), gathers concrete evidence, and returns a per-item verdict block plus a
`verifier-tally:` line. You do **not** re-test; you consume its report.

**Screenshot tour (only when `UI_SURFACES` is non-empty).** Ask for it
explicitly, in the prompt:

> This PR changes UI on: \<UI_SURFACES>. In addition to your per-item evidence,
> capture a screenshot tour of the changed surfaces in the real browser /
> Electron shell: each screen the diff touches, in the state a reviewer would
> want to see (populated, not an empty first-run screen), one file per screen,
> **viewport-clipped, never full-page**. Fixed and sticky chrome — the bottom
> navigation bar — is painted once, at its viewport anchor, so a full-page
> capture of a document taller than the viewport strands that bar in the middle
> of the image on top of unrelated content, and a reviewer reads the artifact as
> a layout bug that does not exist (PR #464). When the content a reviewer needs
> to see is below the fold, **scroll to it and capture the viewport there** —
> that is the shot, not a full-page one. **Set the viewport before you capture,
> per surface:** frontend → 427x952 (a Pixel 10 Pro held portrait — it is a
> mobile app, never a desktop-width window); smoker → 800x480 (the device's
> kiosk panel). Both come from `scripts/verify-pr/tour-viewport.sh <surface>` —
> do not choose your own. Name them `<surface>-NN-<slug>.png` (e.g.
> `frontend-01-settings-page.png`, `smoker-02-smoke-screen.png`) in
> `ARTIFACT_DIR`, numbered in the order a reviewer should read them, and list
> them at the end of your report as `ui-shot: <filename> — <what it shows>`
> lines. Capture the tour even for screens whose checklist items you deferred:
> the tour documents the change, it does not verify it.

The tour is **evidence for humans, not a verdict**: a screen you could not reach
is simply absent from the tour and mentioned in your report; it never turns into
a FAIL by itself.

### 7. Reconcile the result onto the PR

From the agent's verdicts:

1. **Tick the passing boxes.** Collect the verbatim text of every **PASS** item,
   feed it to the tested ticker, and push the updated body — passing boxes only;
   deferred and failed boxes stay `- [ ]`; previously-ticked boxes stay ticked:

   ```bash
   gh pr view "$PR" --json body -q .body > "$ARTIFACT_DIR/body.md"
   printf '%s\n' "$PASSED_ITEMS" \
     | scripts/verify-pr/tick-checklist.sh "$ARTIFACT_DIR/body.md" > "$ARTIFACT_DIR/body.new.md"
   gh pr edit "$PR" --body-file "$ARTIFACT_DIR/body.new.md"
   ```

2. **Post the screenshot tour into the PR description** (only when §1b found UI
   surfaces and the agent returned `ui-shot:` lines). Order matters: this runs
   **after** the box-ticking push, and re-reads the body from GitHub, so the two
   body edits cannot clobber each other.

   The uploader drives a real logged-in Chrome (GitHub has no attachment API —
   see `scripts/pr-images/README.md`) and prints `caption<TAB>url` lines; the
   injector rewrites the body's `## Screenshots` section in place, so a
   re-verify round **refreshes** the tour instead of stacking a new copy under
   the old one:

   ```bash
   SHOTS=$(printf '%s\n' "$UI_SHOT_FILES")   # ARTIFACT_DIR paths, tour order
   ( cd scripts/pr-images && npx tsx cli.ts upload --pr "$PR" $SHOTS ) \
     > "$ARTIFACT_DIR/shots.tsv"
   UPLOAD_RC=$?

   if [ "$UPLOAD_RC" -eq 0 ]; then
     gh pr view "$PR" --json body -q .body > "$ARTIFACT_DIR/body.shots.md"
     scripts/verify-pr/inject-screenshots.sh "$ARTIFACT_DIR/body.shots.md" \
       < "$ARTIFACT_DIR/shots.tsv" > "$ARTIFACT_DIR/body.shots.new.md"
     gh pr edit "$PR" --body-file "$ARTIFACT_DIR/body.shots.new.md"
   fi
   ```

   **A screenshot failure is never a verification failure.** Route the exit code
   into the round's `screenshots:` line and carry on:

   | `UPLOAD_RC` | `screenshots:` line                                          |
   | ----------- | ------------------------------------------------------------ |
   | 0           | `screenshots: <n> posted`                                    |
   | 4           | `screenshots: SKIPPED — GitHub upload session expired`       |
   | 3           | `screenshots: SKIPPED — no desktop session for the uploader` |
   | 5           | `screenshots: PARTIAL — <n>/<total> uploaded`                |
   | other       | `screenshots: SKIPPED — uploader error (see ARTIFACT_DIR)`   |

   Exit 4 means the persistent profile's cookies expired; a human fixes it with
   `cd scripts/pr-images && npm run login` on the box's desktop. Say so verbatim
   in the evidence comment — an expired session is invisible otherwise, and the
   daemon would quietly stop posting screenshots for weeks.

3. **Post exactly one evidence comment for the round** (never one per item). It
   lists, per item: the verdict, the classification, the concrete evidence
   (status codes / request lines / DB rows / log excerpts / screenshot
   filenames), and — for deferrals — the demanded post-deploy spec or the named
   hardware blocker. It cites `ARTIFACT_DIR` as the evidence-artifact location.

   ```bash
   gh pr comment "$PR" --body-file "$ARTIFACT_DIR/comment.md"
   ```

4. **Emit the summary lines** as the skill's final stdout — the machine-readable
   contract the caller (and slice 6's verifier hook) parses:

   ```
   manual-verify: <pass>/<total> PASS, <deferred> deferred, <fail> FAIL
   screenshots: <n> posted | PARTIAL — … | SKIPPED — … | none (no UI change)
   ```

   `<total>` is the number of items this round acted on. An unjustified deferral
   counts as a **FAIL** (the agent already classified it that way). The
   `screenshots:` line is informational — it never changes the verdict, and the
   `manual-verify:` line stays first and unchanged in format so existing parsers
   keep working.

### 8. Teardown — UNCONDITIONALLY, on pass, fail, or error

Teardown runs no matter how the round ends — success, any FAIL, boot-abort, or a
mid-round crash. Structure the round so this always executes (a `trap` on EXIT,
or a `finally`-style block). Tear down in reverse order of setup:

```bash
scripts/verify-pr/electron-launcher.sh stop 2>/dev/null || true   # idempotent
cd scripts/stack-runner && npx tsx cli.ts down --pr "$PR"; cd - >/dev/null  # containers + volumes (-v)
# browser profile: the chrome-mcp-wrapper uses a fresh per-run --user-data-dir;
# remove the round's profile dir if one was created under the artifact/tmp area.
```

The stack-runner `down` removes containers **and** volumes; the Electron `stop`
is idempotent (safe even if step 5 never launched it); the headful Chrome runs
on a throwaway per-run profile. Leave the artifact directory in place — its path
was cited in the comment.

Return to the original branch after teardown (`git checkout -` / the branch you
started on) so you do not strand the checkout on the PR branch.

## Electron runbook

Every round wires the Electron chain identically. These rules are load-bearing:
`bash scripts/verify-pr/check-harness-runbook.sh` fails if any of them
disappears from this skill or from `.claude/agents/manual-verifier.md`. They
exist because a round on PR #382 deferred its three most valuable items as "no
tool available" while the box had a live desktop session the whole time.

### Display truth

Display truth comes only from the shared display-resolution library
`scripts/verify-pr/lib/resolve-display-env.sh`, which both launchers that touch
the display — `scripts/verify-pr/chrome-mcp-wrapper.sh` (launches headful
Chrome) and `scripts/verify-pr/electron-launcher.sh` (launches the shell) —
source. It resolves the box's live GNOME/XWayland session, including the
X-authority file whose path rotates on every boot. An unset shell `$DISPLAY` is
never evidence of a headless sandbox — the round's shell simply does not inherit
the desktop session's variables. The library returning non-zero (no active
session) is the one and only legitimate "no display" signal, and it is an
infrastructure finding, not an item verdict.

### Electron lifecycle

The Electron path is always launcher-start → CDP-attach → drive → launcher-stop:

1. **launcher-start** — `scripts/verify-pr/electron-launcher.sh start` resolves
   the display, launches the smoker shell against this stack's renderer URL, and
   blocks until its CDP endpoint answers.
2. **CDP-attach** — the `playwright-electron` MCP server
   (`scripts/verify-pr/electron-cdp-mcp-wrapper.sh`) dials that fixed CDP
   endpoint lazily, on the agent's first `mcp__playwright-electron__*` call.
3. **drive** — the agent snapshots, clicks, types, and reads network/console in
   the real shell, capturing evidence into `ARTIFACT_DIR`.
4. **launcher-stop** — `scripts/verify-pr/electron-launcher.sh stop` runs on
   every exit path (pass, FAIL, infra-error, or crash), from the §8 teardown
   block. It is idempotent, so it is safe even when step 5 never launched.

There is no other route to the shell: no `npm start`, no manual `electron .`, no
hand-rolled CDP client.

### Shell drift

The Electron shell's main process runs from the provisioned daemon checkout (its
dependencies and the Electron binary are installed there by
`scripts/verify-pr/provision-box.sh`); the renderer content always comes from
the PR's hermetic stack. Before launching, check whether the PR touches the
shell itself. These are its real tracked paths — the main process
(`electron-app/index.ts`, the forge `entryPoints` main), the preload, the
renderer-URL module slice 3 added, every build input the provisioner treats as a
shell source (`SMOKER_SHELL_SOURCES` in `provision-box.sh`: the forge config and
all three webpack configs, since the renderer/rules pair compiles the preload),
the thin-mode entry document the forge config loads in thin mode, and the thin
shell image — matched literally, so a rename shows up as a check failure rather
than as silent under-matching:

```bash
gh pr diff "$PR" --name-only | grep -F \
  -e apps/smoker/electron-app/ \
  -e apps/smoker/src/electron/ \
  -e apps/smoker/config.forge.js \
  -e apps/smoker/webpack.main.config.js \
  -e apps/smoker/webpack.renderer.config.js \
  -e apps/smoker/webpack.rules.js \
  -e apps/smoker/public/thin.html \
  -e apps/smoker/shell.dockerfile \
  -e apps/smoker/package.json || true
```

If anything matches, note the drift in the evidence comment and defer
shell-specific behavior for that round — renderer-side behavior is still
verified, because that content is the PR's own build.

### Stack-mutation authority

The verifier may `docker stop` and `docker start` containers strictly within the
current per-PR compose project namespace (`$STACK_PROJECT_NAME`) — that is how
offline batching and reconnect flush are exercised against a real connectivity
loss (stop the backend, drive the shell, start it again, watch the flush).
Nothing outside that namespace may be stopped, started, built, pulled, or
pruned: no other PR's stack, no host containers, no dev or prod anything.

### Live temperature feed

Live temperature data comes from the device-service emulator mode already wired
into the hermetic compose definition (`NODE_ENV=local` on the `device-service`
service in `e2e/docker/docker-compose.e2e.yml` — synthetic ramping temps every
500 ms). No hardware and no extra simulation code are needed, so "no probe
attached" is never a reason to defer a temperature item; temps not arriving is a
real finding.

### Both-direction propagation

Rename and start/stop propagation is verified by driving the cloud frontend in
headful Chrome and the smoker shell in Electron simultaneously — one MCP server
each, both pointed at the same per-PR stack — and asserting the change in both
directions: made in Chrome, observed in the shell; made in the shell, observed
in Chrome.

### Wifi indicator bound

The wifi adapter stays off in hermetic builds (the environment is intentionally
not production), so the wifi indicator is verified through the store snapshot
flag and wifi-screen navigation rather than by joining a network. State that
bound explicitly in the evidence instead of claiming a full pass.

## Hard rules

- **Never fabricate a verdict.** If the stack never booted, there are zero item
  verdicts — say so (infra-error), do not invent PASS/FAIL for un-run items.
- **Only tick what passed.** Deferred and failed items keep their empty box.
  Never un-tick a box. Re-running the skill re-verifies only still-unchecked
  items.
- **One comment per round.** Not one per item, not one per re-run of an item.
- **Teardown is not optional.** No exit path — including your own error — may
  leave the stack, its volumes, the Electron app, or the browser profile behind.
- **Do not install anything or touch other projects' containers.** All docker is
  scoped to the `smoker-pr-<n>` project (the stack-runner enforces the name).
  Within that namespace the verifier is authorised to stop and start containers
  (see the Electron runbook); outside it, nothing.
- **You do not verify.** The agent tests; you orchestrate and reconcile. Do not
  substitute your own judgment for a missing agent verdict.

## Demo / manual verification (needs the verify-pr box)

The end-to-end proof runs on the always-on verify-pr box (real display, docker,
provisioned MCP servers) and is **not** run from CI or a dev laptop:

1. Open a small synthetic test PR with a checklist of one browser item (`- [ ]`
   under `## Manual verification`) and one deployed-env item (`- [ ]` under
   `## Human verification required`); label it clearly and plan to close it
   after the demo.
2. `/verify-pr <synthetic-PR#>` and observe: checklist parsed (both sections,
   unchecked only), stack up, agent spawned, the browser item ticked with cited
   network/console evidence, the deployed-env item left unticked and reported as
   a DEFER with a demanded spec, one evidence comment posted, the
   `manual-verify:` line emitted, and a clean teardown (no leftover
   containers/volumes/Electron).
3. Force a boot failure (e.g. a deliberately broken build on a scratch branch)
   and confirm the retry-once-then-infra-error path emits zero item verdicts and
   still tears down.
