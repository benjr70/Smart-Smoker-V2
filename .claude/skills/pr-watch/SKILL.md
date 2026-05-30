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

### 2. Poll CI (60s interval, 45min cap per round)

```bash
DEADLINE=$(( $(date +%s) + 45*60 ))
while : ; do
  STATUS=$(gh pr checks "$PR_NUM" --repo "$REPO" --json bucket,name,state,link)
  PENDING=$(echo "$STATUS" | jq '[.[] | select(.bucket == "pending")] | length')
  FAIL=$(echo "$STATUS" | jq '[.[] | select(.bucket == "fail")] | length')
  if [ "$PENDING" -eq 0 ] && [ "$FAIL" -eq 0 ]; then
    echo "pr-watch: round $ROUND — all green"
    break  # → success branch in §1
  fi
  if [ "$FAIL" -gt 0 ] && [ "$PENDING" -eq 0 ]; then
    echo "pr-watch: round $ROUND — $FAIL failed check(s), proceeding to fix"
    break  # → fix branch in §1
  fi
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    echo "pr-watch: ERROR — polling timeout (45min) at round $ROUND"
    exit 1
  fi
  sleep 60
done
```

Treat any `bucket == "skipping"` as benign — ignore. Only `fail` counts as red.

### 3. Gather failure context

For the fix-loop, the implementer needs:

1. **Issue body** — `gh issue view $ISSUE_N --repo $REPO --json title,body`
2. **PR diff** — `gh pr diff $PR_NUM --repo $REPO` (capped at 2000 lines; if
   longer, truncate with a `... [truncated]` marker)
3. **Failed job logs** — for each `fail` entry from §2's `gh pr checks`, fetch
   the run log and keep the last **200 lines per job** (failures cluster at the
   tail of the log).

```bash
FAILED_JOBS=$(echo "$STATUS" | jq -r '.[] | select(.bucket == "fail") | "\(.name)\t\(.link)"')
LOG_BUNDLE=""
echo "$FAILED_JOBS" | while IFS=$'\t' read -r NAME LINK; do
  RUN_ID=$(echo "$LINK" | grep -oE 'runs/[0-9]+' | cut -d/ -f2)
  JOB_LOG=$(gh run view "$RUN_ID" --repo "$REPO" --log-failed 2>/dev/null | tail -200)
  LOG_BUNDLE+=$'\n\n=== '"$NAME"$' ===\n'"$JOB_LOG"
done
```

Bundle all three into a single context blob the implementer prompt embeds
verbatim.

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

- Never force-pushes. Never rewrites history. Append-only fix commits.
- Never merges the PR. Green CI is the verdict; merge is human-gated.
- Never operates on a PR not on `feat/issue-<N>` (defense against the caller
  passing a hand-crafted PR — only team-pickup output is supported).
- Never spawns reviewer/verifier. The fix-loop is implementer-only; pre-merge
  review already happened during team-dispatch.
- Never extends the 10-round cap. Exhaustion is the signal to escalate to a
  human, not to retry harder.
