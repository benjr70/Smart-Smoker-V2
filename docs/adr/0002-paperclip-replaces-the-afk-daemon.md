---
status: proposed
---

# Paperclip executes AFK Slices; GitHub issues are mirrored into its tasks

The cron-fired bash Daemon (`scripts/claude-agent/`, `/afk-pickup` →
`/afk-dispatch`) picked AFK Slices off GitHub Project #1 and worked them on a
VM. It had no verification step a human could trust, and the harness around it
once wiped its own host. It is retired as the executor. AFK work now runs on a
self-hosted Paperclip board: a Developer agent implements test-first and opens
the PR, then a Code Reviewer and a QA Engineer (Playwright against the hermetic
e2e stack) verify it in parallel, and the Developer fixes or hands it to a human
for merge.

Planning stays in GitHub (`/wayfinder` → `/to-spec` → `/to-tickets`), because
that is where the Map, Spec, Slices, native dependencies and Priority already
live and where humans read them. The bridge is one idempotent script,
`scripts/paperclip/mirror-slices.sh`, which upserts one Paperclip task per
Slice (identity: a `Source: <issue url>` first line), assigns AFK Slices to the
Developer and HITL Slices to the human, mirrors the GitHub blocked-by edges as
Paperclip blockers, and marks tasks done when their issue closes. Paperclip's
own semantics do the dispatching: a task assigned to an agent is woken on
creation, its wake is suppressed while blockers are open, and it is re-woken
when the last blocker is done. Merging is the human's gate, so closing follows
the merge (`Closes #N` → issue closed → next mirror run → task done →
dependents wake from a fresh `master`).

## Considered Options

- **A manager/orchestrator agent that assigns tasks to the Developer**:
  rejected. Paperclip already queues wakes per assignee, orders them by
  dependency readiness and priority, and replays them when a run finishes. An
  LLM dispatcher would re-implement that loop at token cost and add a failure
  mode.
- **A scheduled Paperclip routine that polls GitHub**: deferred. The VM is
  tailnet-only, so GitHub webhooks cannot reach it, and a routine runs as an
  agent rather than a script. The mirror script is callable from a timer later
  if re-running it by hand after each merge proves tiresome.
- **Planning inside Paperclip (plan documents, conversation tasks)**:
  rejected. It would split the Map/Spec/Slice record across two tools and drop
  the GitHub-native dependency and sub-issue graph the skills already build.
