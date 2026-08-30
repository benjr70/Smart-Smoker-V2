---
name: wayfinder
description:
  Plan a huge chunk of work (more than one agent session can hold) as a shared
  map of decision tickets on your issue tracker, and resolve them one at a time
  until the way to the destination is clear.
disable-model-invocation: true
---

A loose idea has arrived, too big for one agent session, and wrapped in fog: the
way from here to the **destination** isn't visible yet. Wayfinding is about
finding that way, not charging at the destination. This skill charts the way as
a **shared map** on the repo's issue tracker, then works its **decision
tickets** (questions whose resolution is a decision, not slices of a build to
execute) one at a time until the route is clear.

The destination varies per effort, and naming it is the first act of charting:
it shapes every ticket. It might be a spec to hand off and iterate on, a
decision to lock before planning starts, or a change made in place like a
data-structure migration. The map is domain-agnostic: engineering work, course
content, whatever fits the shape.

This is the Smart Smoker fork of the mattpocock skill: same flow, plus this
repo's labels, Project #1 membership and Priority (see
[Labels, project and priority](#labels-project-and-priority)), and chart-time
research fired as `/afk-resolve` subagents. Tracker conventions live in
[`docs/agents/issue-tracker.md`](../../../docs/agents/issue-tracker.md);
vocabulary in [`CONTEXT.md`](../../../CONTEXT.md).

## Plan, don't do

Wayfinder is **planning** by default: each ticket resolves a decision, and the
map is done when the way is clear, with nothing left to decide before someone
goes and does the thing. The pull to just do the work is usually the signal
you've reached the edge of the map and it's time to hand off. An effort can
override this in its **Notes**, carrying execution into the map itself, but
absent that, produce decisions, not deliverables.

## Refer by name

Every map and ticket is an issue, so it has a **name**: its title. In everything
the human reads (narration, the map's Decisions-so-far), refer to it by that
name, never by a bare id, number, or slug. A wall of `#42, #43, #44` is
illegible; names read at a glance. The id and URL don't vanish; a name wraps its
link, but they ride _inside_ the name, never stand in for it.

## The Map

The map is a single issue on this repo's issue tracker, labelled
`wayfinder:map`, the canonical artifact. Its tickets are child issues of the
map.

The map is an **index**, not a store. It lists the decisions made and points at
the tickets that hold their detail; a decision lives in exactly one place, its
ticket, so the map never restates it, only gists it and links.

**Where the map, its child tickets, blocking, and frontier queries physically
live is tracker-specific.** This repo's tracker is GitHub: read the "Wayfinding
operations" section of
[`docs/agents/issue-tracker.md`](../../../docs/agents/issue-tracker.md) for the
exact `gh` commands (map label, sub-issues, native dependencies, frontier query,
claim, resolve).

### The map body

The whole map at low resolution, loaded once per session. Open tickets are
**not** listed: they are open child issues, found by query.

```markdown
## Destination

<what reaching the end of this map looks like: the spec, decision, or change
this effort is finding its way to. One or two lines; every session orients to it
before choosing a ticket.>

## Notes

<domain; skills every session should consult; standing preferences for this
effort>

## Decisions so far

<!-- the index: one line per closed ticket, enough to judge relevance, then zoom the link for the detail the ticket holds -->

- [<closed ticket title>](link): <one-line gist of the answer>

## Not yet specified

<!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->

## Out of scope

<!-- see "Out of scope": work ruled beyond the destination; closed, never graduates -->
```

### Tickets

Each ticket is a **child issue** of the map; the tracker's issue id is its
identity. Its body is the question, sized to one 100K token agent session:

```markdown
## Question

<the decision or investigation this ticket resolves>
```

Each ticket carries a `wayfinder:<type>` label, one of `research`, `prototype`,
`grilling`, `task` (see [Ticket Types](#ticket-types)), plus `AFK` or `HITL` per
[Labels, project and priority](#labels-project-and-priority).

A session **claims** a ticket by assigning it to the dev driving the map,
**first**, before any work, so concurrent sessions skip it. That assignee _is_
the claim: an open, unassigned ticket is unclaimed.

Blocking uses the tracker's **native** dependency relationship: essential
because it renders the frontier _visually_ in the tracker's own UI, so the human
sees what's takeable without opening the map. Only a tracker that lacks native
blocking falls back to a body convention. A ticket is **unblocked** when every
ticket blocking it is closed; the **frontier** is the open, unblocked, unclaimed
children, the edge of the known.

The answer isn't part of the body; it's recorded on resolution (see
[Work through the map](#work-through-the-map)). Assets created while resolving a
ticket are linked from the issue, not pasted in.

## Ticket Types

Every ticket is either **HITL** (human in the loop, worked _with_ a human who
speaks for themselves) or **AFK**, driven by the agent alone. A HITL ticket only
resolves through that live exchange; the agent never stands in for the human's
side of it (a grilling agent that answers its own questions has broken this).

- **Research** (AFK): Reading documentation, third-party APIs, or local
  resources like knowledge bases to surface a fact a decision waits on. Resolved
  by an `/afk-resolve` subagent (which calls the Skill tool with "research" and
  persists its findings under `docs/research/`). Use when knowledge outside the
  current working directory is required.
- **Prototype** (HITL): Raise the fidelity of the discussion by making a cheap,
  rough, concrete artifact to react to (an outline, a rough take, a stub, or
  UI/logic code) by calling the Skill tool with "prototype". Links the prototype
  as an asset. Use when "how should it look" or "how should it behave" is the
  key question.
- **Grilling** (HITL): Conversation. The default case. Always call the Skill
  tool twice, for "grilling" and "domain-modeling".
- **Task** (HITL or AFK): Manual work that must happen before a _decision_ can
  be made: nothing to decide, prototype, or research, but the discussion is
  blocked until it's done. Signing up for a service so its API can be judged,
  provisioning access, moving data so its shape can be seen. This is the one
  type that _does_ rather than decides, and it earns its place by unblocking a
  decision, not by delivering the destination. The agent drives it alone where
  it can (AFK); otherwise it hands the human a precise checklist (HITL).
  Resolved when the work is done; the answer records what was done and any
  resulting facts (credentials location, new URLs, row counts) later tickets
  depend on.

## Labels, project and priority

Type decides who may take the ticket, and that routing is what the Daemon reads:

| Ticket type         | Labels                         | Project #1                       |
| ------------------- | ------------------------------ | -------------------------------- |
| `research`          | `wayfinder:research` + `AFK`   | added, Priority (default **P1**) |
| `task`, human-free  | `wayfinder:task` + `AFK`       | added, Priority (default **P1**) |
| `task`, needs human | `wayfinder:task` + `HITL`      | not added                        |
| `grilling`          | `wayfinder:grilling` + `HITL`  | not added                        |
| `prototype`         | `wayfinder:prototype` + `HITL` | not added                        |

Project membership is the Daemon's pick signal: an `AFK` ticket missing from
Project #1 is silently never picked, and a projected `HITL` ticket gets picked
when it must not be. Ask the Priority **once per batch** with AskUserQuestion
(`P0` / `P1` / `P2`, default `P1`) and apply that one answer to every AFK ticket
in the batch.

`gh project item-edit` needs four ids, and they come from three different
commands: `gh project field-list` yields only the field and option ids, never
the project id and never the item id (that one comes back from `item-add`).

```bash
gh issue create --label wayfinder:research --label AFK ...

# once per batch
pid=$(gh project view 1 --owner benjr70 --format json --jq '.id')
fid=$(gh project field-list 1 --owner benjr70 --format json \
  --jq '.fields[] | select(.name == "Priority") | .id')
oid=$(gh project field-list 1 --owner benjr70 --format json \
  --jq '.fields[] | select(.name == "Priority") | .options[] | select(.name == "P1") | .id')

# per AFK ticket
item_id=$(gh project item-add 1 --owner benjr70 --url <issue-url> --format json --jq '.id')
gh project item-edit --project-id "$pid" --id "$item_id" \
  --field-id "$fid" --single-select-option-id "$oid"
```

Substitute the answered Priority for `P1` in the `oid` lookup. An item with no
Priority is read as `P2`, so check `item-edit`'s exit status rather than
assuming it landed.

Create missing `wayfinder:*` labels the same way the
[`to-tickets` bootstrap](../to-tickets/SKILL.md) §5 does — **create-if-missing
with an explicit `--color`, never `gh label create --force`**, which rewrites
the colour (a random one when `--color` is omitted) and description of a label
that already exists:

```bash
ensure_label() {  # <name> <color> <description>; creates only when absent
  if gh label list --limit 200 --json name --jq '.[].name' | grep -qxF "$1"; then
    return 0
  fi
  gh label create "$1" --color "$2" --description "$3"
}

ensure_label "wayfinder:map"       "0E8A16" "Wayfinder map issue"
ensure_label "wayfinder:grilling"  "FBCA04" "Wayfinder grilling ticket (HITL)"
ensure_label "wayfinder:prototype" "D4C5F9" "Wayfinder prototype ticket (HITL)"
ensure_label "wayfinder:research"  "C5DEF5" "Wayfinder research ticket (AFK)"
ensure_label "wayfinder:task"      "BFD4F2" "Wayfinder task ticket"
```

The `AFK`, `HITL` and `AFK:*` bootstrap block lives in
[`.claude/skills/to-tickets/SKILL.md`](../to-tickets/SKILL.md) §5.

## Fog of war

The map is _deliberately_ incomplete: don't chart what you can't yet see. Beyond
the live tickets lies the **fog of war**: the dim view of decisions and
investigations you can tell are coming but can't yet pin down, because they hang
on questions still open. Resolving a ticket clears the fog ahead of it,
graduating whatever's now specifiable into fresh tickets, one at a time, until
the way to the destination is clear and no tickets remain.

The map's **Not yet specified** section is where that dim view is written down:
the suspected question, the area to revisit later. It's the undiscovered
frontier _toward_ the destination: everything here is in scope, just not sharp
enough to ticket. Write as loosely or as fully as the view allows; it doubles as
a signpost for collaborators reading where the effort is headed.

**Fog or ticket?** The test is whether you can state the question precisely now,
_not_ whether you can answer it now.

- **Ticket when** the question is already sharp, even if it's blocked and you
  can't act on it yet.
- **Not yet specified when** you can't yet phrase it that sharply. Don't
  pre-slice the fog into ticket-sized pieces: it's coarser than a ticket, and
  one patch may graduate into several tickets, or none, once the frontier
  reaches it.

**Not yet specified** excludes what's already decided (Decisions so far), what's
already a live ticket, and what's out of scope (the next section).

## Out of scope

Fog only ever gathers _toward_ the destination. The destination fixes the scope,
so work beyond it is **out of scope**: it isn't fog, and it doesn't belong in
**Not yet specified**. It gets its own **Out of scope** section on the map: work
you've consciously ruled out of _this_ effort. Scope, not sharpness, lands it
here.

Out-of-scope work never graduates (the frontier stops at the destination), so it
returns only if the destination is redrawn, and then as a fresh effort, not a
resumption.

Ruling something out of scope is a scoping act, not a step on the route. When a
ticket that already exists turns out to sit past the destination (mis-scoped in
while charting, or exposed by a resolution), **close it** (a closed ticket is
unambiguously off the frontier) and leave one line in the **Out of scope**
section: the gist plus why it's out of scope, linking the closed ticket. It
stays out of **Decisions so far**, which records the route actually walked; a
scope boundary isn't a step on it.

## Invocation

Two modes. Either way, **never resolve more than one ticket per session**, with
the exception of research tickets.

### Chart the map

User invokes with a loose idea.

1. **Name the destination.** Call the Skill tool twice, for "grilling" and
   "domain-modeling", to pin down what this map is finding its way to: the spec,
   decision, or change. The destination fixes the scope, so it's settled first.
2. **Map the frontier.** Grill again, **breadth-first** this time: fan out
   across the whole space rather than deep on any one thread, surfacing the open
   decisions and the first steps takeable now. **If this surfaces no fog** (the
   way to the destination is already clear, the whole journey small enough for
   one session), you don't need a map. Stop and ask the user how they'd like to
   proceed.
3. **Create the map** (label `wayfinder:map`): Destination and Notes filled in,
   Decisions-so-far empty, the fog sketched into **Not yet specified**.
4. **Create the tickets you can specify now** as child issues of the map,
   labelled and projected per
   [Labels, project and priority](#labels-project-and-priority), then wire
   blocking edges in a **second pass** (issues need ids before they can
   reference each other). Wiring sorts them into the frontier and the blocked;
   everything you can't yet specify stays in the fog: the **Not yet specified**
   section.
5. **Fire the research subagents.** For each `research` ticket you just created,
   spin up an `/afk-resolve` subagent to resolve it in parallel. It follows the
   same persist-to-`docs/research/` protocol the Daemon uses — findings land as
   a docs-only PR under `docs/research/<map-slug>/<ticket-slug>.md`, never on a
   throwaway branch. Its protocol lives in
   [`.claude/skills/afk-resolve/SKILL.md`](../afk-resolve/SKILL.md).
6. Stop: charting is one session's work; it hand-resolves nothing.

### Work through the map

User invokes with a map (URL or number). A ticket is **optional**: without one,
you pick the next decision, not the user.

1. Load the **map**: the low-res view, not every ticket body.
2. Choose the ticket. If the user named one, use it. Otherwise take the first
   frontier ticket in order. **Claim it**: assign it to yourself before any
   work.
3. Resolve it. **Zoom as needed**: fetch the full body of any related or closed
   ticket on demand; call the Skill tool for whichever skills the `## Notes`
   block names. If in doubt, call the Skill tool twice, for "grilling" and
   "domain-modeling".
4. Record the resolution: post the answer as a **resolution comment**, **close**
   the issue, and **append a context pointer** to the map's Decisions-so-far.
5. Add newly-surfaced tickets (create-then-wire); graduate any fog the answer
   has made specifiable, clearing each graduated patch from **Not yet
   specified** so it lives only as its new ticket. If the answer reveals that a
   ticket (this one or another) sits beyond the destination, **rule it out of
   scope** rather than resolving it on the route. If the decision invalidates
   other parts of the map, update or delete those tickets.

The user may run unblocked tickets in parallel, so expect other sessions to be
editing the tracker concurrently.
