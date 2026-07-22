---
name: pr-review
description:
  Run the one-time autonomous code review of a freshly green agent PR — a
  correctness pass (built-in /code-review at medium effort) plus a spec pass
  (diff vs. the issue's Acceptance Criteria and parent PRD), findings posted as
  marked inline review comments, then the `team:revise` label applied so the
  next daemon fire's `/pr-reconcile` loop fixes the threads, plus a done-marker
  comment. Invoked (blocking) by `/team-pickup` §6a.1b after pr-watch PASS.
  Takes the PR number + branch + issue number as arguments.
---

# PR Review — Autonomous Two-Axis Reviewer, Fixes via the Reconcile Loop

You are the **post-PR reviewer** spawned by `/team-pickup` after CI first goes
green. One fire = one PR = **once in that PR's life**. You review the whole diff
on two axes, post findings as marked inline review threads, apply `team:revise`
so the daemon's next fire routes the PR into `/pr-reconcile`'s proven
fix-reply-resolve loop, and return a single terminal verdict line that the
caller pastes into its output block.

The reviewer **never fixes its own findings** — separation is structural: this
skill only writes review comments and one label; `/pr-reconcile` §2 owns every
fix, in-thread reply, and thread resolution. The review is best-effort: it never
drafts the PR, and merge remains human-gated regardless of the outcome.

This skill assumes:

- The PR is already open on `feat/issue-<N>` against `master` and CI is green
  (the caller runs it only after `pr-watch: PASS`).
- `scripts/claude-agent/lib/thread-reconciler.sh` and
  `scripts/claude-agent/lib/review-poster.sh` exist — sourceable deep modules.
  Never hand-roll their GraphQL/REST calls or marker strings.
- The `team:revise` label exists (created by `/team-dispatch` §0).
- The caller checks the done-marker before spawning; §0 re-checks anyway
  (defense in depth).

## Invocation

```
/pr-review --pr <PR_NUM> --branch <BRANCH> --issue <ISSUE_N>
```

All three arguments required. Repo is fixed to `benjr70/Smart-Smoker-V2` (export
`REPO="benjr70/Smart-Smoker-V2"` for the snippets below). The caller
(team-pickup §6a.1b) supplies the arguments verbatim from its PR-create step;
`BRANCH` must be `feat/issue-<ISSUE_N>`.

## Process

### 0. Pre-flight + idempotency gate

```bash
gh auth status >/dev/null || { echo "pr-review: ERROR — gh not authenticated"; exit 1; }
gh pr view "$PR_NUM" --repo "$REPO" --json number,headRefName,state \
  | jq -e --arg br "$BRANCH" '.headRefName == $br and .state == "OPEN"' >/dev/null \
  || { echo "pr-review: ERROR — PR #$PR_NUM not open on $BRANCH"; exit 1; }

. scripts/claude-agent/lib/review-poster.sh
if rp_done_marker_present "$REPO" "$PR_NUM"; then
  echo "pr-review: SKIPPED — already reviewed (done-marker present)"
  exit 0
fi

git fetch origin
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
REVIEWED_SHA=$(git rev-parse HEAD)
```

### 1. Gather context

1. **Issue** — `gh issue view "$ISSUE_N" --repo "$REPO" --json title,body`.
2. **Acceptance Criteria block** — everything between a heading matching
   `^## *Acceptance [Cc]riteria` and the next `^## ` heading (or end of body);
   the same extraction team-pickup §6a uses. Absent → note "(none found)".
3. **Parent PRD** — the first `#<digits>` reference inside the issue body's
   `## Parent PRD` section (the `/prd-to-issues` convention). If found,
   `gh issue view <PRD_N> --repo "$REPO" --json title,body`. No section →
   proceed AC-only and say so in the spec-axis prompt.
4. **Diff** — `git diff origin/master...HEAD`, capped at 2000 lines; if longer,
   truncate with a `... [truncated]` marker (pr-watch §3 convention).

### 2. Round 1 — dual-axis review (parallel subagents)

Spawn **both** wrappers in a single message so they run concurrently. Each:
`subagent_type: general-purpose`, `model: opus`, `run_in_background: false`
(blocking — wait for both before §3).

Both must return findings in the same contract — a fenced block, one JSON object
per line, between sentinels, then a terminal count line:

```
PR_REVIEW_FINDINGS_BEGIN
{"axis":"<correctness|spec>","category":"<slug>","path":"<repo-relative path>","line":<int>,"severity":"high|medium|low","summary":"<one line>","failure_scenario":"<what concretely goes wrong if shipped as-is>"}
PR_REVIEW_FINDINGS_END
<axis>-review: <k> finding(s)
```

**Correctness axis** — prompt:

> You are the CORRECTNESS-AXIS reviewer for PR #\<PR_NUM> (branch \<BRANCH>,
> repo benjr70/Smart-Smoker-V2). Check out the branch, then invoke the built-in
> `/code-review` skill at **medium** effort against the branch diff vs
> `origin/master`. Do NOT pass `--comment` and do NOT pass `--fix`. When it
> completes, restate every finding it produced — nothing added, nothing dropped
> — in the JSON contract below, with `"axis":"correctness"` and `category` one
> of `bug|logic-error|data-loss|race|error-handling|security`. Cite only
> path+line pairs that appear in the diff (right-hand side). Then the sentinel
> block and the terminal line `correctness-review: <k> finding(s)`.

Treat `/code-review`'s native output as opaque; the wrapper's only job beyond
invoking it is faithful translation into the contract.

**Spec axis** — the orchestrator embeds everything from §1 (the subagent makes
no `gh` calls). Prompt:

> You are the SPEC-AXIS reviewer for PR #\<PR_NUM> (branch feat/issue-\<N>).
> Your only question: does this diff faithfully implement what was asked —
> nothing missing, nothing extra, nothing that contradicts the spec?
>
> ## Originating issue #\<N>: \<title>
>
> \<issue body>
>
> ## Acceptance Criteria (extracted)
>
> \<AC block, or "(none found — judge against the issue body and PRD)">
>
> ## Parent PRD issue #\<P>: \<title>
>
> \<PRD body, or "(no Parent PRD section in the issue — judge against the issue
> alone)">
>
> ## The diff under review (origin/master...HEAD, capped 2000 lines)
>
> \<diff>
>
> Check three things, and ONLY these three:
>
> 1. MISSING REQUIREMENT — an Acceptance Criterion (or an explicit PRD
>    requirement this issue's slice owns) with no corresponding implementation
>    in the diff. Anchor the finding to the changed file + diff line where the
>    implementation should live (the closest hunk in the most relevant file).
> 2. SCOPE CREEP — a substantive change not traceable to the issue, its AC, or
>    the PRD (drive-by refactors, new endpoints/config/deps nobody asked for).
>    Anchor to the offending added line.
> 3. SPEC MISMATCH — code that implements a requirement wrongly (wrong
>    threshold, wrong event name, inverted condition, wrong default — anything
>    that contradicts the written spec). Anchor to the offending line.
>
> Do NOT report style, bugs unrelated to the spec, or test-coverage opinions —
> the correctness axis owns those. Report only findings you are confident about;
> this is a medium-depth review, not a fishing trip.
>
> Anchoring rule: every path+line you cite MUST be a line visible in the diff
> above (an added or context line, right-hand side). Never invent line numbers.
>
> Output the sentinel block in the JSON contract with `"axis":"spec"` and
> `category` one of `missing-requirement|scope-creep|spec-mismatch`, then the
> terminal line `spec-review: <k> finding(s)`. Zero findings → an empty block
> and `spec-review: 0 findings`.

### 3. Merge, dedupe, post inline

1. Parse each reply: only lines between `PR_REVIEW_FINDINGS_BEGIN` and
   `PR_REVIEW_FINDINGS_END`; a malformed line is dropped with a logged warning,
   never a crash.
2. Merge both arrays. **Dedupe**: exact `path:line` collision → one comment
   whose body carries both findings (correctness first); near-dup (same `path`,
   lines within 3, substantially the same summary) → keep the higher-severity
   one. Bias toward fewer comments — this is a medium-depth review. Cap at 10
   posted comments; if more survive, post the 10 highest-severity and list the
   rest in the §7 done-marker comment (never silently drop).
3. **Zero findings** →
   `rp_post_done_marker "$REPO" "$PR_NUM" 0 0 "$REVIEWED_SHA" none`, print
   `pr-review: PASS — 0 findings`, exit 0.
4. **Duplicate guard** (a retried review after a partial post must not re-post):
   enumerate any already-open agent threads and drop findings that already have
   one at the same `path` within 3 lines:

```bash
. scripts/claude-agent/lib/thread-reconciler.sh
EXISTING=$(tr_unresolved_threads "$REPO" "$PR_NUM" | rp_filter_agent_threads)
# skip a finding when EXISTING holds a thread with the same .path and |line diff| <= 3
```

5. Post each surviving finding:

```bash
BODY=$(rp_render_finding "$axis" "$category" "$severity" "$summary" "$failure_scenario")
rp_post_inline "$REPO" "$PR_NUM" "$REVIEWED_SHA" "$path" "$line" "$BODY"
```

On a 422 (line not commentable despite the anchoring rule): retry once at the
first added line of that file's first hunk; if that also fails, fold the finding
into the §5 done-marker comment under a `Could not anchor:` list — it is
reported but produces no thread.

### 4. Hand the fixes to the reconcile loop (`team:revise`)

The skill does NOT fix its own findings. Posting them created unresolved review
threads; the proven fixer for unresolved threads is `/pr-reconcile` §2 (the same
machinery that handles a human hand-back). Route the PR into it:

```bash
gh pr edit "$PR_NUM" --repo "$REPO" --add-label team:revise
```

The daemon's next fire (its work probe wakes early on a reconcile candidate)
picks the PR via team-pickup §1.2 → `/pr-reconcile`, whose comment loop spawns
the implementer, commits `fix(review):` rounds, replies in-thread
`fixed in <sha>: …`, resolves each addressed thread, drops the label, and
re-runs the full CI + manual verification tail. Disputes and exhaustion follow
pr-reconcile's existing escalation (`team:revise-failed`, parked for a human).

### 5. Done-marker + terminal verdict

```bash
rp_post_done_marker "$REPO" "$PR_NUM" "$N_FINDINGS" 0 "$REVIEWED_SHA" none
```

(`N_FINDINGS` = findings posted in §3; the fixed-count is always 0 here — fixes
happen later in the reconcile loop. Append any `Could not anchor:` / over-cap
findings from §3 to this comment's body. The marker must be posted AFTER the
label so a crash between the two leaves the review retryable, not half-done.)

Print exactly one terminal line:

- `pr-review: PASS — 0 findings`
- `pr-review: DONE — <N> findings posted, team:revise applied`
- `pr-review: SKIPPED — already reviewed (done-marker present)`
- `pr-review: ERROR — <reason>`

The team-pickup caller parses this line verbatim into its output block and
routes on it: `team:revise applied` means the fixes (and the re-verification
they stale) belong to the NEXT fire's reconcile — the current fire skips manual
verification and exits.

## Failure modes

- **PR closed/merged mid-review** — stop, `pr-review: ERROR — pr not open`.
- **Inline post 422** — two-stage fallback per §3 step 5; the finding still
  surfaces in the done-marker comment.
- **Crash after posting comments but before the label/marker** — the done-marker
  is absent, so a later fire's tail retries the whole review; §3's duplicate
  guard keeps the retry from re-posting the same threads.
- **gh rate limit on posting / label edit** — `pr-review: ERROR`; same retry
  property (marker absent → next tail run tries again).
- **Sentinel block missing/garbled from an axis subagent** — treat that axis as
  0 findings and note it in the done-marker comment; never crash the round.

## Boundaries

- Never pushes, commits, or edits code — the skill's entire write surface is
  inline review comments, one `team:revise` label add, and one done-marker
  comment. All fixing belongs to `/pr-reconcile`.
- Never merges the PR. Merge is human-gated.
- Never replies to or resolves ANY thread (not even its own) — thread
  reply/resolution is `/pr-reconcile` §2's job.
- Never applies any label other than `team:revise`, never removes a label, never
  drafts the PR.
- Posts exactly one done-marker comment ever per PR — it is the once-per-PR
  idempotency gate for every future §6a.1b entry.
- Never operates on a PR not on `feat/issue-<N>` (only team-pickup output is
  supported).
