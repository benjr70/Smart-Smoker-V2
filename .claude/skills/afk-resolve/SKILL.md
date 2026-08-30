---
name: afk-resolve
description:
  Resolve one wayfinder Decision ticket end to end without a human: claim it,
  run the research (or do the human-free task), persist findings as
  `docs/research/<map-slug>/<ticket-slug>.md` behind a docs-only PR, merge it
  through the docs-only gate, post the resolution comment, close the ticket,
  append the Map's Decisions so far, and graduate fog into new tickets. Invoked
  by `/afk-pickup` §2b on verdict `pick-wayfinder`, and by `/wayfinder` for
  chart-time research. Takes the ticket number and its type.
---

# AFK Resolve — Autonomous Decision-Ticket Resolver

You resolve **one** wayfinder Decision ticket per invocation. A Decision ticket
is a child of a **Map** whose resolution is a decision or a fact, never a change
to the product — so this skill writes no application code, opens no
`feat/issue-*` branch, and spawns no implementer team.

Vocabulary (Map, Decision ticket, Frontier, Fog, Resolve) is defined in
[`CONTEXT.md`](../../../CONTEXT.md). The Map's format, its label/project rules
and the tracker commands are owned by
[`.claude/skills/wayfinder/SKILL.md`](../wayfinder/SKILL.md) and
[`docs/agents/issue-tracker.md`](../../../docs/agents/issue-tracker.md) — read
those for anything about the Map itself; this skill owns only the resolution
protocol.

## Invocation

```
/afk-resolve --issue <N> --type <research|task> [--slug <slug>]
```

`--issue` and `--type` are required. `--type` comes from the picker's
`.pick.type` (the ticket's `wayfinder:research` / `wayfinder:task` label); never
re-derive it from the title. `--slug` is the caller's already-computed ticket
slug (`/afk-pickup` §2b passes the one it printed on the `resolve:` marker
line): when present it is used **verbatim** for the branch, the file and every
report line, so the branch `agent-run` may have to delete is exactly the one the
marker names. `wayfinder:grilling` and `wayfinder:prototype` are HITL types and
are **never** resolvable here — refuse and exit if one arrives.

## Process

### 1. Claim (assignee + lock)

The claim is the first write, before any reading of sources, so a concurrent
session or fire skips the ticket.

```bash
REPO=benjr70/Smart-Smoker-V2
LOGIN=$(gh api user -q .login)
gh issue edit "$N" --add-assignee "$LOGIN"
gh issue edit "$N" --add-label AFK:in-progress    # idempotent: §2b already did it
```

Then load the ticket and its Map. The Map is the ticket's GitHub **parent**; the
parent number, not the body, is the truth:

```bash
TICKET_TITLE=$(gh issue view "$N" --json title --jq .title)
QUESTION=$(gh issue view "$N" --json body --jq .body)
MAP=$(gh api graphql -f query='
  query { repository(owner:"benjr70", name:"Smart-Smoker-V2") {
    issue(number: '"$N"') { parent { number title body } } } }' \
  --jq '.data.repository.issue.parent')
MAP_N=$(printf '%s' "$MAP"     | jq -r '.number')
MAP_TITLE=$(printf '%s' "$MAP" | jq -r '.title')
```

Slugs are derived the same way everywhere (lowercase, non-alphanumerics to
hyphens, trimmed, 60 chars) — the branch, the file path and the `resolve:` log
line must all agree. The **ticket** slug is derived here only when the caller
did not pass one; `--slug` always wins, so a caller that already published the
slug (and whose cleanup deletes `research/<slug>`) can never disagree with the
branch this skill pushes:

```bash
slugify() { printf '%s' "$1" | tr 'A-Z' 'a-z' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' | cut -c1-60; }
MAP_SLUG=$(slugify "$MAP_TITLE")
SLUG=${ARG_SLUG:-$(slugify "$TICKET_TITLE")}    # --slug verbatim when given
```

Emit the structured marker (`/afk-pickup` §2b prints the same line, with the
same `--slug`, before invoking; printing it here as well is harmless and makes a
`/wayfinder` chart-time invocation — which passes no `--slug` — scrapeable):

```
resolve: #<N> <research|task> <SLUG>
```

If the Map cannot be read, continue anyway with `MAP_SLUG=unmapped` and note it
in the resolution comment — a resolvable ticket is never blocked on its index.

**Task tickets** branch here: go to [§8 Task tickets](#8-task-tickets). Research
tickets continue.

### 2. Research

Call the **`research` skill** with the Skill tool (installed at
`~/.agents/skills/research/SKILL.md`), passing the ticket's `## Question`
verbatim plus the Map's Destination and Notes as context, and this repo's
persistence convention: findings go to `docs/research/<MAP_SLUG>/<SLUG>.md`,
every claim cited to the primary source that owns it.

Never answer from memory. Primary sources only (official docs, source code,
specs, first-party APIs, live probes against this repo). A live probe is a
source: record the exact command and its output.

**No sources found** — the question cannot be answered from primary sources
without a human decision — is a failure, not an empty file: go to
[§7 Failure](#7-failure) with reason `no-sources`.

### 3. The findings file

One file per ticket, at `docs/research/<MAP_SLUG>/<SLUG>.md`, opening with this
header so the file explains itself away from GitHub:

```markdown
# <Title of the finding, not the ticket>

Ticket: [#<N>](https://github.com/benjr70/Smart-Smoker-V2/issues/<N>) (part of
wayfinder map
[#<MAP_N>](https://github.com/benjr70/Smart-Smoker-V2/issues/<MAP_N>) —
<MAP_TITLE>). Researched on <YYYY-MM-DD>.

Sources: <the primary sources consulted — doc URLs, files read, live probes run>

## TL;DR

- <the answer, in the fewest lines that survive being read alone>

## <sections with the evidence, each claim cited>
```

The four header facts — **ticket, map, date, sources** — are mandatory; a file
missing any of them is not done. Write nothing outside `docs/research/` — the
docs-only gate refuses the merge otherwise, and rightly.

### 4. Branch, commit, PR

```bash
git fetch origin master --quiet
git checkout -B "research/$SLUG" origin/master
git add "docs/research/$MAP_SLUG/$SLUG.md"
git commit -m "docs(research): <short description> (#$N)"
git push -u origin "research/$SLUG"
```

The PR title is a conventional-commit subject that must pass the repo's title
lint (it is a required check, and release-please derives the changelog from it).
Validate **before** creating the PR, up to 3 rewrites:

```bash
PR_TITLE="docs(research): <short description> (#$N)"
bash scripts/validate-pr-title.sh "$PR_TITLE"    # rewrite + re-run on failure
PR_URL=$(gh pr create --base master --head "research/$SLUG" \
  --title "$PR_TITLE" --body "$PR_BODY")
PR=$(printf '%s' "$PR_URL" | grep -oE '[0-9]+$')
```

`PR_BODY` states the question, the answer in one paragraph, and
`Resolves #<N> — <ticket title>`. Do **not** write `Closes #<N>`: this skill
closes the ticket itself in §6, with the resolution comment attached, and a
GitHub auto-close on merge would close it bare.

`PR_BODY` must also carry this machine marker on its own line — it is what lets
a **later** fire that merges this PR find its way back to the ticket (§5b), so a
research PR that lands out-of-band never orphans its Decision ticket:

```markdown
<!-- afk-resolve ticket:#<N> map:#<MAP_N> slug:<SLUG> -->
```

### 5. Green it, then merge it through the gate

Hand CI to **`/pr-watch`** via the `Agent` tool
(`subagent_type: general-purpose`, `model: opus`, `run_in_background: false` —
blocking; never proceed while it is in flight):

> Invoke the /pr-watch skill with --pr \<PR> --branch research/\<SLUG> --repo
> benjr70/Smart-Smoker-V2 --issue \<N>. Return the terminal `pr-watch:` line
> verbatim.

`pr-watch: PASS` continues. `pr-watch: DRAFT` (fix loop exhausted) or
`pr-watch: ERROR` → [§7 Failure](#7-failure) with that line as the reason.

A research PR earns no `/pr-review` and no `/verify-pr` round: it changes no
code. Green CI plus the **docs-only gate**'s own re-read of the real diff is the
whole bar. The gate is the deep module
`scripts/claude-agent/lib/docs-only-gate.sh`: it **decides** and prints the
exact merge command; running that command verbatim is the only sanctioned way to
land this PR. Never hand-roll a `gh pr merge`.

```bash
HEAD_SHA=$(gh pr view "$PR" --json headRefOid -q .headRefOid)
git fetch origin master --quiet
git fetch origin "refs/pull/$PR/head" --quiet
GATE=$(scripts/claude-agent/lib/docs-only-gate.sh \
    --base origin/master --head "$HEAD_SHA" --pr "$PR" \
    --repo benjr70/Smart-Smoker-V2 --check-state 2>&1 >/tmp/resolve-gate.json)
GATE_RC=$?
GATE_JSON=$(cat /tmp/resolve-gate.json)

if [ "$GATE_RC" -eq 0 ]; then
    eval "$(printf '%s' "$GATE_JSON" | jq -r '.mergeCmd')"
fi
```

On a successful merge emit the second structured marker (the dashboard and
`agent-run` both read these lines):

```
docs-merge: PR #<PR> <HEAD_SHA>
```

A refusal is **not** a resolve failure to hide: the research is written and the
PR is open, it just did not land. Report the gate's `.reason` verbatim on the
`docs-merge:` line (`REFUSED — <reason>` /
`ERROR — gate could not run: <reason>`), leave the PR open for the next fire's
§1.2 `docs-merge` triage, and go to [§7 Failure](#7-failure) with that reason —
the ticket stays open, because its findings are not on master yet and the
resolution comment must link master.

The hand-off is only half the story: the fire that eventually merges the PR must
come **back** here to finish the ticket, or the findings land on master with the
ticket stuck `AFK:failed` forever — commented on by nobody, closed by nobody,
absent from the Map. That return trip is §5b, and the `<!-- afk-resolve … -->`
marker in the PR body (§4) is what makes it findable. Say so on the ticket's
failure comment: _the PR is open; merging it finishes this ticket
automatically._

### 5b. Finish a resolve whose PR merged later

```
/afk-resolve --issue <N> --type research --finish-merged --pr <P>
```

`/afk-pickup` §1.2 fires this immediately after its `docs-merge` branch merges a
PR whose body carries the `<!-- afk-resolve ticket:#<N> … -->` marker — i.e.
exactly the PRs this skill left behind on a `gate-refused` failure. The research
already exists and is now on master, so this mode does **no** research, writes
no file, opens no PR and creates no branch:

1. Re-read the marker for `MAP_N` / `MAP_SLUG` / `SLUG` (the PR body is the
   record; do not re-derive them from titles), and read the merged file at
   `docs/research/<MAP_SLUG>/<SLUG>.md` for its TL;DR.
2. Clear the stale failure: `gh issue edit "$N" --remove-label AFK:failed`.
3. Resume at [§6 Resolve the ticket](#6-resolve-the-ticket) and run it to the
   end — resolution comment linking master, close, `AFK:done`, Map append, §6b
   fog graduation. Terminal line is §6's usual
   `resolve: DONE — #<N> closed, PR #<P> merged <sha>`.

If the ticket is already closed, this mode is a no-op: print
`resolve: DONE — #<N> closed, PR #<P> merged <sha>` and stop. Re-running it is
therefore safe, which is what makes it callable from a best-effort tail.

### 6. Resolve the ticket

Only after the merge landed. The resolution comment is the **gist plus the
link** — the detail lives in the file, and the comment must point at the file on
**master**, not at the branch (which is deleted on squash-merge):

```bash
gh issue comment "$N" --body "$(cat <<EOF
<one-paragraph gist of the answer — enough to judge relevance without opening anything>

Full findings: [docs/research/$MAP_SLUG/$SLUG.md](https://github.com/benjr70/Smart-Smoker-V2/blob/master/docs/research/$MAP_SLUG/$SLUG.md) (merged in #$PR).
EOF
)"
gh issue close "$N"
gh issue edit "$N" --remove-label AFK:in-progress --add-label AFK:done
```

Then append one line to the Map's **Decisions so far**, under the existing
entries, referring to the ticket **by name** (never a bare number):

```markdown
- [<ticket title>](https://github.com/benjr70/Smart-Smoker-V2/issues/<N>):
  <one-line gist of the answer>
```

Read the Map body, insert the line, and write it back with
`gh issue edit "$MAP_N" --body-file`. The append is **best-effort**: a failure
here is logged as `resolve: WARN — map #<MAP_N> append failed: <reason>` and the
resolve still counts as done. The ticket carries the answer; the Map is an
index, and an index can be rebuilt.

### 6b. Fog graduation

An answer clears fog ahead of it. Graduate only what the answer made
**specifiable** — the test is whether you can state the question sharply now,
not whether you can answer it. Under these guardrails, which are hard bounds,
not preferences:

| Guardrail    | Rule                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Volume       | At most **3** new tickets per resolve. Beyond that, leave the rest in the Map's **Not yet specified**.                   |
| Parentage    | Every new ticket is a **sub-issue of the Map** (`POST /issues/<MAP_N>/sub_issues` with the child's numeric database id). |
| Blocking     | Native dependencies only (`POST /issues/<child>/dependencies/blocked_by`), never body prose.                             |
| Provenance   | The body carries a `Spawned by #<N>` line naming the ticket that surfaced it.                                            |
| Depth        | Depth = the length of the `Spawned by` chain back to a human-created ticket. A ticket at depth ≤ 2 may be `AFK`.         |
| Routing      | `AFK` only for `wayfinder:research` and human-free `wayfinder:task` at depth ≤ 2. Everything else gets `HITL`.           |
| Priority     | Every `AFK` ticket goes into Project #1 at **P1**. `HITL` tickets are never projected.                                   |
| Scope        | The Map's **Destination** and **Out of scope** sections are **never** edited here — redrawing scope is a human act.      |
| No recursion | Never resolve a ticket you just created, in this session or by firing another resolve. The next tick picks it up.        |

Depth is what stops a runaway: a research answer that spawns research that
spawns research is `HITL` at the third generation, so a human sees the branch
before it grows again. Count the chain by following `Spawned by #<n>` up the
ancestors; a ticket with no such line is depth 0.

Clear each graduated patch out of the Map's **Not yet specified** in the same
edit that appends Decisions so far, so a question lives either as fog or as a
ticket, never both.

### 7. Failure

Any of these leaves the ticket **open** for a human, labelled `AFK:failed` with
a comment naming what happened. Never invent an answer, and never close a ticket
you could not resolve.

| Reason               | Trigger                                                 | Comment says                                                                             |
| -------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `research-error`     | the `research` skill errored or returned nothing usable | what it was asked, what came back                                                        |
| `no-sources`         | no primary source answers the question                  | which sources were tried, what is missing                                                |
| `pr-watch-exhausted` | `pr-watch: DRAFT` / `ERROR` on the research PR          | the verbatim `pr-watch:` line and the PR link                                            |
| `gate-refused`       | the docs-only gate refused or could not run             | the verbatim `.reason`, the PR link, and that merging the PR finishes the ticket via §5b |

```bash
gh issue edit "$N" --remove-label AFK:in-progress --add-label AFK:failed
gh issue comment "$N" --body "afk-resolve FAILED at $(date -u +%FT%TZ) — <reason>: <detail>. Ticket left open for human triage."
```

Terminal line: `resolve: FAILED — #<N> <reason>`.

**Usage exhaustion** is not a failure and is not handled here: the run simply
stops mid-protocol. `agent-run` detects the `resolve:` marker line, drops the
`AFK:in-progress` lock, deletes any pushed `research/<SLUG>` branch and applies
**no** label, so the next tick restarts the resolve from scratch. That undo is
bounded by the terminal line: once `resolve: DONE …` has been printed the ticket
is closed and answered, so a later cutoff (or crash) in the best-effort tail —
the Map append, fog graduation, the caller's token accounting — only drops the
lock and leaves `AFK:done`. This is why §6 prints nothing else between closing
the ticket and that terminal line. Nothing in this skill should try to pre-empt
that — in particular, never apply `AFK:paused` to a Decision ticket.

### 8. Task tickets

A `wayfinder:task` ticket does the work rather than deciding: provisioning
access, moving data, signing up for a service so its API can be judged. Same
skeleton, minus the file and the PR — there is nothing to persist under
`docs/research/`.

1. Do the work with the tools available (§1's claim already happened).
2. Post a resolution comment recording **what was done** and every fact later
   tickets depend on: where credentials live, new URLs, row counts, versions.
3. Close the ticket, `AFK:in-progress → AFK:done`, append the Map's Decisions so
   far, graduate fog under §6b's guardrails.
4. Terminal line: `resolve: DONE — #<N> closed (task)`.

**A task that needs a code change is not a task.** Slices are cut from a Spec
and implemented by a team; a Decision ticket that turns out to demand product
code is mis-typed. Do not write the code:

```bash
gh issue edit "$N" --remove-label AFK --remove-label AFK:in-progress --add-label HITL
gh issue comment "$N" --body "afk-resolve: this task needs a change to product code, which a Decision ticket never carries — relabelled HITL for a human to route (as a Slice off a Spec, or by re-scoping the ticket). What it would take: <one paragraph>."
```

Also remove it from Project #1 (project membership is the Daemon's pick signal,
so a projected `HITL` ticket would be picked again). Terminal line:
`resolve: DONE — #<N> relabelled HITL (needs code)`.

## Output format

Emit the marker lines as they happen (they are the machine contract), then one
terminal line the caller pastes into its report:

```
resolve: #<N> <research|task> <slug>              (§1, before any interruptible work)
docs-merge: PR #<P> <sha>                          (§5, research only, on merge)
resolve: WARN — map #<M> append failed: <reason>   (§6, best-effort append only)
resolve: DONE — #<N> closed, PR #<P> merged <sha>  (research)
resolve: DONE — #<N> closed (task)                 (task)
resolve: DONE — #<N> relabelled HITL (needs code)  (task needing product code)
resolve: FAILED — #<N> <reason>                    (§7)
```

Exactly one `DONE`/`FAILED` line per invocation, and it is the last thing
printed.

## Boundaries

- **One ticket per invocation.** Never resolve a second ticket, and never a
  ticket this run created (§6b) — the next tick owns it.
- **Never leave a merged research PR without its ticket.** A `gate-refused`
  failure is a deferral, not an ending: the PR carries the
  `<!-- afk-resolve … -->` marker so whichever fire merges it can call §5b and
  close the loop.
- **No product code, ever.** The only file this skill writes is
  `docs/research/<map-slug>/<ticket-slug>.md`; the only branch it creates is
  `research/<ticket-slug>`. A ticket that demands code is relabelled `HITL`.
- **The gate merges, not you.** Land the PR only by running the docs-only gate's
  own `.mergeCmd` verbatim, and only after `pr-watch: PASS`.
- **Never edit the Map's Destination or Out of scope.** Appending Decisions so
  far and clearing graduated fog out of Not yet specified are the only Map
  edits.
- **Never stand in for a human.** `wayfinder:grilling` and `wayfinder:prototype`
  tickets are refused; a research question that only a human can answer fails as
  `no-sources` rather than being answered from opinion.
- **Never close a ticket without its answer recorded** — the resolution comment
  (and, for research, the merged file on master) exists before the close.
- **Never apply `AFK:paused`** to a Decision ticket: an interrupted resolve is
  restarted, not resumed.
