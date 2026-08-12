---
name: pr-watch
description:
  Watch a freshly opened PR's CI checks, auto-fix failures by spawning the
  implementer in a bounded loop, and either land green or mark the PR draft on
  exhaustion. Invoked (blocking) by `/team-pickup` §6a.1 immediately after PR
  creation. Takes the PR number + branch + repo + issue number as arguments.
---

# PR Watch — Autonomous CI Babysitter + Fix Loop

You are the **CI watcher** spawned by `/team-pickup` after a PR opens. One fire
= one PR. You poll checks, dispatch fixes when checks fail, and return a single
terminal verdict line that the caller pastes into its output block.

team-pickup may invoke you **more than once on the same PR** — once per manual
verification round (§6a.3), after each `fix(manual)` push re-runs CI. Your
10-round fix cap is **per invocation**; each call starts a fresh budget and just
watches the PR's current head to green.

This skill assumes:

- The PR is already open on `feat/issue-<N>` against `master`.
- The implementer agent definition exists in `.claude/agents/implementer.md` and
  is callable via the `Agent` tool with `subagent_type: implementer`.
- The repo's `team:checks-failed` label is created by `/team-dispatch` §0.

## Invocation

```
/pr-watch --pr <PR_NUM> --branch <BRANCH> --repo <OWNER/REPO> --issue <ISSUE_N>
```

All four arguments required. No defaults — the caller (team-pickup) supplies
them verbatim from the PR-create step.

## Process

### 0. Pre-flight

```bash
gh auth status >/dev/null || { echo "pr-watch: ERROR — gh not authenticated"; exit 1; }
gh pr view "$PR_NUM" --repo "$REPO" --json number,headRefName,state \
  | jq -e --arg br "$BRANCH" '.headRefName == $br and .state == "OPEN"' >/dev/null \
  || { echo "pr-watch: ERROR — PR #$PR_NUM not open on $BRANCH"; exit 1; }
```

If the PR is already closed/merged, exit `pr-watch: ERROR — pr not open`.

### 1. Round loop (max 10)

```
ROUND=0
MAX_ROUNDS=10
```

Each round:

1. **Poll CI** (§2)
2. If green → return `pr-watch: PASS — all checks green at attempt $ROUND` and
   exit 0.
3. If red → **gather failure context** (§3), **spawn implementer** (§4),
   **commit + push** (§5), increment `ROUND`, loop.
4. If `ROUND == MAX_ROUNDS` and still red → **draft-on-exhaust** (§6) and return
   `pr-watch: DRAFT — exhausted 10 rounds, marked draft, team:checks-failed`.

### 2. Wait for CI to settle (zero turns while it runs)

Run the consolidated waiter **in the background** — one Bash call with
`run_in_background: true`. It polls on its own clock (60s interval, 45-min cap),
and the harness re-invokes you exactly once when it exits. Do **not** poll
`gh pr checks` yourself between rounds, and do not run the waiter in the
foreground (the Bash tool's 10-min ceiling would force re-invocations — the
exact turn burn this script eliminates).

```bash
# run_in_background: true
scripts/claude-agent/lib/ci-wait.sh --pr "$PR_NUM" --repo "$REPO"
```

When it completes, read its output. **Line 1 is the JSON verdict**; on a red
settle the §3 failure-log bundle follows it in the same output:

- exit 0 / `"result":"green"` → success branch in §1
  (`pr-watch: round $ROUND — all green`)
- exit 1 / `"result":"fail"` → fix branch in §1
  (`pr-watch: round $ROUND — <failed count> failed check(s), proceeding to fix`)
- exit 2 / `"result":"timeout"` →
  `pr-watch: ERROR — polling timeout (45min) at round $ROUND`, exit 1
- exit 3 / `"result":"error"` → checks unreadable 3 polls straight — re-check
  `gh auth status` and the PR state before deciding anything

`bucket == "skipping"` is benign and already ignored by the script. Only `fail`
counts as red.

### 3. Gather failure context

For the fix-loop, the implementer needs:

1. **Issue body** — `gh issue view $ISSUE_N --repo $REPO --json title,body`
2. **PR diff** — `gh pr diff $PR_NUM --repo $REPO` (capped at 2000 lines; if
   longer, truncate with a `... [truncated]` marker)
3. **Failed job logs** — already in hand: ci-wait.sh printed the last 200 lines
   of each failed job as `=== <job name> ===` sections right after its JSON
   verdict line. Do **not** re-fetch logs with `gh run view` — reuse that bundle
   verbatim.

Fetch 1 and 2 in a single Bash call, then bundle all three into a single context
blob the implementer prompt embeds verbatim.

### 4. Spawn implementer (Opus)

Use the `Agent` tool. Subagent is the project's `implementer` definition
(already pinned to Opus, allowlist Edit/Write/Bash/Read/Grep/Glob).

- `subagent_type: implementer`
- `model: opus`
- `run_in_background: false` ← blocking; we need the fix before next poll
- `prompt`:

  ```
  You are fixing failing CI checks on PR #<PR_NUM> (branch <BRANCH>) for
  issue #<ISSUE_N> in <REPO>.

  ## Original issue
  <issue title + body>

  ## Current PR diff
  <pr diff or truncated tail>

  ## Failing job logs (tail 200 lines per job)
  <log bundle>

  Fix the failures. Stage the fix. Do NOT commit and do NOT push — the
  wrapper handles that. Reply only when staged changes are ready, with a
  short summary of what you changed. If the failure looks like flake/infra
  (no code change warranted), reply with: `pr-watch-flake: <one-line reason>`
  and stage nothing.
  ```

### 5. Commit + push (append, no force)

After the implementer returns:

```bash
if git diff --staged --quiet; then
  if echo "$IMPL_REPLY" | grep -q '^pr-watch-flake:'; then
    echo "pr-watch: round $ROUND — implementer flagged flake, re-polling without commit"
    # Loop back to §2 without bumping ROUND-as-fix; still counts toward cap.
  else
    echo "pr-watch: ERROR — implementer staged nothing and did not flag flake"
    exit 1
  fi
else
  git commit -m "fix(ci): pr-watch round $ROUND — auto-fix failing checks

$(echo "$IMPL_REPLY" | head -20)
"
  git push origin "$BRANCH"   # plain push, never --force
fi
```

Plain `git push` (no `--force`, no `--force-with-lease`). If push is rejected
because someone pushed concurrently to the branch, return
`pr-watch: ERROR — branch diverged, manual triage required` — single-VM
constraint means this should never happen; if it does, abort.

### 6. Draft on exhaust

After 10 rounds without green:

```bash
gh pr ready "$PR_NUM" --repo "$REPO" --undo                # convert to draft
gh pr edit  "$PR_NUM" --repo "$REPO" --add-label team:checks-failed
gh issue comment "$ISSUE_N" --repo "$REPO" --body \
  "pr-watch exhausted 10 fix rounds on PR #$PR_NUM. Marked draft + labeled team:checks-failed. Human triage required."
```

Return:
`pr-watch: DRAFT — exhausted 10 rounds, marked draft, team:checks-failed`

## Terminal verdict

Exactly one of these is the final line printed before exit:

- `pr-watch: PASS — all checks green at attempt <K>`
- `pr-watch: DRAFT — exhausted 10 rounds, marked draft, team:checks-failed`
- `pr-watch: ERROR — <reason>`

The team-pickup caller parses this line verbatim into its §7 output block.

## Failure modes

- **PR closed/merged mid-watch** — exit `pr-watch: ERROR — pr not open` on the
  next poll. Do not attempt to push.
- **Branch diverged** (concurrent push) — see §5; should not happen under the
  single-VM constraint.
- **Implementer returns flake flag** — round still counts toward the 10-cap.
  Re-poll without a new commit; if checks were truly transient they may green on
  retry.
- **All 10 rounds pass implementer but checks stay red** — §6 fires; PR drafts.
- **`gh run view` rate-limited** — fall back to `gh api` direct calls or skip
  log bundle for that round; the implementer still gets issue + diff.

## Boundaries

- Never force-pushes. Never rewrites history. Append-only fix commits. (The sole
  sanctioned force-push in the whole autonomous system is `/pr-reconcile`'s
  rebase phase, and even that is `--force-with-lease` only — pr-watch itself has
  no exception.)
- Never merges the PR. Green CI is the verdict; merge is human-gated.
- Never operates on a PR not on `feat/issue-<N>` (defense against the caller
  passing a hand-crafted PR — only team-pickup output is supported).
- Never spawns reviewer/verifier. The fix-loop is implementer-only; the
  pre-commit review happens during team-dispatch and the one-time post-PR review
  is `/pr-review` (team-pickup §6a.1b) — pr-watch itself never reviews.
- Never extends the 10-round cap. Exhaustion is the signal to escalate to a
  human, not to retry harder.
