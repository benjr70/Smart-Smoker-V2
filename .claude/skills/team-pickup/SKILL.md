---
name: team-pickup
description:
  Reconcile an open agent PR needing attention (merge conflict or a human's
  `team:revise` hand-back) if one exists, else resume a `team:paused` issue
  (preserving its branch), otherwise pick the next eligible `team`-labeled
  GitHub issue from the Smart Smoker V2 GitHub Project (highest Priority field
  then oldest, blockers resolved, no other team in flight), invoke
  `/team-dispatch --issue <N> [--resume]`, then open a PR on success or apply
  `team:failed` on failure. Designed to be fired by a Claude routine on cron. No
  arguments (besides optional --dry-run).
---

# Team Pickup — Autonomous Single-Issue Picker + PR Wrapper

You are the **pickup wrapper** around `/team-dispatch`. One fire = at most one
issue. Idempotent and silent when nothing is eligible.

## Invocation

```
/team-pickup [--dry-run]
```

- No positional args.
- `--dry-run` — print the picked issue without mutating GitHub or git, then
  exit.

## Process

### 0. Pre-flight (lightweight)

`/team-dispatch` owns full pre-flight (tooling, env flag, label creation).
Verify only what the picker itself needs before §1:

```bash
gh auth status >/dev/null || { echo "team-pickup: gh not authenticated — §2 will use GitHub MCP fallback"; USE_MCP_FOR_PROJECT=1; }
if ! gh auth status 2>&1 | grep -q "'project'"; then
  echo "team-pickup: gh token missing 'project' scope — §2 will use GitHub MCP fallback"
  USE_MCP_FOR_PROJECT=1
fi
grep -q '"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS"\s*:\s*"1"' .claude/settings.json \
  || { echo "team-pickup: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 missing in .claude/settings.json"; exit 1; }
```

> **Routine env note.** When fired by a remote/cron routine, the routine's `gh`
> token may not have the `project` scope. Refreshing the local token does not
> propagate. Either re-issue the routine's token with `project` scope **or**
> rely on the GitHub MCP fallback below — both are supported.

### 0.5. GitHub access strategy: gh first, MCP fallback

All GitHub operations in this skill default to `gh` / `gh api graphql`. If `gh`
is unavailable, unauthenticated, or missing a required scope (most commonly
`project` for §2's project-field query), fall back to the equivalent **GitHub
MCP** server tool (the `mcp__github__*`-style functions exposed in the available
toolset). The shapes are equivalent — issue listing, GraphQL, issue editing,
label management, PR creation. Pick whichever works in the current env; do
**not** abort the pickup just because `gh` is missing or under-scoped.

### 1. Concurrency lock check (repo-wide)

`team:in-progress` is the distributed lock. If any open issue holds it, a prior
fire is still working — exit silent.

```bash
INFLIGHT=$(gh issue list --label team:in-progress --state open --json number --jq 'length')
if [ "$INFLIGHT" -gt 0 ]; then
  echo "team-pickup: skip — $INFLIGHT issue(s) in flight"
  exit 0
fi
```

### 1.2. Reconcile a PR needing attention (before resume, before any new pick)

An already-open agent PR that a human is waiting on outranks everything else:
finishing it is the shortest path to a merge. Two signals make a PR "needing
attention": its mergeable state is `CONFLICTING` (master moved under it — always
auto-fixed, no label needed) or it carries the **`team:revise`** label (a human
reviewed it and explicitly handed it back — or §6a.1b's `/pr-review` posted 🤖
findings and applied the label itself). Detection is a cheap `gh` read + the
**PR Triage** deep module — zero Claude usage when nothing needs attention.

`pr_triage_scan` owns the `gh pr list` call and rides out GitHub's async
mergeability: a fresh master push leaves every open PR `UNKNOWN` for a few
seconds, and a plain one-shot listing would miss a conflicted PR on this very
fire (observed live 2026-07-10: #305 missed at 18:45, one minute after a merge).
The scan re-lists while any agent-shaped PR is `UNKNOWN` (up to ~2 min), then
triages.

```bash
AGENT_LOGIN=$(gh api user -q .login 2>/dev/null || echo "")
. scripts/claude-agent/lib/pr-triage.sh
PICK_JSON=$(PR_TRIAGE_AUTHOR="$AGENT_LOGIN" pr_triage_scan) || PICK_JSON=""
```

If nothing is picked (`PICK_JSON` empty / `{"pr":null}`), fall through to §1.5.
Otherwise (`--dry-run`: print
`team-pickup: would-reconcile PR #<P> (issue #<N>)` and exit 0):

```bash
RECON_PR=$(printf '%s' "$PICK_JSON" | jq -r '.pr')
RECON_BRANCH=$(printf '%s' "$PICK_JSON" | jq -r '.branch')
RECON_N=$(printf '%s' "$PICK_JSON" | jq -r '.issue')
RECON_REASON=$(printf '%s' "$PICK_JSON" | jq -r '.reason')
# When the PR both conflicts AND carries team:revise, pass --reason both.

# Single-flight lock: reuse the issue lock so §1's skip, the daemon's pacing,
# and agent-run's crash cleanup all keep working unchanged. Remember whether
# team:done was present so it can be restored on exit.
HAD_DONE=$(gh issue view "$RECON_N" --json labels --jq '[.labels[].name] | index("team:done") != null')
gh issue edit "$RECON_N" --remove-label team:done --add-label team:in-progress 2>/dev/null || true
```

Emit the pick line (this exact shape — agent-run's crash cleanup scrapes it):

```
picked:   reconcile PR #<RECON_PR> (issue #<RECON_N>)
```

Then spawn the **`/pr-reconcile`** skill via the `Agent` tool —
`subagent_type: general-purpose`, `model: opus`, `run_in_background: false`
(blocking, same rule as §6a.1: never proceed or emit output while it is in
flight) — with the prompt:

`"Invoke the /pr-reconcile skill with --pr <RECON_PR> --branch <RECON_BRANCH> --issue <RECON_N> --reason <RECON_REASON>, repo benjr70/Smart-Smoker-V2."`

Record its terminal `pr-reconcile:` line verbatim as `RECONCILE_LINE`. Then
restore the lock and exit — a reconcile fire never falls through to §1.5/§2 (one
fire = one unit of work):

```bash
gh issue edit "$RECON_N" --remove-label team:in-progress 2>/dev/null || true
[ "$HAD_DONE" = "true" ] && gh issue edit "$RECON_N" --add-label team:done 2>/dev/null || true
```

Report per the reconcile output block in §7 and exit 0 (exit non-zero only if
the pr-reconcile agent itself crashed with no terminal line).

### 1.5. Resume paused work before any new pick

A `team:paused` issue is work that a prior window started and the daemon froze
mid-run (a `wip:` commit, branch kept) when Claude usage ran out. In-flight work
is always finished before new work is started, so a paused issue is resumed
**before** the §2 pick — and its partial branch is preserved, never reset.

The resume-vs-fail decision (including the resume-count cap) is the
**Pause/Resume state logic** deep module. Source it and hand it the paused
issue's number and its pause count; do not re-derive the cap logic inline.

```bash
# The paused issue (at most one — single-flight, same as the in-progress lock).
PAUSED_N=$(gh issue list --label team:paused --state open --json number --jq '.[0].number // empty')

if [ -n "$PAUSED_N" ]; then
  # Pause count = number of pause records agent-run left on the issue timeline
  # (each pause appends a "Run paused at … usage exhausted" comment).
  PAUSE_COUNT=$(gh issue view "$PAUSED_N" --json comments \
    --jq '[.comments[] | select(.body | test("Run paused at .*usage exhausted"))] | length')

  . scripts/claude-agent/lib/pause-resume.sh
  ACTION_JSON=$(pause_resume_action "$PAUSED_N" "${PAUSE_COUNT:-0}")
  ACTION=$(printf '%s' "$ACTION_JSON" | jq -r '.action')

  case "$ACTION" in
    resume)
      # Resume this issue: RESUME_MODE tells §4 to preserve the branch and §5 to
      # dispatch in resume mode. Skip §2's fresh pick entirely.
      RESUME_MODE=1
      N="$PAUSED_N"
      ;;
    fail)
      # Paused too many times (cap reached) — a too-big issue; hand to a human.
      gh issue edit "$PAUSED_N" --remove-label team:paused --add-label team:failed
      gh issue comment "$PAUSED_N" --body "team-pickup: paused $(printf '%s' "$ACTION_JSON" | jq -r '.pauseCount') times (resume cap reached) — marking team:failed for human triage at $(date -Iseconds)."
      echo "team-pickup: #$PAUSED_N hit the resume cap — team:failed, stopping"
      exit 0
      ;;
  esac
fi
```

If `RESUME_MODE` is set, skip §2 and §3 and go straight to §4 (§3's dry-run
short-circuit still applies — print `would-resume #N` and exit). Otherwise
(`pick-new`, or no paused issue) continue to §2.

### 2. Pick next eligible issue (highest Priority field, then oldest)

The pick set is: open issues with the `team` label, present in the **Smart
Smoker V2** GitHub Project (number `1`), and not carrying `team:in-progress`,
`team:done`, or `team:failed`. The `Priority` field on the project item drives
the sort (`P0` > `P1` > `P2`); a missing or null `Priority` defaults to `P2`.
Within the same Priority, oldest `createdAt` wins.

Issues that carry the `team` label but are **not in the project** are skipped
silently — project membership is the explicit triage signal. Add them to the
project (and set Priority) before the picker will consider them.

> If `USE_MCP_FOR_PROJECT=1` from §0 (or `gh` rejects the GraphQL call below),
> invoke the equivalent GitHub MCP GraphQL tool with the same query string and
> parse the same JSON shape downstream.

```bash
gh api graphql -f query='
query {
  repository(owner: "benjr70", name: "Smart-Smoker-V2") {
    issues(first: 100, labels: ["team"], states: OPEN) {
      nodes {
        number
        title
        body
        createdAt
        labels(first: 30) { nodes { name } }
        projectItems(first: 10) {
          nodes {
            project { number }
            fieldValueByName(name: "Priority") {
              ... on ProjectV2ItemFieldSingleSelectValue { name }
            }
          }
        }
      }
    }
  }
}' \
| jq -r '
    def prio_rank:
      if   . == "P0" then 0
      elif . == "P1" then 1
      elif . == "P2" then 2
      else 2 end;
    [.data.repository.issues.nodes[]
      | . as $i
      | ($i.labels.nodes | map(.name)) as $lbls
      | select(($lbls | index("team:in-progress") | not)
            and ($lbls | index("team:done") | not)
            and ($lbls | index("team:failed") | not))
      | ($i.projectItems.nodes | map(select(.project.number == 1)) | first) as $pi
      | select($pi != null)
      | ($pi.fieldValueByName.name // "P2") as $prio
      | . + {priority: $prio, prio_rank: ($prio | prio_rank)}]
    | sort_by([.prio_rank, .createdAt])
    | .[] | @base64'
```

For each candidate row (highest Priority first, oldest first within ties), parse
`Blocked by\s+#(\d+)` from the body — same regex `team-dispatch` §1 uses. For
every blocker number, run `gh issue view <blocker> --json state --jq .state`; if
any is `OPEN`, skip this candidate. The first candidate with no open blockers is
the pick.

If no candidate survives:

```
team-pickup: no eligible issue
```

…and `exit 0`. Do not notify.

### 3. Dry-run short-circuit

If `--dry-run` was passed:

```
team-pickup: would-pick #<N> <title>        # normal pick
team-pickup: would-resume #<N> <title>      # RESUME_MODE from §1.5
```

…and `exit 0`. No git or GitHub mutations.

### 4. Branch + apply lock

**Normal pick** — fresh branch from latest master. `checkout -B` resets if a
stale branch from a prior failed fire exists.

```bash
N=<picked>
TITLE=$(gh issue view "$N" --json title --jq .title)
git fetch origin master
git checkout -B "feat/issue-$N" origin/master
gh issue edit "$N" --add-label team:in-progress
```

**Resume** (`RESUME_MODE=1` from §1.5) — the paused issue already has a
`feat/issue-$N` branch carrying its partial work (a `wip:` freeze commit and any
green tests from the prior window). Check it out **as-is** — do **not**
`checkout -B` from `origin/master`, which would wipe exactly the work we are
resuming. Move the lock `team:paused → team:in-progress`.

```bash
N="$PAUSED_N"
TITLE=$(gh issue view "$N" --json title --jq .title)
git fetch origin                              # refresh refs; do NOT reset the branch
git checkout "feat/issue-$N"                  # existing branch, partial work intact
gh issue edit "$N" --remove-label team:paused --add-label team:in-progress
```

### 5. Delegate to /team-dispatch

Invoke the team-dispatch skill in single-issue mode. On a resume, add the
`--resume` flag so team-dispatch takes its resume entry path (read the partial
branch, run the tests to discover what remains, continue TDD) instead of
starting the issue from scratch:

```
/team-dispatch --issue <N>            # normal pick
/team-dispatch --issue <N> --resume   # RESUME_MODE from §1.5
```

Capture exit code and the final commit on `feat/issue-<N>`. team-dispatch is
responsible for spawning implementer/reviewer/verifier, driving TDD, appending
the `smoke:` trailer, applying `team:done`, closing the issue.

### 6a. Success path → open PR

Verify the HEAD commit message contains a passing or skipped smoke trailer.
Treat `smoke: FAIL` and a missing trailer as failures (route to §6b).

```bash
TRAILER=$(git log -1 --format=%B | grep -E '^smoke:' | head -1)
case "$TRAILER" in
  "smoke: PASS"*|"smoke: SKIPPED"*) ;;  # ok
  "")            FAIL_REASON="missing smoke trailer on HEAD"; goto §6b ;;
  "smoke: FAIL"*) FAIL_REASON="$TRAILER"; goto §6b ;;
esac

git push -u origin "feat/issue-$N"
```

Build PR body. Extract the issue's Acceptance Criteria block — everything
between a heading matching `^## *Acceptance [Cc]riteria` and the next `^## `
heading (or end of body). If absent, substitute the placeholder
`_(no Acceptance Criteria found in issue body)_`.

Use this template:

```markdown
## Summary

<first paragraph of HEAD commit body>

## Closes

Closes #<N> — <issue title>

## Smoke

`<TRAILER>`

## Manual verification

<AC block — verbatim — or placeholder>

---

Generated by `/team-pickup` at <ISO-8601 timestamp>
```

Then:

```bash
PR_URL=$(gh pr create --base master --head "feat/issue-$N" \
  --title "Closes #$N: $TITLE" \
  --body "$PR_BODY")
PR_NUM=$(echo "$PR_URL" | grep -oE '[0-9]+$')

# team-dispatch likely already applied team:done; this is idempotent insurance.
gh issue edit "$N" --remove-label team:in-progress 2>/dev/null || true
gh issue edit "$N" --add-label team:done           2>/dev/null || true
```

### 6a.1. Hand off to `/pr-watch` (BLOCKING)

After the PR is open, immediately spawn the `/pr-watch` skill as a background
agent using the `Agent` tool. This wrapper **blocks** until pr-watch returns —
the autonomous fire is not complete until CI passes (or the fix-loop is
exhausted and the PR is marked draft). The user picked this design knowing one
VM = one issue in flight at a time; the `team:in-progress` lock and the blocking
pr-watch are the two halves of that constraint.

Invoke pr-watch via the `Agent` tool with:

- `subagent_type: general-purpose`
- `model: opus`
- `run_in_background: false` ← blocking
- `prompt`:
  `"Invoke the /pr-watch skill for PR #<PR_NUM> on branch feat/issue-<N>, repo benjr70/Smart-Smoker-V2. Issue #<N>. Poll CI every 60s up to 45 minutes per round. On red, loop the implementer up to 10 rounds total. On exhaustion convert the PR to draft and add the team:checks-failed label."`

Wait for the agent to return. Record its final message verbatim as
`PR_WATCH_LINE`. It will be one of:

- `pr-watch: PASS — all checks green at attempt <K>`
- `pr-watch: DRAFT — exhausted 10 rounds, marked draft, team:checks-failed`
- `pr-watch: ERROR — <reason>`

**pr-watch is a blocking checkpoint, not a background task.** While the pr-watch
agent is in flight you MUST NOT proceed to §6a.2, §6a.3, §7, or any other step,
and MUST NOT emit the output block or any summary. If the `Agent` tool reports
the spawn as still running / "in flight", keep waiting (poll for the agent
result) until a terminal `pr-watch:` line exists. A run that emits its output
block while pr-watch is still in flight is an **invalid run** —
`pr-watch: (in flight)` is never a legal value for the §7 block.

§6a.1 may execute **more than once per fire**: every `fix(manual)` push from
§6a.3 re-enters this step, because new commits re-run CI and invalidate the
previous PASS. Each entry is a fresh pr-watch invocation with its own 10-round
budget.

### 6a.1b. Autonomous code review (delegates to `/pr-review`, BLOCKING, once per PR ever)

Run only when the **most recent** §6a.1 invocation returned `pr-watch: PASS`.
The review happens exactly once in a PR's life; the gate is the done-marker
comment `/pr-review` posts on completion:

```bash
if [ "$(gh api "repos/benjr70/Smart-Smoker-V2/issues/$PR_NUM/comments" --paginate \
      --jq '[.[].body | select(contains("<!-- pr-review-done"))] | length')" != "0" ]; then
  REVIEW_LINE="pr-review: SKIPPED — already reviewed"
  # → proceed to §6a.2
fi
```

When the marker is absent, spawn `/pr-review` via the `Agent` tool —
`subagent_type: general-purpose`, `model: opus`, `run_in_background: false`
(blocking, same rule as §6a.1: never proceed or emit output while it is in
flight) — with the prompt:

> Invoke the /pr-review skill with --pr \<PR_NUM> --branch feat/issue-\<N>
> --issue \<N>, repo benjr70/Smart-Smoker-V2. Return the skill's terminal
> `pr-review:` line verbatim.

Record its terminal `pr-review:` line verbatim as `REVIEW_LINE`. Routing:

- `pr-review: DONE — <N> findings posted, team:revise applied` → **end the
  fire's success path here** (emit the §7 block with this `review:` line and no
  `verify:` line). The label hands the PR to the NEXT fire's §1.2 triage →
  `/pr-reconcile`, whose comment loop fixes the 🤖 threads and then re-runs the
  full pr-watch + manual-verification tail — running §6a.2 now would verify code
  the reconcile is about to rewrite.
- `pr-review: PASS — 0 findings` → proceed to §6a.2.
- `pr-review: SKIPPED — …` → proceed to §6a.2.
- `pr-review: ERROR — …` → record the line and proceed to §6a.2. The review is
  **best-effort**: it never drafts the PR and never blocks the tail (the
  done-marker is absent on ERROR, so a later fire's reconcile tail gets one more
  chance).

`/pr-review` never fixes, replies, or resolves anything itself — its 🤖 threads
are ordinary unresolved review threads that ride the `team:revise` →
`/pr-reconcile` machinery, exactly like a human hand-back.

### 6a.2. Manual verification round (delegates to `/verify-pr`, BLOCKING)

Run only when the **most recent** §6a.1 invocation returned `pr-watch: PASS`
(the code is final — a pr-watch fix loop may rewrite it, so verifying earlier
would produce stale evidence) **and §6a.1b has completed or skipped**. Skip when
§6a.1 returned DRAFT or ERROR. This step is **round `M` of the manual
verification loop** (`M` starts at 1, cap `MANUAL_ROUNDS_MAX=3` — see §6a.3).

Delegate the whole round to the **`/verify-pr`** harness skill (the proven slice
1–5 machinery). team-pickup no longer carries an inline verifier prompt: the
harness parses the PR's checklist, boots a hermetic per-PR stack, spawns the
`manual-verifier` agent to exercise each **unchecked** item in a REAL headful
browser / Electron / hermetic Mongo, ticks the boxes that passed (previously
ticked boxes stay ticked; deferred and failed boxes stay `- [ ]`), posts exactly
one round evidence comment, tears the stack and browser/Electron down on every
exit path, and emits the terminal `manual-verify:` line this wrapper consumes.
The old inline rules (no Claude usage, stub externals via injection points,
headless assumptions) are **superseded** by the harness rules — nothing beyond
the provisioned toolchain, namespaced compose builds/pulls allowed, execute in a
real browser.

Spawn `/verify-pr` via the `Agent` tool — `subagent_type: general-purpose`,
`model: opus`, `run_in_background: false` (blocking, same rule as §6a.1: never
proceed or emit output while it is in flight) — with a prompt that names the PR,
repo, issue, and the current round so the harness heads its single evidence
comment with the round marker:

> Invoke the /verify-pr skill for PR #\<PR_NUM>, repo benjr70/Smart-Smoker-V2,
> issue #\<N>. This is round \<M> of \<MANUAL_ROUNDS_MAX> of the manual
> verification loop; head this round's single evidence comment
> `### Manual verification — round <M>/3`. Return the skill's terminal
> `manual-verify:` line verbatim.

Wait for the agent to return and record its terminal
`manual-verify: <pass>/<total> PASS, <deferred> deferred, <fail> FAIL` line as
`MANUAL_LINE` (the format and §6a.3/§7 consumption are unchanged from the old
inline flow). This spawn is blocking under the same rule as §6a.1 — do not
proceed or emit output while it is in flight; `manual-verify: (in flight)` is
never a legal value. If `/verify-pr` aborts on a prerequisite or returns
`manual-verify: infra-error …` (stack never booted — a non-verdict, zero items
acted on), record it verbatim, do **not** enter the fix loop (parse FAIL as 0),
and report it in §7 like a pr-watch ERROR.

**Split the deferrals — spec-demanding route like FAILs (AC 4).** `/verify-pr`'s
`manual-verify:` line lumps every DEFER into one `deferred` count, but the
`manual-verifier` classifies them two ways and they route differently:

- **hardware DEFER** (named human blocker), and **deployed-env DEFER whose
  demanded post-deploy spec is already present in the PR body** — justified;
  they do not loop, they stay unticked for the human.
- **deployed-env DEFER demanding a tagged post-deploy spec the PR does not yet
  carry** — an _outstanding spec-demand_. It routes to §6a.3 exactly like a
  FAIL, where the implementer's fix is to add the demanded
  `<!-- post-deploy: … -->`-tagged spec item. The next round's re-verify then
  checks that the spec is present (and runs it green in hermetic mode where the
  harness can).

The concrete artifact a spec fix produces is a `<!-- post-deploy: … -->` tag in
the PR body, so an outstanding demand is one this round's evidence comment asked
for that the body does not yet carry:

```bash
ROUND_COMMENT=$(gh pr view "$PR_NUM" --json comments \
  --jq '[.comments[] | select(.body | test("Manual verification — .*round"))] | last | .body')
SPEC_DEMANDS=$(printf '%s' "$ROUND_COMMENT"        | grep -ci 'spec-demanded' || true)
SPECS_TAGGED=$(gh pr view "$PR_NUM" --json body --jq .body | grep -c '<!-- post-deploy:' || true)
OUTSTANDING_SPECS=$(( SPEC_DEMANDS > SPECS_TAGGED ? SPEC_DEMANDS - SPECS_TAGGED : 0 ))
```

Parse `<fail>` from `MANUAL_LINE`. If **FAIL = 0 and `OUTSTANDING_SPECS` = 0**,
the loop is done — go to §7 (every item either passed or is a justified
deferral). Otherwise (FAIL > 0 **or** an outstanding spec-demand), go to §6a.3.

### 6a.3. Manual fix round (lead commits, mirrors pr-watch)

When §6a.2 reports one or more ❌ FAIL items — **or an outstanding deployed-env
spec-demand** — do NOT leave them for the human: loop the implementer to fix the
shipped behavior (or add the demanded spec), then re-verify. Because a fix push
re-runs CI and stales the prior `pr-watch: PASS`, each fix re-enters §6a.1
before re-running §6a.2. The whole success path is this bounded outer loop:

```
M=1; MANUAL_ROUNDS_MAX=3
while true:
  §6a.1 pr-watch (blocking) → PR_WATCH_LINE
  if PR_WATCH_LINE != PASS: break            # DRAFT/ERROR — report, no verify line
  §6a.1b pr-review (blocking, marker-gated once-ever) → REVIEW_LINE
  if REVIEW_LINE says team:revise applied: break   # fixes belong to the next fire's reconcile
  §6a.2 /verify-pr round M (blocking) → MANUAL_LINE, OUTSTANDING_SPECS
  if FAIL == 0 and OUTSTANDING_SPECS == 0: break   # all pass / justified deferrals
  if M == MANUAL_ROUNDS_MAX: exhaust; break
  spawn implementer with the ❌ evidence + spec-demands → stages fix (never commits)
  git commit -m "fix(manual): round $M — <failed items / spec-demands summary>"; git push
  M=M+1                                       # → re-enter §6a.1 (CI re-runs)
```

**Implementer spawn** — via the `Agent` tool: `subagent_type: implementer`,
`model: opus`, `run_in_background: false` (blocking). The prompt embeds the
issue title + body, the PR diff (`git diff origin/master...HEAD`, capped at 2000
lines as in pr-watch §3), the `/verify-pr` round's ❌ FAIL evidence lines and
any outstanding deployed-env spec-demands verbatim (from `ROUND_COMMENT`), plus
these instructions verbatim:

> Fix the shipped behavior so each failed manual-verification item passes when
> exercised live. For each outstanding deployed-env spec-demand, add the
> demanded post-deploy verification as a `<!-- post-deploy: … -->`-tagged item
> under the PR's `## Manual verification` (or `## Human verification required`)
> checklist — and, where the check can be scripted, commit the spec it
> references so the re-verify round can run it green in hermetic mode. Stage the
> fix (`git add`). Do NOT commit and do NOT push — the wrapper handles that.
> Reply with a short summary when staged. If you believe the acceptance
> criterion itself is wrong (not the code), reply
> `manual-verify-dispute: <one-line reason>` and stage nothing.

On `manual-verify-dispute` (or if the implementer staged nothing), treat it as
exhaustion immediately — this loop never edits acceptance criteria. Otherwise
the lead commits the staged fix as `fix(manual): round <M> — <summary>` and
pushes with a plain `git push` (never `--force`), then re-enters §6a.1.

**Exhaustion** (cap reached, or a dispute) — mirror pr-watch's escalation; do
NOT route to §6b (a PR exists, and §6b is the no-PR path that must not run after
a push):

```bash
gh pr ready "$PR_NUM" --undo
gh pr edit  "$PR_NUM" --add-label team:checks-failed
gh issue comment "$N" --body "manual verification exhausted $MANUAL_ROUNDS_MAX fix rounds on PR #$PR_NUM — <f> item(s) still FAIL. Marked draft + team:checks-failed. Human triage required."
```

Report the last `MANUAL_LINE` in the §7 block, suffixed `— EXHAUSTED`.

### 6b. Failure path

On any of: team-dispatch non-zero exit, missing smoke trailer, `smoke: FAIL`, or
unresolved reviewer change-request:

```bash
gh issue edit "$N" --remove-label team:in-progress
gh issue edit "$N" --add-label team:failed
gh issue comment "$N" --body "team-pickup FAILED at $(date -Iseconds): ${FAIL_REASON:-team-dispatch returned non-zero}"
```

Do NOT open a PR. Do NOT push the branch. Exit non-zero so the routine log
captures the failure.

## Output format

One block per fire, written to stdout:

```
=== /team-pickup <ISO-8601> ===
picked:   #<N> <title>            (or: skip — N in flight, or: no eligible)
dispatch: PASS | FAIL — <reason>
pr:       <url>                    (success only)
pr-watch: PASS | DRAFT | ERROR — <detail>   (success only)
review:   <verbatim pr-review terminal line>   (pr-watch PASS only)
verify:   <pass>/<total> PASS, <n> deferred, <n> FAIL — round <M>/3 [— EXHAUSTED]   (pr-watch PASS only)
```

A **reconcile fire** (§1.2 picked a PR instead of an issue) emits this block
instead:

```
=== /team-pickup <ISO-8601> ===
picked:   reconcile PR #<P> (issue #<N>)
reconcile: <verbatim terminal pr-reconcile: line from the §1.2 agent>
```

`pr-watch` line mirrors verbatim the final message returned by the spawned
pr-watch agent in §6a.1; `verify:` mirrors the §6a.2 `/verify-pr` round's final
`manual-verify:` line (from the last round), suffixed `— round <M>/3` and, on
§6a.3 exhaustion, `— EXHAUSTED`. If §6a failed (no PR opened), omit the `pr:`,
`pr-watch:`, and `verify:` lines; if pr-watch returned DRAFT/ERROR, omit
`verify:`.

**Machine skip lines (for the daemon).** When the fire does not pick — a
concurrency skip (§1) or an empty queue (§2) — emit, in addition to the human
`picked:` line, one of these exact standalone lines so `agent-run` can tell the
daemon to sleep out the window instead of hot-looping into the lock:

- `team-pickup: skip` — a `team:in-progress` lock is already held (§1).
- `team-pickup: no eligible issue` — nothing eligible in the queue (§2).

**Hard validity rule.** On the §6a success path the output block MUST contain a
`pr-watch:` line copied verbatim from the last pr-watch agent's terminal
message, and — whenever that line says PASS — a `review:` line copied from
§6a.1b's terminal `pr-review:` message (SKIPPED counts) and a `verify:` line
copied from the last `/verify-pr` round's `manual-verify:` message. Exception:
when the `review:` line says `team:revise applied`, the fire legally ends
without a `verify:` line (the reconcile fire re-verifies after the fixes). If
any required line is missing, the run is **invalid**: do not emit the report; go
back and wait for the in-flight agent. `pr-watch: (in flight)` and
`pr-review: (in flight)` are never legal values.

## Failure modes

- **Stale `team:in-progress` from crashed prior fire** — §1 will block all
  future fires until manually cleared. Fix:
  `gh issue edit <N> --remove-label team:in-progress`.
- **Branch `feat/issue-<N>` already exists from a prior failed fire** — §4's
  `checkout -B` resets it from `origin/master`, discarding stale work.
  Recoverable via `git reflog`. This reset applies to the **normal-pick** path
  only; the **resume** path (§1.5 → §4) deliberately checks the branch out as-is
  so the paused window's partial work survives.
- **Paused issue loops across too many windows** — §1.5 caps resumes via the
  Pause/Resume state logic (default 3); on the cap it applies `team:failed` and
  stops, so a too-big issue is handed to a human instead of bouncing forever.
- **Acceptance Criteria section missing from issue body** — PR body uses a
  placeholder line. PR still opens; reviewer will notice and request the
  amendment.
- **`smoke:` trailer present but says FAIL** — §6a treats as failure, routes to
  §6b. SKIPPED is acceptable (some apps have no smoke script).
- **§6a.2 `/verify-pr` round reports ❌ (or an outstanding spec-demand)** —
  §6a.3 spawns the implementer with the failure evidence (and any demanded
  post-deploy specs), the lead commits `fix(manual): round <M> …` and pushes,
  and the loop re-enters §6a.1 (CI must re-green before re-verification). Cap 3
  manual rounds; on exhaustion (or an implementer `manual-verify-dispute`) the
  PR converts to draft + `team:checks-failed` with an issue comment — the same
  escalation as pr-watch exhaustion. A **justified DEFER** item (real hardware /
  human observation, or a deployed-env item whose demanded
  `<!-- post-deploy: … -->` spec is already present) is not a failure and does
  not loop; it stays unticked for the human.
- **Lead emits output while pr-watch or the `/verify-pr` round is in flight** —
  an invalid run per the §7 hard validity rule. The missing terminal `pr-watch:`
  / `verify:` line is the detection signal; the fix is to wait for the blocking
  agent before emitting anything.
- **Network/auth flake mid-team-dispatch** — teammates may stay spawned.
  Wrapper's §6b cleans GitHub state but cannot clean teammates. Run "Clean up
  the team." manually after a §6b failure.
- **Crash mid-reconcile (§1.2)** — the issue is left `team:in-progress` with no
  live fire. agent-run's crash cleanup scrapes the
  `picked:   reconcile PR #<P> (issue #<N>)` line and restores the lock
  (`team:in-progress` removed, `team:done` re-added) instead of applying
  `team:failed` — the issue's work was already done; only the PR needs care.
- **Reconcile pick loops on the same PR** — cannot happen while parked:
  `/pr-reconcile` always exits having either removed the attention signal
  (rebased ⇒ no longer CONFLICTING; threads done ⇒ `team:revise` dropped) or
  applied a parked label (`team:rebase-failed` / `team:revise-failed`) that the
  PR Triage skips.

## Boundaries

- Never picks more than one unit of work per fire — a reconcile (§1.2), a resume
  (§1.5), or a fresh issue (§2), in that priority order, never two.
- Never invokes `scripts/ralph/*` (separate Level 6 system).
- Never modifies the parent PRD issue. Only operates on `team`-labeled child
  issues. (PRDs themselves must NOT carry the `team` label.)
- Never opens a PR if smoke did not pass or skip.
- Never exits before the §6a.1 pr-watch agent (and, on pr-watch PASS, the §6a.1b
  `/pr-review` review and — unless the review applied `team:revise` — the §6a.2
  `/verify-pr` round, re-entered once per manual fix round) returns. One fire =
  one issue picked, implemented, PR opened, CI watched to verdict, code-reviewed
  once, and either manual verification executed and recorded on the PR or the
  review's `team:revise` hand-off queued for the next fire's reconcile.
- The §6a.2 **`/verify-pr` round** mutates nothing beyond the PR body (boxes it
  proved) and one evidence comment per round, and tears its hermetic stack down
  on every exit path; it does spend Claude usage (the `manual-verifier` is an
  opus agent). The §6a.3 **fix loop** also burns usage (one implementer spawn
  per manual round, cap 3) and pushes `fix(manual):` commits to the PR branch
  only — never to master, never force-pushed. The §6a.1b **`/pr-review` review**
  burns usage once per PR ever (two review subagents) and never pushes — its
  only writes are inline review comments, at most one `team:revise` label add,
  and one done-marker comment; the fixes it queues are pushed later by
  `/pr-reconcile` under that skill's own rules.
