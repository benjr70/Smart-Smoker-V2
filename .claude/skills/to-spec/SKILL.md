---
name: to-spec
description:
  "Turn the current conversation into a Spec and publish it as a GitHub issue
  labelled `spec`: no interview, just synthesis of what you've already
  discussed. Use at a Map's destination or after a grilling session."
disable-model-invocation: true
---

# To Spec

Take the current conversation context and codebase understanding and produce a
**Spec**: the issue Slices are cut from and reviewed against. Do NOT interview
the user; synthesize what you already know.

This is the Smart Smoker fork of the mattpocock skill: same flow, plus a
`## Module design` section and this repo's labelling.

Tracker conventions:
[`docs/agents/issue-tracker.md`](../../../docs/agents/issue-tracker.md).
Vocabulary (Spec, Slice, Map, AFK, HITL): [`CONTEXT.md`](../../../CONTEXT.md).

## Process

1. Explore the repo to understand the current state of the codebase, if you have
   not already. Read `CONTEXT.md` for the glossary and the relevant `docs/adr/`
   entries; use that vocabulary throughout the Spec and respect those decisions.

2. Sketch the **seams** at which the feature will be tested. Prefer existing
   seams to new ones, and the highest seam possible. The fewer seams across the
   codebase, the better — the ideal number is one. Check with the user that
   these seams match their expectations.

3. Sketch the **modules** to build or modify, looking for deep modules (a lot of
   functionality behind a simple, testable interface that rarely changes). Check
   with the user that the modules match their expectations, and **which of them
   they want tests written for**. This becomes `## Module design`.

4. Write the Spec using the template below and publish it:
   `gh issue create --label spec`. A Spec is **never** labelled `AFK` — it is
   not implementable work — and is never added to Project #1.

   If the Spec is born from a wayfinder Map, make `Part of #<map>` the **first
   line of the body**, then add it as a sub-issue of the Map:

   ```bash
   gh api repos/benjr70/Smart-Smoker-V2/issues/<spec> --jq .id     # database id
   gh api -X POST repos/benjr70/Smart-Smoker-V2/issues/<map>/sub_issues \
     -F sub_issue_id=<spec-database-id>
   ```

5. Tell the user the Spec's name and link, and that `/to-tickets <spec>` cuts it
   into Slices.

<spec-template>

## Problem Statement

The problem the user is facing, from the user's perspective.

## Solution

The solution, from the user's perspective.

## User Stories

A LONG, numbered list, each in the form:

1. As an <actor>, I want a <feature>, so that <benefit>

Extremely extensive: cover every aspect of the feature. Slices reference these
by number, so the numbering is a contract — do not renumber after Slices exist.

## Implementation Decisions

The decisions already made: modules built or modified and their interfaces,
technical clarifications from the developer, architectural decisions, schema
changes, API contracts, specific interactions.

No file paths, no code snippets — they go stale fast. Exception: a prototype
snippet that encodes a decision more precisely than prose can (state machine,
reducer, schema, type shape); inline the decision-rich part and note it came
from a prototype.

## Module design

The deep modules this effort builds or modifies, one line each: the module, its
interface (what it takes and what it returns), whether it is new or deepened,
and **whether it gets tests**. Say explicitly which modules are not
unit-testable (prose, skills, infra) and how they are covered instead.

- **<module>** (new | existing, deepened): interface in one line. Tested / not
  tested, and why.

## Testing Decisions

What makes a good test here (external behaviour through the public interface,
never implementation details), which modules are tested, and prior art in the
codebase for each kind of test.

## Out of Scope

What is deliberately not part of this Spec.

## Further Notes

Anything else: rollout order, prerequisites, related Maps or research.

</spec-template>
