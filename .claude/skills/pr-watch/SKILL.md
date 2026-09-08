---
name: pr-watch
description:
  Watch a freshly opened PR's CI checks, auto-fix failures by spawning the
  implementer in a bounded loop, and either land green or mark the PR draft on
  exhaustion. Invoked (blocking) by `/afk-pickup` §6a.1 immediately after PR
  creation. Takes the PR number + branch + repo + issue number as arguments.
  `--bot` switches it to the Dependabot lane's budget, label, fix brief and
  commit trailer.
---

# PR Watch — Autonomous CI Babysitter + Fix Loop

You are the **CI watcher** spawned by `/afk-pickup` after a PR opens. One fire =
one PR. You poll checks, dispatch fixes when checks fail, and return a single
terminal verdict line that the caller pastes into its output block.

afk-pickup may invoke you **more than once on the same PR** — once per manual
verification round (§6a.3), after each `fix(manual)` push re-runs CI. Your
10-round fix cap is **per invocation**; each call starts a fresh budget and just
watches the PR's current head to green.

## Two modes

|                  | default (agent PR)        | `--bot` (Dependabot PR)              |
| ---------------- | ------------------------- | ------------------------------------ |
| caller           | `/afk-pickup` §6a.1       | the deps-land lane (Spec #651)       |
| branch           | `feat/issue-<N>`          | `dependabot/…`                       |
| backing issue    | required                  | none — `--issue` may be `none`       |
| fix budget       | 10 rounds, fresh per fire | 3 **total**, accumulated via markers |
| exhaustion label | `AFK:checks-failed`       | `AFK:deps-failed`                    |
| exhaustion note  | comment on the issue      | comment on the PR                    |
| fix commits      | plain `fix(ci):` message  | message ends `[dependabot skip]`     |
| per-round record | none                      | one `fix-attempt` marker comment     |

**The default path is unchanged by bot mode.** Without `--bot`, every step,
every label and every verdict line below is exactly what it has always been; bot
behaviour only ever appears in an explicitly marked _(bot mode)_ branch.

This skill assumes:

- The PR is already open on `feat/issue-<N>` — or, in bot mode, on
  `dependabot/…` — against `master`.
- The implementer agent definition exists in `.claude/agents/implementer.md` and
  is callable via the `Agent` tool with `subagent_type: implementer`.
- The repo's `AFK:checks-failed` label is created by `/afk-dispatch` §0, and its
  `AFK:deps-failed` label by the deps-land lane.
- `scripts/claude-agent/lib/deps-lane.sh` is present (bot mode only — it owns
  the cap arithmetic, the markers and the commit trailer).

## Invocation

```
/pr-watch --pr <PR_NUM> --branch <BRANCH> --repo <OWNER/REPO> --issue <ISSUE_N> [--bot]
```

The first four arguments are required. No defaults — the caller (afk-pickup)
supplies them verbatim from the PR-create step.

`--bot` (optional) says: **this is a Dependabot PR**. The caller is the
deps-land lane, the branch is `dependabot/…`, and there is no backing issue —
`--issue` may be omitted or passed as `none`, and the exhaustion comment goes on
the PR instead of on an issue.

## Process

### 0. Pre-flight

```bash
gh auth status >/dev/null || { echo "pr-watch: ERROR — gh not authenticated"; exit 1; }
gh pr view "$PR_NUM" --repo "$REPO" --json number,headRefName,state \
  | jq -e --arg br "$BRANCH" '.headRefName == $br and .state == "OPEN"' >/dev/null \
  || { echo "pr-watch: ERROR — PR #$PR_NUM not open on $BRANCH"; exit 1; }
```

If the PR is already closed/merged, exit `pr-watch: ERROR — pr not open`.

_(bot mode)_ The branch guard accepts `dependabot/…` as well as
`feat/issue-<N>`; nothing else, in either mode. The guard exists to stop a
hand-crafted PR being driven by this loop, and Dependabot's branch prefix is the
second — and only other — shape the autonomous system creates.

### 1. Round loop (max 10)

```
ROUND=0
MAX_ROUNDS=10
```

_(bot mode)_ The budget is not 10-per-fire but **3 in total across every fire on
this bump**, so read what previous fires already spent before doing anything
else:

```bash
HEAD_SHA=$(gh pr view "$PR_NUM" --repo "$REPO" --json headRefOid -q .headRefOid)

# Read the comments into a variable FIRST and check that read's own status.
# Never `gh api … | deps-lane.sh marker-parse …` as one pipeline: a pipeline
# reports only its LAST command's status, and marker-parse given a valid sha
# and empty stdin exits 0 printing `{"fixAttempts":0,…}`. A rate-limited,
# unauthenticated or offline `gh api` would then read as "zero attempts spent"
# and hand the least trustworthy PR a fresh full budget — the exact
# grind-forever case this section exists to prevent.
COMMENTS=$(gh api "repos/$REPO/issues/$PR_NUM/comments" --paginate --jq '.[].body') \
  || COMMENTS="__unreadable__"

if [ -z "$HEAD_SHA" ] || [ "$COMMENTS" = "__unreadable__" ]; then
  MAX_ROUNDS=""
else
  MARKERS=$(printf '%s\n' "$COMMENTS" \
    | scripts/claude-agent/lib/deps-lane.sh marker-parse "$HEAD_SHA") || MARKERS=""
  ATTEMPTS=$(printf '%s' "$MARKERS" | jq -r '.fixAttempts // empty')
  MAX_ROUNDS=$(scripts/claude-agent/lib/deps-lane.sh rounds-left "$ATTEMPTS") \
    || MAX_ROUNDS=""
fi
```

**An unreadable history is an ERROR, never a full budget.** If the head sha or
the comment read failed, or `marker-parse` exits non-zero (no sha, missing
`jq`), or `rounds-left` prints nothing — `MAX_ROUNDS` empty — stop immediately:

```bash
if [ -z "$MAX_ROUNDS" ]; then
  echo "pr-watch: ERROR — bot marker history unreadable"
  exit 1
fi
```

Do **not** fall back to 3, and do not treat the empty read as 0 attempts spent.
A PR whose past attempts cannot be counted is exactly the PR that must not be
handed the largest possible fix budget: that is how a bump the lane already
failed three times gets ground on forever. Erroring out costs one fire and
leaves the PR untouched for the next one; guessing costs the cap.

If `MAX_ROUNDS` is 0, go **straight to the exhaustion path (§6) without polling
CI at all** and return the bot DRAFT verdict. Three attempts are already on the
record; paying a 45-minute CI wait to re-learn a decision already made is pure
budget burn.

**Marker keying.** Markers are keyed to the **PR head sha**, the one marker
vocabulary the whole lane shares (Spec #651): `deps-lane.sh marker-emit` keys to
"this exact head sha", and `lib/pr-triage.sh`'s `_pr_triage_enrich_deps_one`
parses markers against the current `headRefOid`. Read the count against the head
at invocation start; write each round's marker against the head the push just
created (§5), so the next fire — which sees that push as the head — reads the
accumulated count back. Tier B (`/verify-pr`) markers are written against the
same key, which is what makes the cap "3 attempts total across both tiers and
across fires" rather than 3 per tier.

Our own pushes move the head, so each round re-stamps the accumulated count onto
the new head (§5); the count therefore resets only when the head moves without
our markers following it — a Dependabot rebase or a new version push replaces
the branch tip, and the fresh bump correctly starts with a full budget. Keying
instead to the newest _bot-authored_ commit would survive our pushes without
re-stamping, but it would key on a sha no other lane component parses: triage
would report `fixAttempts: 0` and Tier B markers would never combine with this
loop's count.

Each round:

1. **Poll CI** (§2)
2. If green → return `pr-watch: PASS — all checks green at attempt $ROUND` and
   exit 0.
3. If red → **gather failure context** (§3), **spawn implementer** (§4),
   **commit + push** (§5), increment `ROUND`, loop.
4. If `ROUND == MAX_ROUNDS` and still red → **draft-on-exhaust** (§6) and return
   `pr-watch: DRAFT — exhausted 10 rounds, marked draft, AFK:checks-failed`.

_(bot mode)_ Same loop, with `MAX_ROUNDS` from the cap read above; the green
verdict is `pr-watch: PASS — all checks green at attempt <K> (bot)` and the
exhausted verdict is
`pr-watch: DRAFT — exhausted 3 attempts, marked draft, AFK:deps-failed` — the
count named is the cap, not this fire's rounds, because the budget is shared
across fires.

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

1. **Issue body** — `gh issue view $ISSUE_N --repo $REPO --json title,body` —
   _(bot mode)_ there is no issue; use the PR's own title and body instead
   (`gh pr view $PR_NUM --repo $REPO --json title,body`), which carry
   Dependabot's release notes, changelog and commit list.
2. **PR diff** — `gh pr diff $PR_NUM --repo $REPO` (capped at 2000 lines; if
   longer, truncate with a `... [truncated]` marker)
3. **Failed job logs** — already in hand: ci-wait.sh printed the last 200 lines
   of each failed job as `=== <job name> ===` sections right after its JSON
   verdict line. Do **not** re-fetch logs with `gh run view` — reuse that bundle
   verbatim.

Fetch 1 and 2 in a single Bash call, then bundle all three into a single context
blob the implementer prompt embeds verbatim.

### 4. Spawn implementer (Opus, medium effort)

Use the `Agent` tool. Subagent is the project's `implementer` definition
(already pinned to Opus at medium effort, allowlist
Edit/Write/Bash/Read/Grep/Glob).

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

_(bot mode)_ The prompt **leads** with the dependency-bump context, before the
diff and the logs, because it changes what a correct fix looks like:

```
This branch is a Dependabot DEPENDENCY BUMP on PR #<PR_NUM> in <REPO>.
There is no backing issue.

Before any other fix, regenerate the lockfile:

    npm install --legacy-peer-deps --package-lock-only --ignore-scripts

`--legacy-peer-deps` is mandatory in this repo (see the root .npmrc); a
lockfile regenerated without it will fail CI differently, and
`--package-lock-only --ignore-scripts` keeps the change to the lockfile and
runs no package scripts from the freshly-bumped dependency. Most bot-PR CI
failures are a stale or partially-resolved lockfile and need nothing else.

Only if the lockfile is already correct should you touch application code,
and then minimally: adapt our code to the new dependency version. Do NOT
change the dependency's version range to dodge the failure — that reverts
the bump this PR exists to make.

## PR title + body (Dependabot's release notes)
<pr title + body>
```

The usual PR diff and failing-job-log sections follow verbatim, and the same
closing instructions apply (stage the fix, do not commit, do not push, or reply
`pr-watch-flake: <reason>`).

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

_(bot mode)_ The message goes through the lane lib so it ends with
`[dependabot skip]`, and the round is recorded as a marker after the push:

```bash
MSG=$(printf 'fix(ci): pr-watch round %s — auto-fix failing checks\n\n%s\n' \
        "$ROUND" "$(echo "$IMPL_REPLY" | head -20)" \
      | scripts/claude-agent/lib/deps-lane.sh commit-trailer)
git commit -m "$MSG"
git push origin "$BRANCH"   # plain push, never --force

# One marker comment per fix round, keyed to the head sha the push just created
# — the same key triage and Tier B use (§1 "Marker keying"). `marker-parse`
# COUNTS markers for exactly that sha, and our push moved the sha, so the
# comment re-stamps the whole history onto the new head: one marker per attempt
# spent so far, earlier fires included. Anything less and the count silently
# restarts at 1 after every push.
HEAD_SHA=$(git rev-parse HEAD)
BODY="pr-watch bot fix attempt $((ATTEMPTS + ROUND)) of 3 on this bump."$'\n'
for i in $(seq 1 $((ATTEMPTS + ROUND))); do
  BODY="$BODY$(scripts/claude-agent/lib/deps-lane.sh marker-emit fix-attempt \
                 "$HEAD_SHA" "$i")"$'\n'
done
gh pr comment "$PR_NUM" --repo "$REPO" --body "$BODY"
```

Both halves are load-bearing. Without the trailer, Dependabot treats the branch
as human-owned and stops rebasing it — the PR then rots behind master with no
bot able to update it. Without exactly **one marker comment per fix round**,
carrying one marker per attempt spent, the next fire re-reads the wrong budget:
too few markers and the cap never trips, too many and a bump is abandoned a
round early.

Plain `git push` (no `--force`, no `--force-with-lease`). If push is rejected
because someone pushed concurrently to the branch, return
`pr-watch: ERROR — branch diverged, manual triage required` — single-VM
constraint means this should never happen; if it does, abort.

### 6. Draft on exhaust

After 10 rounds without green:

```bash
gh pr ready "$PR_NUM" --repo "$REPO" --undo                # convert to draft
gh pr edit  "$PR_NUM" --repo "$REPO" --add-label AFK:checks-failed
gh issue comment "$ISSUE_N" --repo "$REPO" --body \
  "pr-watch exhausted 10 fix rounds on PR #$PR_NUM. Marked draft + labeled AFK:checks-failed. Human triage required."
```

Return: `pr-watch: DRAFT — exhausted 10 rounds, marked draft, AFK:checks-failed`

_(bot mode)_ Same three moves, against the PR — there is no issue to comment on:

```bash
# `|| true`: a re-fire may find the PR already drafted by an earlier
# exhaustion, and `gh pr ready --undo` fails on a PR that is already a draft.
# Failing there would abort before the label, the comment and the DRAFT verdict
# line the lane parses — so the already-drafted case must be a no-op, not a stop.
gh pr ready "$PR_NUM" --repo "$REPO" --undo || true         # convert to draft
gh pr edit  "$PR_NUM" --repo "$REPO" --add-label AFK:deps-failed
gh pr comment "$PR_NUM" --repo "$REPO" --body \
  "pr-watch exhausted 3 fix attempts on this bump. Marked draft + labeled AFK:deps-failed. Human triage required."
```

**Rule: never apply `AFK:checks-failed` to a Dependabot PR.** The deps-land lane
only ever looks for `AFK:deps-failed`; a bot PR wearing the agent-lane label is
invisible to both lanes and sits drafted and unowned until a human happens to
notice it.

Return: `pr-watch: DRAFT — exhausted 3 attempts, marked draft, AFK:deps-failed`

## Terminal verdict

Exactly one of these is the final line printed before exit:

Default mode:

- `pr-watch: PASS — all checks green at attempt <K>`
- `pr-watch: DRAFT — exhausted 10 rounds, marked draft, AFK:checks-failed`
- `pr-watch: ERROR — <reason>`

Bot mode (`--bot`) — the PASS and DRAFT lines name the mode and the shared cap;
the ERROR line is identical in both modes:

- `pr-watch: PASS — all checks green at attempt <K> (bot)`
- `pr-watch: DRAFT — exhausted 3 attempts, marked draft, AFK:deps-failed`
- `pr-watch: ERROR — <reason>`

The afk-pickup caller parses this line verbatim into its §7 output block; the
deps-land lane parses the bot lines the same way.

These exact strings — both labels and all five verdict shapes — are asserted by
`scripts/claude-agent/lib/pr-watch-runbook-check.sh`, which runs in the
`scripts/claude-agent` suite. Editing a line here without editing that check is
the failure it exists to catch.

## Failure modes

- **PR closed/merged mid-watch** — exit `pr-watch: ERROR — pr not open` on the
  next poll. Do not attempt to push.
- **Branch diverged** (concurrent push) — see §5; should not happen under the
  single-VM constraint.
- **Implementer returns flake flag** — round still counts toward the 10-cap.
  Re-poll without a new commit; if checks were truly transient they may green on
  retry.
- **All 10 rounds pass implementer but checks stay red** — §6 fires; PR drafts.
- **Bot PR already at the cap** — §1 finds `MAX_ROUNDS` 0 and goes straight to
  §6 without polling CI; no implementer is spawned.
- **Bot marker history unreadable** — the head sha or the comment read failed;
  §1 exits `pr-watch: ERROR — bot marker history unreadable` before polling CI
  or spawning anyone. There is no fallback budget: a PR whose attempts cannot be
  counted never gets a fresh 3.
- **`gh run view` rate-limited** — fall back to `gh api` direct calls or skip
  log bundle for that round; the implementer still gets issue + diff.

## Boundaries

- Never force-pushes. Never rewrites history. Append-only fix commits. (The sole
  sanctioned force-push in the whole autonomous system is `/pr-reconcile`'s
  rebase phase, and even that is `--force-with-lease` only — pr-watch itself has
  no exception.)
- Never merges the PR. Green CI is the verdict; merge is human-gated.
- Never operates on a PR not on `feat/issue-<N>` — or, with `--bot`, not on
  `dependabot/…` (defense against the caller passing a hand-crafted PR — only
  afk-pickup and deps-land output is supported).
- Never applies `AFK:checks-failed` to a Dependabot PR, and never
  `AFK:deps-failed` to an agent PR. One lane, one label.
- Never spawns reviewer/verifier. The fix-loop is implementer-only; the
  pre-commit review happens during afk-dispatch and the one-time post-PR review
  is `/pr-review` (afk-pickup §6a.1b) — pr-watch itself never reviews.
- Never extends the 10-round cap — nor, in bot mode, the 3-attempt cap it reads
  from the markers. Exhaustion is the signal to escalate to a human, not to
  retry harder.
- Never merges a Dependabot PR either. Bot mode gets the bump to green; the
  gate-and-merge decision belongs to the deps-land lane.
