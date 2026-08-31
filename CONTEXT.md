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

### Product

**Serve Plan**: The during-cook planner that works backwards from a serve time:
serve time minus rest duration gives the pull-by time, compared against the ETA.
_Avoid_: schedule, timeline

**Slack**: Minutes between the pull-by time and the ETA; positive = cushion,
negative = late.

**Verdict**: The Serve Plan status derived from slack vs tolerance: `early`,
`ontrack`, `behind`, or `unknown`. _Avoid_: drift status

**Tolerance**: The user's definition of "off plan": how many minutes of slack
(either direction) before the off-schedule alert fires.

**Rest duration**: The single canonical per-cook minutes the meat rests after
pull; edited from either the Serve Plan card or the Post-Smoke rest field.
_Avoid_: restMin, rest time (as separate values)

**Wrap temp**: Global setting (Default Target Temps): probe temperature below
which the Serve Plan shows the wrap milestone until a wrap stamp is logged.
