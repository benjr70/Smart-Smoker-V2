# Smart Smoker V2

An IoT smoker controller and the autonomous agent harness that builds it.
Product terms are added as product sessions resolve them; the harness terms
below come from the AFK planning-flow effort.

## Language

### Agent harness

**Daemon**: The cron-fired agent loop (`agent-daemon`) that picks and works AFK
tickets without a human present. _Avoid_: bot, routine, cron job

**AFK ticket**: An issue the Daemon may pick up alone: labelled `AFK` and placed
in the project board with a Priority. _Avoid_: team issue, agent issue,
ready-for-agent

**HITL ticket**: An issue that only resolves through live exchange with a human;
the Daemon never picks it. _Avoid_: manual issue, human issue

**Map**: The single issue that indexes one planning effort: its Destination,
Decisions so far, Fog and Out of scope. _Avoid_: epic, PRD, tracking issue

**Decision ticket**: A child of a Map whose resolution is a decision or a fact,
not a change to the product. _Avoid_: task, story

**Frontier**: The open, unblocked, unclaimed Decision tickets of a Map.

**Fog**: In-scope questions on a Map not yet sharp enough to be a Decision
ticket. _Avoid_: backlog, TODO

**Spec**: The issue produced at a Map's Destination that Slices are cut from and
reviewed against. _Avoid_: PRD

**Slice**: A tracer-bullet implementation ticket cut from a Spec: one narrow
end-to-end path, demoable alone. _Avoid_: task, story, sub-issue

**Resolve**: The Daemon closing a Decision ticket: findings recorded, ticket
closed, Map index appended. _Avoid_: complete, finish
