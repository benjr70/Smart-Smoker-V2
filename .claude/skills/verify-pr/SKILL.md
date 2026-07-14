---
name: verify-pr
description:
  Run one manual-verification round against an open PR — parse its verification
  checklist, boot a hermetic per-PR stack, spawn the manual-verifier agent to
  exercise each item in a real headful browser / Electron, tick the passing
  boxes, post one evidence comment, emit a `manual-verify:` summary line, and
  tear everything down. Use when the user says "verify PR <n>", "run manual
  verification", or invokes /verify-pr.
disable-model-invocation: true
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

## Prerequisites (fail fast, do not auto-install)

The box must already be provisioned (slice 2) and the stack-runner deps present
(slice 1). Verify cheaply; if anything is missing, abort with the specific
prerequisite — never `apt-get`/`npm install` your way out (installing is the
verifier agent's forbidden zone too):

```bash
gh auth status >/dev/null || { echo "verify-pr: gh not authenticated"; exit 1; }
test -f scripts/verify-pr/parse-checklist.sh
test -f scripts/verify-pr/tick-checklist.sh
test -d scripts/stack-runner/node_modules || echo "verify-pr: run 'cd scripts/stack-runner && npm install' first"
```

The `playwright-chrome` and `playwright-electron` MCP servers must be registered
(they are, if `scripts/verify-pr/provision-box.sh` has run).

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

If the helper prints nothing, there is nothing to verify: post a short comment
saying so, emit `manual-verify: 0/0 PASS, 0 deferred, 0 FAIL`, and stop (no
stack needed).

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

### 4. Boot the hermetic stack (one retry, then abort)

The stack-runner boots the whole app under a namespaced project and prints the
`KEY=value` contract on stdout (URLs + hermetic Mongo string). Progress goes to
stderr, so capture stdout cleanly:

```bash
cd scripts/stack-runner
STACK_OUT="$(npx tsx cli.ts up --pr "$PR")"   # blocks until healthy or fails
cd - >/dev/null
```

**Boot failure is an infrastructure error, not a verdict.** If `up` exits
non-zero (build/health failure), tear down and retry **exactly once**. If the
retry also fails, **abort the round**:

- do **not** spawn the agent, do **not** fabricate any item verdicts;
- post a distinct **infrastructure-error** comment (stack failed to boot, with
  the stderr tail), clearly separate from a verification result;
- emit `manual-verify: infra-error — stack boot failed (0 items verified)` and
  stop after teardown (§8).

On success, source the contract so the agent inherits it:

```bash
eval "$(printf '%s\n' "$STACK_OUT" | grep -E '^(E2E_|STACK_PROJECT_NAME=)')"
```

### 5. Launch the smoker Electron app (only if a smoker/Electron item exists)

If any parsed item targets the smoker desktop app, start it against this stack
so the `playwright-electron` MCP server can attach over CDP:

```bash
scripts/verify-pr/electron-launcher.sh start   # blocks until CDP is ready
```

If no item needs Electron, skip this — do not launch it needlessly.

### 6. Spawn the manual-verifier agent

Spawn the `manual-verifier` subagent (definition in
`.claude/agents/manual-verifier.md`). Pass it, in the prompt:

- the full list of parsed items (with their `manual`/`human` tags);
- the sourced stack contract (`E2E_*`, `STACK_PROJECT_NAME`);
- the `ARTIFACT_DIR` to write screenshots/logs into.

The agent classifies each item (local → execute in real browser/Electron;
deployed-env → defer + demand a spec; hardware → defer to human with a named
blocker), gathers concrete evidence, and returns a per-item verdict block plus a
`verifier-tally:` line. You do **not** re-test; you consume its report.

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

2. **Post exactly one evidence comment for the round** (never one per item). It
   lists, per item: the verdict, the classification, the concrete evidence
   (status codes / request lines / DB rows / log excerpts / screenshot
   filenames), and — for deferrals — the demanded post-deploy spec or the named
   hardware blocker. It cites `ARTIFACT_DIR` as the evidence-artifact location.

   ```bash
   gh pr comment "$PR" --body-file "$ARTIFACT_DIR/comment.md"
   ```

3. **Emit the summary line** as the skill's final stdout — the machine-readable
   contract the caller (and slice 6's verifier hook) parses:

   ```
   manual-verify: <pass>/<total> PASS, <deferred> deferred, <fail> FAIL
   ```

   `<total>` is the number of items this round acted on. An unjustified deferral
   counts as a **FAIL** (the agent already classified it that way).

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
