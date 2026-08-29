---
name: to-tickets
description:
  Break a Spec, plan, or the current conversation into tracer-bullet Slices and
  publish them as GitHub issues with native blocking edges, sub-issue links,
  AFK/HITL labels and Project #1 membership. Use when a Spec needs cutting into
  implementation tickets.
disable-model-invocation: true
---

# To Tickets

Break a Spec, plan, or conversation into **Slices**: tracer-bullet vertical
slices, each declaring the Slices that **block** it. This is the Smart Smoker
fork of the mattpocock skill: same flow, but it publishes tickets the harness
can actually pick up (`AFK` / `HITL` labels, Project #1 membership with a
Priority, native GitHub dependencies, sub-issues of the Spec).

Tracker conventions:
[`docs/agents/issue-tracker.md`](../../../docs/agents/issue-tracker.md).
Vocabulary (Spec, Slice, AFK, HITL, Map): [`CONTEXT.md`](../../../CONTEXT.md).

## Invocation

```
/to-tickets [<spec-issue-number|url>] [--dry-run]
```

- `--dry-run` — print the planned issues (titles, type, blockers, full bodies)
  and the commands that would run, then stop. Mutates nothing: no issues, no
  labels, no project items, no dependency edges.

## Process

### 1. Gather context

Work from what is already in context. If the user passed a Spec (path, issue
number, URL), fetch its full body and comments: `gh issue view <n> --comments`.

### 2. Explore the codebase

If you have not already explored the codebase, do so. Read `CONTEXT.md` for the
domain glossary and the relevant `docs/adr/` entries: Slice titles and bodies
use that vocabulary and respect those decisions.

Look for prefactoring that makes the implementation easier. "Make the change
easy, then make the easy change."

### 3. Draft vertical slices

<vertical-slice-rules>

- Each Slice cuts a narrow but COMPLETE path through every layer (schema, API,
  UI, tests): vertical, NOT a horizontal slice of one layer
- A completed Slice is demoable or verifiable on its own
- Each Slice is sized to fit in a single fresh context window
- Any prefactoring is its own Slice, first

</vertical-slice-rules>

Give each Slice its **blocking edges**: the Slices that must close before it can
start. A Slice with no blockers can start immediately.

Mark each Slice **AFK** or **HITL**. AFK Slices are implementable and mergeable
without a human in the loop; HITL Slices need live human judgement
(architectural decision, infra cutover, design review, credentials). Prefer AFK.

**Wide refactors are the exception to vertical slicing.** A wide refactor is one
mechanical change (rename a column, retype a shared symbol) whose blast radius
fans across the codebase, so a single edit breaks thousands of call sites and no
vertical slice can land green. Sequence it as **expand–contract**: expand (add
the new form beside the old), then migrate call sites in batches sized by blast
radius (each batch its own Slice blocked by the expand, CI green batch to
batch), then contract (delete the old form, blocked by every batch). When even
the batches cannot stay green alone, let them share an integration branch that
all block a final integrate-and-verify Slice; green is promised only there.

### 4. Quiz the user

Present the breakdown as a numbered list. Per Slice: **Title**, **Type** (AFK /
HITL), **Blocked by**, **What it delivers**.

Ask:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct — does each Slice depend only on Slices that
  genuinely gate it?
- Should any Slices be merged or split further?
- Are the right Slices marked HITL?

Iterate until the user approves.

Then ask the **Priority quiz — once per batch, not per Slice** — with
AskUserQuestion: what Priority should the AFK Slices in this batch carry on
Project #1? Options `P0`, `P1`, `P2`; **default `P2`**. One answer applies to
every AFK Slice in the batch.

### 5. Bootstrap labels (idempotent)

Run before creating any issue. `--force` creates if absent, updates metadata if
present, never errors.

```bash
gh label create "AFK"               --description "Issue eligible for autonomous agent implementation" --color "1D76DB" --force
gh label create "HITL"              --description "Requires human in the loop; not eligible for autonomous pickup" --color "5319E7" --force
gh label create "spec"              --description "Spec issue: Slices are cut from it and reviewed against it" --color "C2E0C6" --force
gh label create "AFK:in-progress"   --description "Currently being implemented by an agent team"          --color "FBCA04" --force
gh label create "AFK:done"          --description "Completed by an agent team"                            --color "0E8A16" --force
gh label create "AFK:failed"        --description "Agent team attempt failed; needs human triage"         --color "B60205" --force
gh label create "AFK:checks-failed" --description "Agent-team PR: CI or manual verification could not be brought to pass autonomously (fix loop exhausted)" --color "D93F0B" --force
gh label create "AFK:revise"        --description "Human hand-back: agent must address this PR's unresolved review comments" --color "0052CC" --force
gh label create "AFK:revise-failed" --description "Agent-team PR: review comments could not be auto-resolved (revise loop exhausted)" --color "B60205" --force
gh label create "AFK:rebase-failed" --description "Agent-team PR: automatic rebase onto master failed; human rebase required" --color "B60205" --force
gh label create "AFK:paused"        --description "Agent-team run paused mid-issue; resumable on a later fire" --color "FEF2C0" --force
```

### 6. First pass — create the issues

Create one issue per Slice, in dependency order (blockers first) so the
informational `## Blocked by` mirror can link real issues. Use the body template
below verbatim, section order included. Issue #586 is the reference shape.

- **AFK Slice** → `gh issue create --label AFK ...`
- **HITL Slice** → `gh issue create --label HITL ...`

Never `Spawned by` on a Slice — that line belongs to wayfinder fog graduation.
Do NOT close or modify the Spec issue beyond adding sub-issue links (§7).

<issue-template>

## Parent

Spec: #<spec-issue-number>

## What to build

The end-to-end behaviour this Slice makes work, from the user's perspective, not
layer-by-layer implementation. Reference sections of the Spec instead of
duplicating them.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## User stories addressed

Numbers from the Spec's User Stories list: 3, 7, 11

## Interface changes

The modules, services or interfaces created or modified. Specific about what
changes; no file paths, no code snippets.

- Module/interface 1: what changes
- Module/interface 2: what changes

## Behaviors to test

Observable behaviours verified through public interfaces, each mapped to an
acceptance criterion.

1. Behaviour description (AC 1)
2. Behaviour description (AC 2)

## Testing priority

- **Critical**: behaviours 1, 2 (must have tests)
- **Nice-to-have**: behaviour 3 (test if time permits)

## Blocked by

- [Blocking slice title](https://github.com/benjr70/Smart-Smoker-V2/issues/N)

Or "None — can start immediately".

</issue-template>

The `## Blocked by` section is an **informational name mirror** for human
readers: names wrapping links, never bare numbers. The picker does not parse it
— the gate is the native edge wired in §7.

Avoid file paths and code snippets: they go stale fast. Exception: a prototype
snippet that encodes a decision more precisely than prose can (state machine,
reducer, schema, type shape). Inline the decision-rich part only, and say it
came from a prototype.

### 7. Second pass — wire edges and sub-issues

Issues need ids before they can reference each other, so this runs after every
Slice exists. Both APIs take the **numeric database id**, not the `#number` and
not the `node_id`:

```bash
gh api repos/benjr70/Smart-Smoker-V2/issues/<n> --jq .id     # -> database id
```

For each blocking pair, add the native dependency on the **blocked** issue:

```bash
gh api -X POST repos/benjr70/Smart-Smoker-V2/issues/<blocked-number>/dependencies/blocked_by \
  -F issue_id=<blocker-database-id>
```

For each Slice, add it as a **sub-issue of the Spec**:

```bash
gh api -X POST repos/benjr70/Smart-Smoker-V2/issues/<spec-number>/sub_issues \
  -F sub_issue_id=<slice-database-id>
```

Both endpoints are idempotent-ish: a duplicate edge returns an error that is
safe to ignore. Report any other failure to the user rather than retrying
blindly.

### 8. Third pass — project and priority (AFK only)

An AFK Slice that is not on Project #1 is silently invisible to `/afk-pickup`.
Add each AFK Slice and set the Priority answered in the §4 quiz:

```bash
gh project item-add 1 --owner benjr70 --url <issue-url>
```

Then set the `Priority` single-select field on the new item. The picker reads it
as
`projectItems.nodes[] | select(.project.number == 1) | fieldValueByName("Priority")`,
a `ProjectV2ItemFieldSingleSelectValue` whose `name` is `P0` / `P1` / `P2`
(missing or null is treated as `P2`) — see the GraphQL in
`scripts/claude-agent/lib/pickup-triage.sh` §2. Set it with
`gh project item-edit --project-id <pid> --id <item-id> --field-id <fid> --single-select-option-id <oid>`,
resolving the ids with `gh project field-list 1 --owner benjr70 --format json`.

**HITL Slices are never added to the project** — project membership is the
daemon's pick signal, and a projected HITL Slice would be picked up.

### 9. Report

Print the created Slices as names with links, their type, Priority, and the
edges wired. Say which Slices are on the frontier (no open blockers) — those are
takeable now.
