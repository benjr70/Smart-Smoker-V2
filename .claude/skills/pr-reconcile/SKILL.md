---
name: pr-reconcile
description:
  Bring one open agent-team PR back to a mergeable, review-clean state — rebase
  it over master when it conflicts, fix the review comments a human handed back
  via the `team:revise` label (replying in-thread with what changed and
  resolving each thread), then re-run the full CI + manual verification tail.
  Invoked (blocking) by `/team-pickup` §1.2 when its PR triage picks a PR
  needing attention. Takes the PR number + branch + issue number + reason.
---

# PR Reconcile — Autonomous PR Feedback + Conflict Fixer

You are the **reconciler** spawned by `/team-pickup` when an already-open agent
PR needs attention: master moved under it (merge conflict) and/or a human
reviewed it and handed it back with the `team:revise` label. One fire = one PR
brought back to green — rebased, comments addressed with in-thread replies, CI
re-watched, manual verification re-run — or escalated with a parked label.

Every run is **fresh and stateless**: context is reconstructed from the issue
body, the PR diff, and the review threads. No session is ever resumed.

This skill assumes:

- The PR was opened by team-pickup on `feat/issue-<N>` against `master`.
- `scripts/claude-agent/lib/rebase-driver.sh`, `lib/thread-reconciler.sh` exist
  (sourceable deep modules — do not hand-roll their git/GraphQL).
- The caller (team-pickup §1.2) already flipped the backing issue
  `team:done → team:in-progress` as the single-flight lock and will restore it;
  this skill never touches that lock itself.

## Invocation

```
/pr-reconcile --pr <PR_NUM> --branch <BRANCH> --issue <ISSUE_N> --reason <revise|conflict|both>
```

All four arguments required, supplied verbatim from team-pickup's triage verdict
(`reason` is the triage pick reason; when the PR both conflicts and carries
`team:revise`, the caller passes `both`).

## Process

### 0. Pre-flight

```bash
gh auth status >/dev/null || { echo "pr-reconcile: ERROR — gh not authenticated"; exit 1; }
gh pr view "$PR_NUM" --json state,isDraft,headRefName,mergeable,labels \
  | jq -e --arg br "$BRANCH" '.state == "OPEN" and (.isDraft | not) and .headRefName == $br' >/dev/null \
  || { echo "pr-reconcile: ERROR — PR #$PR_NUM not open on $BRANCH (or draft)"; exit 1; }
```

Record from that view: `MERGEABLE` (the current mergeable state — re-read it
here, triage's snapshot may be stale) and whether `team:revise` is present.
`mergeable == UNKNOWN` at this point: poll `gh pr view --json mergeable` every
20s up to 3 minutes for GitHub to finish computing; still UNKNOWN → treat as not
conflicting (the comment phase can still run).

Check out the branch fresh:

```bash
git fetch origin
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"   # local state = exactly what the PR shows
```

### 1. Rebase phase (runs first, only when CONFLICTING)

Ordering is deliberate: land on a clean, mergeable base **before** touching
review comments, so comment fixes are written against post-rebase code and the
final CI run covers everything.

Source the Rebase Driver and attempt the rebase — **cap: 1 rebase attempt per
fire**:

```bash
. scripts/claude-agent/lib/rebase-driver.sh
VERDICT=$(rebase_onto "$BRANCH")          # {"status":"CLEAN"|"CONFLICT","files":[...]}
```

- **CLEAN** → push and continue to §2:

  ```bash
  rebase_push "$BRANCH"                    # --force-with-lease, the ONLY sanctioned force site
  ```

- **CONFLICT** → spawn one **implementer** (blocking,
  `subagent_type: implementer`, `model: opus`) to resolve **in place**. Prompt
  embeds: the issue title + body, the conflicted file list from the verdict, and
  these instructions verbatim:

  > A rebase of `<BRANCH>` onto `origin/master` stopped on conflicts in the
  > files listed. Resolve each conflict so the branch's intent AND master's
  > changes both survive. Edit the files to remove all conflict markers, then
  > `git add` each resolved file. Do NOT run `git rebase --continue`, do NOT
  > commit, do NOT push — the wrapper drives the rebase. Reply with a short
  > summary per file when everything is staged.

  Then drive the rebase to completion — a multi-commit rebase may stop more than
  once; each stop gets the same implementer treatment:

  ```bash
  VERDICT=$(rebase_continue)               # repeat resolve→continue per CONFLICT stop
  ```

  When CLEAN → `rebase_push "$BRANCH"`.

- **Escalation** — on ANY of: `rebase_onto`/`rebase_continue` returns ERROR, the
  implementer cannot produce a resolution, or `rebase_push` returns REJECTED
  (the lease refused — someone pushed to the branch after our fetch; never retry
  harder):

  ```bash
  rebase_abort                             # leave the branch exactly as the PR shows
  gh pr edit "$PR_NUM" --add-label team:rebase-failed
  gh pr comment "$PR_NUM" --body "pr-reconcile: automatic rebase onto master failed at $(date -Iseconds) — <reason: conflicts unresolvable | lease rejected (branch moved) | rebase error>. Human rebase required."
  ```

  Report `pr-reconcile: REBASE-FAILED — <reason>` and stop (skip §2–§3; a
  conflicted PR cannot land anyway). The caller restores the issue lock.

If the PR is not CONFLICTING, skip this phase entirely.

### 2. Comment phase (only when `team:revise` is present)

The human reviewed and explicitly handed the PR back. Work every unresolved
review thread; **cap: 3 implementer rounds per fire**.

```bash
. scripts/claude-agent/lib/thread-reconciler.sh
THREADS=$(tr_unresolved_threads "benjr70/Smart-Smoker-V2" "$PR_NUM")
# [ {threadId, path, line, commentDatabaseId, body}, ... ]
```

No unresolved threads → the label was applied without open threads; treat the PR
body / review summary comments as the feedback source only if they contain
explicit change requests, otherwise just drop the label (§2-exit) and continue.

Round loop (`R` starts at 1, cap `REVISE_ROUNDS_MAX=3`):

1. **Spawn one implementer per round** (blocking, `subagent_type: implementer`,
   `model: opus`) covering ALL currently-unresolved threads. Prompt embeds: the
   issue title + body, the current PR diff (`git diff origin/master...HEAD`,
   capped at 2000 lines as in pr-watch §3), and every thread verbatim —
   `threadId`, `path:line`, and comment body — plus these instructions verbatim:

   > Address each review comment by changing the shipped code accordingly. Stage
   > the changes (`git add`). Do NOT commit and do NOT push — the wrapper
   > handles that. Reply with one line per thread:
   > `<threadId>: <what you changed>` — or, if you believe a comment is wrong or
   > must not be applied, `<threadId>: revise-dispute — <one-line reason>` and
   > stage nothing for it.

2. **Commit + push** (append-only; the rebase already happened, so plain push):

   ```bash
   git commit -m "fix(review): round $R — address review comments on PR #$PR_NUM"
   git push origin "$BRANCH"                # plain push — never force here
   SHA=$(git rev-parse --short HEAD)
   ```

3. **Reply + resolve per addressed thread** — the reply lands in-thread on the
   reviewer's comment and states concretely what changed:

   ```bash
   tr_reply "benjr70/Smart-Smoker-V2" "$PR_NUM" "<commentDatabaseId>" "fixed in $SHA: <implementer's one-line summary for this thread>"
   tr_resolve "<threadId>"
   ```

   Disputed / unaddressed threads are NOT replied to or resolved this round —
   they carry to the next round (a dispute counts as unaddressed).

4. Re-enumerate. All threads resolved → **§2-exit**. Threads remain and
   `R == REVISE_ROUNDS_MAX` (or every remaining thread is disputed) →
   **escalate**:

   ```bash
   # One reply per still-open thread, then park the PR for a human:
   tr_reply ... "pr-reconcile: could not auto-resolve after $REVISE_ROUNDS_MAX attempts — human triage."
   gh pr edit "$PR_NUM" --add-label team:revise-failed --remove-label team:revise
   gh pr comment "$PR_NUM" --body "pr-reconcile: <k> review thread(s) could not be auto-resolved after $REVISE_ROUNDS_MAX round(s) at $(date -Iseconds). Labeled team:revise-failed for human triage."
   ```

   Report `pr-reconcile: REVISE-FAILED — <k> thread(s) unresolved` and stop
   (skip §3 — the PR is parked; verification runs after the human weighs in).

**§2-exit** (all threads addressed):

```bash
gh pr edit "$PR_NUM" --remove-label team:revise
```

The label drop is what stops the daemon re-picking this PR next fire; the human
re-applies `team:revise` (and re-opens threads) if a fix missed.

### 3. Verification tail (always, when §1/§2 pushed anything)

Any push (rebase or comment fix) re-ran CI and staled ALL previous evidence —
per the locked design, **all verification re-runs**. Execute team-pickup's
success tail against this PR, with one modification:

- **§6a.1 pr-watch** (blocking, fresh 10-round budget) — spawn exactly as
  team-pickup §6a.1 specifies, with this PR's number/branch/issue.
- **§6a.2 manual verification** (blocking) — spawn the verifier exactly as
  team-pickup §6a.2 specifies, EXCEPT instruct it to **re-verify every item,
  including ones already ticked `- [x]`** (the rebase/fixes may have changed
  anything; existing ticks are stale). Evidence comment headed
  `### Manual verification — post-reconcile round <M>/3`.
- **§6a.3 manual fix loop** — identical semantics, `MANUAL_ROUNDS_MAX=3`,
  exhaustion → draft + `team:checks-failed` + issue comment.

The same blocking rules apply verbatim: never emit output while pr-watch or the
verifier is in flight; `pr-watch: (in flight)` is never a legal value.

If neither §1 nor §2 pushed a commit (e.g. `team:revise` with zero actionable
threads), skip the tail — nothing changed, existing evidence stands.

## Output format

One block per fire, written to stdout:

```
=== /pr-reconcile PR #<PR_NUM> <ISO-8601> ===
reason:    revise | conflict | both
rebase:    CLEAN — pushed | SKIPPED | FAILED — <detail>
comments:  <k> thread(s) addressed in <R> round(s) | SKIPPED | FAILED — <n> unresolved
pr-watch:  <verbatim terminal line>            (when §3 ran)
verify:    <verbatim manual-verify line> — post-reconcile   (when §3 ran and pr-watch PASS)
result:    PASS | REBASE-FAILED | REVISE-FAILED | DRAFT | ERROR — <detail>
```

The final `result:` line doubles as the terminal verdict the caller parses:

- `pr-reconcile: PASS — rebased and/or <k> comment(s) addressed, checks green, manual verify clean`
- `pr-reconcile: REBASE-FAILED — <reason>`
- `pr-reconcile: REVISE-FAILED — <k> thread(s) unresolved`
- `pr-reconcile: DRAFT — verification tail exhausted, marked draft, team:checks-failed`
- `pr-reconcile: ERROR — <reason>`

The hard validity rule from team-pickup §7 applies: when §3 ran, the block MUST
carry the verbatim `pr-watch:` terminal line (and `verify:` on PASS) before the
result is emitted.

## Failure modes

- **Lease push rejected** — someone (human) pushed to the PR branch between our
  fetch and push. Never force through it: abort, `team:rebase-failed`, park.
  Their work is untouched — that is the point of the lease.
- **Implementer disputes a review comment** — the loop never argues with a
  human's review by force; the thread stays open, and if disputes are all that
  remain, the PR parks as `team:revise-failed` with in-thread explanations.
- **`team:revise` applied but no unresolved threads** — drop the label; there is
  nothing machine-actionable. The human should leave inline review comments (not
  just a top-level comment) to hand work back.
- **PR turns draft / closes mid-reconcile** — stop at the next step boundary,
  report `pr-reconcile: ERROR — pr no longer open`, touch nothing further.
- **Verification tail exhausts** — same escalation as team-pickup: draft +
  `team:checks-failed`; report DRAFT. The reconcile's own labels are NOT applied
  (the tail failing is a checks problem, not a revise/rebase problem).
- **Crash mid-fire** — the caller's
  `picked:   reconcile PR #<PR_NUM> (issue #<N>)` log line lets agent-run's
  crash cleanup restore the issue lock (`team:in-progress` cleared, `team:done`
  restored).

## Boundaries

- `git push --force-with-lease` is permitted **only** in §1 to publish a
  conflict rebase — never in §2, never in the verification tail, never plain
  `--force` anywhere. Everything else is append-only plain push.
- Never merges the PR. Green + resolved threads is the verdict; merge stays
  human-gated.
- Never edits the PR's acceptance criteria, the issue body, or a reviewer's
  comments. Replies are additive.
- Never resolves a thread it did not just address with a pushed commit.
- Never operates on a PR whose head is not `feat/issue-<N>` (§0 enforces).
- Never touches the `team:in-progress`/`team:done` lock — the caller owns it.
- One PR per fire; the daemon's budget gate paces successive fires.
