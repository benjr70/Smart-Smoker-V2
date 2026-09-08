---
name: deps-land
description:
  Take one open Dependabot PR to a terminal state — retitle it, inject the
  Bot-PR checklist, prove it with Tier A (`/pr-watch --bot`) and Tier B
  (`/verify-pr` with the screenshot tour forced), fix it in a bounded loop when
  either tier is red, then run `deps-gate.sh` and hand its approving verdict
  back to the caller to merge, park a major bump with `HITL`, or exhaust into
  `AFK:deps-failed`. Invoked (blocking) by `/afk-pickup` §1.2 when its PR triage
  returns reason `dependabot` (or reason `conflict` on a `dependabot/…` branch).
  Takes the PR number + head sha + the security and major flags.
---

# Deps Land — Autonomous Dependabot Gate-and-Merge Lane

You are the **deps lane** spawned by `/afk-pickup` §1.2 when its PR triage picks
a **Dependabot PR**. One fire = one Bot PR driven to exactly one terminal
outcome: `merged`, `HITL`, `deps-failed` or `superseded`. There is no backing
issue, so there is no issue lock, no ticket comment and no code review: a bump
is judged by evidence (CI + one real-app round), never by reading its diff.

Every run is **fresh and stateless**. The lane's memory is the sha-keyed marker
comments `lib/deps-lane.sh` writes on the PR, so a fire that crashes mid-Tier-B
resumes at the next step instead of redoing the round — and a force-push (a
Dependabot `rebase`/`recreate`, or our own fix commit) invalidates every marker,
because a verdict earned on an older sha says nothing about the code that would
actually merge.

**Step order**, with the PR state re-read before every step: (1) retitle; (2)
inject the Bot-PR checklist; (3) Tier A via `/pr-watch --bot`; (4) Tier B via
`/verify-pr --force-tour`; (5) the gate, then the caller's merge, the `HITL`
hand-off or the `AFK:deps-failed` park. A `CONFLICTING` PR takes §1 instead and
ends the fire there — nothing can be proved about a branch that has to be
rebased first. Any step whose sha-keyed marker matches the current head is
skipped.

This skill assumes:

- `scripts/claude-agent/lib/deps-lane.sh` (retitle / checklist injection /
  marker emit + parse / rounds-left / commit trailer),
  `scripts/claude-agent/lib/deps-gate.sh` (the decision gate) and
  `scripts/claude-agent/lib/rebase-driver.sh` exist — sourceable deep modules.
  Never hand-roll their text transforms, their merge recipe or their git.
- `scripts/verify-pr/bot-pr-checklist.md` is the injected checklist unit.
- The caller took no issue lock (a Bot PR has none) and owns the single merge
  call site: **this skill never merges anything itself.**

## Invocation

```
/deps-land --pr <PR_NUM> --branch <BRANCH> --sha <HEAD_SHA> --reason <dependabot|conflict> \
           [--security <true|false>] [--major <true|false>] [--agent-commits <true|false>]
```

**The arguments differ by reason, because PR Triage emits two different verdict
shapes** (`pr_triage_pick` in `lib/pr-triage.sh`), and a lane that assumed one
shape for both would be dispatched `--sha null` on every conflict:

| reason       | verdict carries                                   | dispatched with                                                                     |
| ------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `dependabot` | `pr`, `branch`, `sha`, `security`, `major`, tiers | `--pr --branch --sha --security --major --reason dependabot`                        |
| `conflict`   | `pr`, `branch`, `agentCommits` — **no sha/flags** | `--pr --branch --sha <read by the caller> --reason conflict --agent-commits <bool>` |

So `--pr`, `--branch`, `--sha` and `--reason` are always present; the caller
reads the head sha itself on the conflict path (afk-pickup §1.2 does one
`gh pr view --json headRefOid`) so §0's liveness rule works identically for both
reasons.

`--security` and `--major` are **required for reason `dependabot` and absent for
reason `conflict`**: a conflict fire ends in §1, before the retitle (the only
reader of `security`) and before the gate (the only reader of `major`), so
neither flag can change what it does. When they are absent the report line
prints `security=n/a major=n/a` — never `null`, and never a guess.

`--agent-commits` is required for reason `conflict` and ignored otherwise; it
picks between the two conflict recipes in §1.

## Process

### 0. Pre-flight

```bash
gh auth status >/dev/null || { echo "deps-land: ERROR — gh not authenticated"; exit 1; }
. scripts/claude-agent/lib/deps-lane.sh
```

**Re-read the PR state before every step.** This is the rule the whole lane
hangs on: a Dependabot PR is a moving target — the bot force-pushes it, the bot
supersedes it with a newer bump and closes this one, a human closes it to reject
the upgrade — and every step below either spends real budget or mutates GitHub.
One cheap read stands between the lane and fixing, verifying or merging a dead
branch:

```bash
STATE=$(gh pr view "$PR" --json state,isDraft,headRefOid,title,body,labels,reviewDecision,mergeable)
```

If `state != OPEN`, the PR is draft-parked, or `headRefOid` no longer equals the
`--sha` this fire was dispatched with (both reasons carry one — see Invocation),
the PR was **closed or superseded** under us: stop immediately with outcome
`superseded` — no label, no comment, nothing mutated beyond the fire's report. A
superseded PR is not a failure and must never be labeled like one; Dependabot
closes its own PRs constantly.

A moved head sha is a special case of the same thing: re-dispatch is the honest
answer, because every marker for the old sha is now worthless. End the fire
`superseded`; the next fire picks the PR up on its new sha with a clean slate.

Read the fix budget once, from the markers, and keep it for §4 and §5:

```bash
MARKERS=$(gh pr view "$PR" --json comments --jq '.comments[].body' \
    | deps_lane_marker_parse "$SHA")     # {"sha","tierA","tierB","fixAttempts","capReached"}
ATTEMPTS=$(printf '%s' "$MARKERS" | jq -r '.fixAttempts')
```

The cap is **3 attempts** in total — across Tier A and Tier B, and across every
fire this PR ever gets. It is counted from the markers, never from a variable in
this fire, so a crash cannot refund an attempt.

### 1. Conflict path (`--reason conflict` only)

A `CONFLICTING` Bot PR cannot be verified: whatever the tiers prove is about a
merge base that no longer exists. Fix the branch, then end the fire — the next
fire re-picks the PR on its new sha and runs the tiers.

- **`--agent-commits false`** (the branch carries only Dependabot's own
  commits): post `@dependabot rebase` and stop. Dependabot owns its branch;
  nudging it is cheaper and safer than rebasing it ourselves, and it keeps the
  bot able to update the PR afterwards.

  ```bash
  gh pr comment "$PR" --body "@dependabot rebase"
  ```

- **`--agent-commits true`** (this lane has already pushed fix commits): the
  nudge would be refused — Dependabot abandons a branch carrying foreign commits
  — so drive the rebase ourselves with the same deep module `/pr-reconcile`
  uses:

  ```bash
  . scripts/claude-agent/lib/rebase-driver.sh
  VERDICT=$(rebase_onto "$BRANCH")      # CLEAN | CONFLICT | ERROR
  ```

  `CLEAN` → `rebase_push "$BRANCH"` (the only sanctioned force site). `CONFLICT`
  on a dependency bump is a lockfile conflict: spawn one implementer to
  regenerate it with this repo's recipe
  (`npm install --legacy-peer-deps --package-lock-only --ignore-scripts`),
  staged but not committed, exactly as pr-reconcile §1 does. `ERROR`, an
  unresolvable conflict or a rejected lease → `rebase_abort` and end the fire
  `deps-failed` per §6.

Either way the fire ends here with `tierA=skipped tierB=skipped`.

### 2. Retitle (once, idempotent)

Runs first so PR Title Lint re-runs and is green by the time the gate reads it.
A security bump must land as `fix(deps):` — that is what makes release-please
cut a patch release whose changelog says a vulnerability was fixed:

```bash
NEW_TITLE=$(deps_lane_retitle "$TITLE" "$SECURITY")
[ "$NEW_TITLE" = "$TITLE" ] || gh pr edit "$PR" --title "$NEW_TITLE"
```

The lib owns the rule (only the exact `chore(deps):` prefix is promoted;
Dependabot's remaining text is carried through byte-for-byte). Never retype the
transform, and never edit the title on a non-security bump.

### 3. Inject the Bot-PR checklist

Tier B verifies the boxes in the PR body, so the body must carry them:

```bash
NEW_BODY=$(printf '%s' "$BODY" \
    | deps_lane_inject_checklist scripts/verify-pr/bot-pr-checklist.md)
[ "$NEW_BODY" = "$BODY" ] || gh pr edit "$PR" --body "$NEW_BODY"
```

Injection is a **no-op when the `<!-- bot-pr-checklist v1 -->` marker is already
present**, so ticked boxes survive a re-round. When Dependabot regenerates the
body the section disappears and is re-appended unticked — which is exactly
right: a regenerated body means a new push, so everything is re-verified anyway.

### 4. Tier A — CI green (`/pr-watch --bot`)

Re-read the PR (§0). If the markers already carry `tierA=green` for this sha,
**skip this step** — a prior fire proved it and nothing has moved since.

Otherwise spawn `/pr-watch` via the `Agent` tool (`general-purpose`, `opus`,
`run_in_background: false` — blocking; never emit output while it is in flight):

`"Invoke the /pr-watch skill with --pr <PR> --branch <BRANCH> --repo benjr70/Smart-Smoker-V2 --issue none --bot."`

Bot mode reads the same markers, so its fix budget is the shared cap, its fix
commits carry the `[dependabot skip]` trailer, and its exhaustion label is
`AFK:deps-failed`. Consume its terminal line verbatim:

- `pr-watch: PASS — all checks green at attempt <K> (bot)` → **re-read the head
  sha before recording anything.** pr-watch may have pushed fix commits, and the
  sha it drove to green is then not the `--sha` this fire started with; a marker
  keyed to the old sha would vouch for code that no longer exists and the gate
  would (correctly) refuse it `markers-stale`, leaving the passing sha with no
  marker at all and the tier redone forever:

  ```bash
  GREEN_SHA=$(gh pr view "$PR" --json headRefOid -q .headRefOid)
  gh pr comment "$PR" --body "$(deps_lane_marker_emit tierA "$GREEN_SHA")"
  ```

  The marker always names the sha CI actually passed on — which is the current
  head, because pr-watch polls its own pushes to green before returning PASS.

  `tierA` is `green` when `K` was the first attempt and `fixed(k)` when pr-watch
  pushed `k` fixes (`k` = the attempts it added). When `GREEN_SHA` differs from
  `$SHA` the PR moved under this fire: end it here with `tierB=skipped` (§0's
  rule), and the next fire re-dispatches on the new sha, skips Tier A on the
  marker just written, and runs Tier B. When it is unchanged, continue to Tier B
  in this fire.

- `pr-watch: DRAFT — exhausted 3 attempts, marked draft, AFK:deps-failed` → the
  budget is gone and pr-watch has already parked the PR. End the fire
  `deps-failed` (§6) with `tierA=failed`; do not re-label, do not re-draft.
- `pr-watch: ERROR — <reason>` → end the fire `ERROR`, touch nothing.

### 5. Tier B — one real-app round (`/verify-pr --force-tour`)

Re-read the PR (§0). If the markers already carry `tierB=PASS` for this sha,
skip this step.

Otherwise spawn one blocking `/verify-pr` round the same way:

`"Invoke the /verify-pr skill with <PR> --force-tour, repo benjr70/Smart-Smoker-V2."`

`--force-tour` is mandatory here. A dependency bump is usually a lockfile-only
diff, which the UI-change detector reads as "no UI change" — and a bump whose
whole risk is that it breaks pixels or a native dep would then be landed with no
pixels captured. Forced, the round captures the fixed six-shot tour on every Bot
PR (`smoker-01-smoke-screen`, `smoker-02-smoking-live`,
`frontend-01-smoke-live`, `frontend-02-history`, `frontend-03-review`,
`frontend-04-settings`), so a human can diff them by eye from one bump to the
next.

Read the round's terminal `manual-verify:` line. **A Bot PR round passes only at
`6/6 PASS, 0 deferred, 0 FAIL`**: any FAIL, and equally `deferred > 0`, is a
Tier B failure. A deferral is how a round says "I could not check this", and on
a bump nobody is going to check it later — a round must not pass by skipping.

- PASS → record the marker (`deps_lane_marker_emit tierB "$SHA"`) and go to §6.
- FAIL / deferrals → the **same fix loop and the same counter as Tier A**. Check
  the budget first (`deps_lane_rounds_left "$ATTEMPTS"`); at 0, end the fire
  `deps-failed` per §6. Otherwise spawn one implementer with the failing and
  deferred items' text verbatim as the brief, commit through
  `deps_lane_commit_trailer` (so the message ends `[dependabot skip]` and
  Dependabot leaves the branch alone), push, and record one attempt:

  ```bash
  gh pr comment "$PR" --body "$(deps_lane_marker_emit fix-attempt "$SHA" "$N")"
  ```

  The push moves the head sha, so the fire ends there: the next fire re-verifies
  both tiers on the new sha. That is the point of sha-keyed markers.

- `manual-verify: infra-error …` (the stack never booted — zero items acted on)
  is **not** a Tier B failure and must not consume an attempt: end the fire
  `ERROR`, and the next fire retries the round.

### 6. Gate, then merge / hand off / park

Re-read the PR (§0) one last time, then run the gate — it decides and never
mutates:

```bash
GATE=$(scripts/claude-agent/lib/deps-gate.sh --pr "$PR" --head "$SHA" \
    --major "$MAJOR" --security "$SECURITY" --repo benjr70/Smart-Smoker-V2 2>&1 >/tmp/deps-gate.json)
GATE_RC=$?
GATE_JSON=$(cat /tmp/deps-gate.json)
```

**Approved (exit 0).** The lane does **not** merge. It **prints** the gate's
merge command and lets **afk-pickup §1.2 run it, at the same call site the
docs-merge gate uses** — one place in the harness can land a commit on master,
and that place is reviewable in the caller's skill, not here.

The lane runs in its own agent, so the caller sees only this stdout. The command
therefore has an exact, parseable shape: **one line, starting `merge-cmd: `,
carrying `.mergeCmd` byte-for-byte**, emitted directly after the `APPROVED`
terminal line:

```bash
printf 'merge-cmd: %s\n' "$(printf '%s' "$GATE_JSON" | jq -r '.mergeCmd')"
```

Never retype, reformat or line-wrap it, and never emit a `merge-cmd:` line on
any other verdict — that line is the merge trigger.

**Major bump (`.reason == major-unapproved`).** After Tier A green and Tier B
PASS a major is never merged on machine evidence: hand it to the maintainer.

```bash
gh pr edit "$PR" --add-label HITL
gh pr comment "$PR" --body "$HANDOFF"
```

`$HANDOFF` carries, in this order: the bump summary (dependency, from → to, read
from Dependabot's first commit message), both tier verdicts, a pointer to the
screenshot tour in the PR description, and this sentence verbatim:

> Approve this PR (GitHub review) to let the daemon land it; close to reject.

That sentence is the entire re-entry protocol, and it is deliberately a native
GitHub action: no custom command vocabulary, approvable from a phone. A later
fire's triage sees the `HITL` label with `reviewDecision == APPROVED`, re-enters
this lane, re-gates the **same sha** and merges. `Request changes` and a close
both leave the PR alone — the human's decision stands.

**Exhausted.** When either tier ran out of the 3 attempts, park the PR for good:

```bash
gh pr ready "$PR" --undo                       # draft — this is what stops re-picks
gh pr edit "$PR" --add-label AFK:deps-failed
gh pr comment "$PR" --body "deps-land: verify/fix loop exhausted after 3 attempts. Last failure: <verbatim>. Human triage required."
```

The draft flip is the load-bearing half: PR Triage skips drafts, so a labeled
but non-draft PR would be re-picked every fire forever.

**Any other refusal** (`checks-not-green`, `checks-missing`, `markers-stale`,
`title-not-deps`, `changes-requested`, `checks-unreadable`, `usage`) ends the
fire with no mutation and `outcome=refused:<reason>`. `checks-unreadable` and
`usage` say nothing about the PR at all — they mean the gate could not run, and
a recurring one is a harness bug to file, never a bump to triage.

## Output format

One block per fire, written to stdout:

```
=== /deps-land PR #<PR_NUM> <ISO-8601> ===
deps: PR #<N> "<title>" — security=<y/n> major=<y/n> tierA=<green|fixed(k)|failed> tierB=<6/6|k/6|skipped> outcome=<merged sha|HITL|deps-failed|superseded>
pr-watch: <verbatim terminal line>          (when §4 ran)
verify:   <verbatim manual-verify line>     (when §5 ran)
gate:     approved | REFUSED — <reason> | ERROR — <reason>
result:   <terminal line, below>
```

The `deps:` line is the one the caller copies into its §7 report. On a conflict
fire `security` and `major` were never dispatched, so both print `n/a`. `tierA`
and `tierB` are `skipped` when a marker for this sha made the step a no-op or
the fire ended before it; `outcome` is the fire's terminal state, and on the
merge path the caller rewrites it to `merged <sha>` after its merge command
succeeds (the lane cannot know: it does not merge).

Terminal lines, parsed verbatim by the caller:

- `deps-land: APPROVED — PR #<N> ready to merge at <sha>`, immediately followed
  by one `merge-cmd: <gate .mergeCmd verbatim>` line, which the caller runs
- `deps-land: HITL — major bump handed to the maintainer at <sha>`
- `deps-land: DEPS-FAILED — <last failure>`
- `deps-land: SUPERSEDED — PR #<N> is closed, drafted or has moved past <sha>`
- `deps-land: REBASE-NUDGED — @dependabot rebase posted` /
  `deps-land: REBASED — pushed <sha>`
- `deps-land: REFUSED — <gate reason>`
- `deps-land: ERROR — <reason>`

A fire that ran Tier A MUST carry the verbatim `pr-watch:` line, and one that
ran Tier B the verbatim `verify:` line, before any result is emitted;
`(in flight)` is never a legal value for either.

## Failure modes

- **PR closed or superseded mid-fire** — every step re-reads state, so the lane
  stops at the next boundary with `SUPERSEDED`. No label, no comment: Dependabot
  supersedes its own PRs routinely and a parked label would outlive the PR.
- **Head sha moved** — same treatment. Markers are sha-keyed; the next fire
  re-verifies from scratch on the new head.
- **Fix loop exhausted** — draft + `AFK:deps-failed` + a comment naming the last
  failure. Triage skips drafts and that label, so the PR is never re-picked.
- **Major bump approved, then force-pushed** — the re-entry fire re-gates the
  new sha, finds the markers stale, and re-runs both tiers before merging. An
  approval never vouches for code the maintainer did not see.
- **Dependabot refuses to update the branch** — expected once this lane has
  pushed a fix commit; that is why fix commits carry `[dependabot skip]` and why
  the conflict path switches to the rebase driver when `agentCommits` is true.
- **Gate approves but the merge fails** — the caller's `--match-head-commit`
  refused because the branch moved between gate and merge. Correct behaviour:
  nothing unverified lands, and the next fire re-verifies the new sha.

## Boundaries

- **Never merges.** The gate decides, the caller merges. No code path here runs
  `gh pr merge`.
- Never merges — or asks the caller to merge — a major bump without an
  `APPROVED` review; the gate refuses it and §6 hands it off instead.
- Never applies `AFK:checks-failed` (the agent lane's label) to a Bot PR, and
  never applies `AFK:deps-failed` to anything else.
- Never reviews the bump's diff or opens threads on a Bot PR: evidence only.
- Never operates on a PR whose head branch is not `dependabot/…` — §0's gate
  contract (`not-dependabot`) is the backstop, but refuse before spending
  anything.
- Never extends the 3-attempt cap, and never counts attempts from anywhere but
  the markers.
- `git push --force-with-lease` is permitted only in §1's rebase path, via the
  rebase driver; everywhere else pushes are append-only.
- One Bot PR per fire; the daemon's budget gate paces successive fires, so
  Dependabot can never starve feature work.
