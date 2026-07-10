# Autonomous Loop

The always-on pipeline that turns triaged GitHub issues into merged-ready PRs
with no human in the loop until review time. It runs on the
[Claude Agent VM](../CI-CD/claude-agent-vm.md) as a systemd daemon, paces
itself by Claude budget (not by clock), and covers the **full PR lifecycle**:
pick → implement → PR → CI green → manual verification → and, after a human
reviews, fixing review comments and merge conflicts autonomously.

```
systemd (agent-daemon.service, Restart=always)
  └─ agent-daemon        bash loop: budget gate → fire → sleep plan
       └─ agent-run      one fire: reset to master, run claude --print "/team-pickup"
            └─ /team-pickup      ONE unit of work per fire, in priority order:
                 1. /pr-reconcile   an open PR needs attention (conflict / team:revise)
                 2. resume          a team:paused issue (usage ran out mid-run)
                 3. new pick        next eligible `team` issue from Project #1
                      └─ /team-dispatch   implementer/reviewer/verifier TDD team
                      └─ PR open → /pr-watch (CI babysitter) → manual verification
```

## The daemon (pacing)

`scripts/claude-agent/agent-daemon` is a supervisor loop, installed as
`infra/systemd/agent-daemon.service` on the VM. Each pass:

1. **Sensor** — the **Usage Sensor** (`lib/usage-sensor.sh`) reads the
   account's REAL utilization — session (5-hour) and weekly limits, the same
   numbers the Claude usage UI shows — from the OAuth usage endpoint, using
   the token Claude Code already maintains in `~/.claude/.credentials.json`.
   If the endpoint is unreachable it falls back to the local
   `ccusage blocks --json` time-proxy (**Budget Gate**, `lib/budget-gate.sh`),
   which only knows the percent of *time* left in an inferred window. The
   journal line carries `sensor=oauth|ccusage-fallback|degraded`.
2. **Decision** — fire when `remainPct ≥ BUDGET_GATE_MIN_PCT` (default 25),
   where `remainPct` is 100 minus the **binding** (worst) limit's
   utilization — a spent weekly wall blocks firing even in a fresh session
   window, and `resetAt` is the binding limit's true reset. The gate is
   plan-agnostic: upgrade the Claude plan and the same threshold just trips
   more often.
3. **Action** — run `agent-run` (one `/team-pickup` fire). After a clean run
   the loop re-checks the gate immediately, so the backlog drains within a
   window.
4. **Schedule** — the **Sleep Planner** (`lib/sleep-planner.sh`) sleeps to the
   window reset and polls after waking.

`agent-run` markers steer the exceptions:

| Marker on stdout | Meaning | Daemon reaction |
| --- | --- | --- |
| `AGENT_RUN_NO_WORK=1` | queue empty or lock skip | chunked sleep with the **Work Probe** (below) — wakes early if work appears |
| `AGENT_RUN_RESET_AT=<iso>` | usage exhausted mid-run (issue paused) | sleep to that reset |
| non-zero exit, no marker | genuine failure | sleep out the window (no hot-loop) |

### The Work Probe (early wake on new work)

A no-work sleep used to be deaf until the window reset — observed live
2026-07-10: a human merge 52 seconds after a no-work fire conflicted an open
PR, which then waited ~4 hours for the reset. Now the daemon sleeps in
`WORK_PROBE_INTERVAL` chunks (default 900s) and runs `lib/work-probe.sh`
between chunks — a pure `gh` sweep, **zero Claude cost**. Wake rules:

- **lock held** (`team:in-progress` anywhere) → never wake; a fire would just
  skip. A `gh` error on the lock read fails safe as "locked".
- **reconcile candidate** (same `pr_triage_pick` the fire runs) or a
  **`team:paused`** issue → wake unconditionally; team-pickup
  deterministically acts on both.
- **new pick candidates** (open `team` issues with no state label) → wake only
  when the candidate set *differs* from the baseline captured when the fire
  reported no work — an issue team-pickup already declined (open blocker, not
  in the project) cannot wake-loop the daemon; a genuinely new issue wakes it
  once.

The **Exhaustion Classifier** (`lib/exhaustion-classifier.sh`) tells an
out-of-gas event apart from a real failure: exhaustion **pauses** the issue
(`wip:` freeze commit, `team:in-progress → team:paused`, branch kept) and is
never a failure; the next window resumes it (cap 3 resumes, then
`team:failed`).

## One fire = one unit of work

`agent-run` hard-resets the checkout to `origin/master` (anything worth
keeping is already committed on its own branch), then runs
`claude --permission-mode bypassPermissions --print "/team-pickup"` with the
background-task ceiling lifted (`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` — a
team dispatch routinely runs past the 600s default).

`/team-pickup` then does exactly one of the following, in priority order:

1. **Reconcile** an open PR needing attention (§1.2) — see below. A human
   waiting on their own review outranks everything.
2. **Resume** a `team:paused` issue (§1.5) — in-flight work finishes before
   new work starts; the partial branch is preserved, never reset.
3. **Pick** the next eligible `team` issue (§2) — must be in GitHub Project
   #1, highest Priority (`P0` > `P1` > `P2`) then oldest, all `Blocked by`
   blockers closed. Dispatches a full TDD team via `/team-dispatch`, opens a
   PR with the issue's Acceptance Criteria as a `## Manual verification`
   checklist, then drives the verification tail (next section).

`team:in-progress` is the repo-wide single-flight lock: any open issue holding
it makes every other fire skip.

## The verification tail (every PR, every push)

After a PR opens (and after **any** later push to it), the same two-stage tail
runs before the fire may exit:

- **`/pr-watch`** — polls CI every 60s (45 min cap per round); on red, spawns
  an implementer to fix and pushes `fix(ci):` commits (cap 10 rounds); on
  exhaustion converts the PR to draft + `team:checks-failed`.
- **Manual verification sweep** — a verifier agent executes the PR's
  `## Manual verification` checklist **live** (runs the shipped code with its
  externals stubbed, re-runs adjacent test suites, inspects artifacts), ticks
  the boxes it proved, and posts one evidence comment per round
  (`### Manual verification — round <M>/3`). Failures loop an implementer
  (`fix(manual):` commits, cap 3 rounds) and re-enter pr-watch, since a push
  stales CI. Deferred items must name the concrete precondition (deploy
  window, real hardware, human observation) — an unjustified deferral counts
  as a failure.

## PR reconcile (the post-review loop)

Before this existed, the flow dead-ended the moment a human left review
comments or master moved under an open PR. Now team-pickup's §1.2 runs a
**cheap `gh` triage** (zero Claude cost when nothing needs attention) using
`lib/pr-triage.sh`:

A PR **needs attention** when it is *ours* (open, not draft, head
`feat/issue-<N>`, agent-authored) AND either:

- it carries **`team:revise`** — a human reviewed it and explicitly handed it
  back (this is the human→agent signal; apply it after leaving **inline**
  review comments), or
- its mergeable state is **`CONFLICTING`** — master moved under it (auto,
  no label needed).

`team:revise` outranks plain conflicts; oldest first within rank. Parked PRs
(`team:revise-failed` / `team:rebase-failed`) and drafts are skipped.

A master push leaves every open PR's mergeable state `UNKNOWN` for a few
seconds while GitHub recomputes it asynchronously. The triage scan
(`pr_triage_scan`) re-lists while any agent-shaped PR is still `UNKNOWN` (up
to ~2 min) rather than skipping a conflict the fire lands seconds after a
merge; the work probe re-checks every 15 minutes as the backstop.

The picked PR goes to **`/pr-reconcile`** (`.claude/skills/pr-reconcile/`),
which is fresh and stateless — context is rebuilt from the issue, the diff,
and the review threads (no session resume). Per fire:

1. **Rebase phase** (first, only when CONFLICTING; cap 1 attempt) — rebase
   onto `origin/master` via `lib/rebase-driver.sh`; an implementer resolves
   conflict stops in place; publish with `git push --force-with-lease` — the
   **only sanctioned force-push in the entire system**, and the lease
   guarantees a concurrent human push is never clobbered (push refused
   instead). Unresolvable → `team:rebase-failed` + PR comment, parked.
2. **Comment phase** (only with `team:revise`; cap 3 rounds) — enumerate
   unresolved review threads via `lib/thread-reconciler.sh`, spawn an
   implementer to address them, commit `fix(review): round <R>`, plain push,
   then **reply in-thread** `fixed in <sha>: <what changed>` and **resolve
   each addressed thread**. All threads done → drop `team:revise`.
   Exhaustion/disputes → in-thread "human triage" replies +
   `team:revise-failed`, parked.
3. **Verification tail** — any push staled everything, so the full pr-watch +
   manual-verification tail re-runs, **re-verifying every checklist item**
   including previously ticked ones.

During a reconcile the backing issue's label flips
`team:done → team:in-progress` (reusing the single-flight lock) and is
restored on exit — even after a crash (`agent-run` restores `team:done`,
never `team:failed`, for a crashed reconcile: the issue's work was already
done).

### Human workflow

1. Review an agent PR. Want changes? Leave **inline review comments** (not
   just a top-level comment) and apply the **`team:revise`** label.
2. Or do nothing: if master drifts and the PR conflicts, the next fire
   rebases it automatically.
3. The agent pushes fixes, replies to each comment with what changed,
   resolves the threads, drops the label, and re-greens CI + manual
   verification.
4. Fix missed the point? **Re-open the thread and re-apply `team:revise`.**
5. `team:rebase-failed` / `team:revise-failed` on a PR means the agent gave
   up — it is parked for you and will not be re-picked until the label is
   removed.

## Label taxonomy

| Label | On | Meaning |
| --- | --- | --- |
| `team` | issue | eligible for autonomous pickup (must also be in Project #1) |
| `team:in-progress` | issue | single-flight lock — a fire is working it (or reconciling its PR) |
| `team:paused` | issue | usage ran out mid-run; branch kept; resumes next window |
| `team:done` | issue | implemented; PR open/merged |
| `team:failed` | issue | dispatch failed or resume cap hit; human triage |
| `team:checks-failed` | PR | CI or manual verification could not be brought to pass (fix loops exhausted); PR is drafted |
| `team:revise` | PR | **human hand-back**: address my review comments |
| `team:revise-failed` | PR | revise loop exhausted (3 rounds) or disputed; parked |
| `team:rebase-failed` | PR | auto-rebase failed (conflicts unresolvable or lease refused); parked |

## Testing

Every deep module is a sourceable bash lib with a sibling `.test.sh`
(stub-injected `GH_BIN`/`GIT_BIN`/`CLAUDE_BIN`/clock; the rebase driver runs
against real throwaway git repositories because rebase/lease semantics are the
behavior under test). CI runs all suites (`scripts/claude-agent/**.test.sh`)
on every PR.

| Module | Job |
| --- | --- |
| `lib/usage-sensor.sh` | fire-vs-wait from real OAuth session/weekly utilization |
| `lib/budget-gate.sh` | fallback fire-vs-wait from ccusage window time % |
| `lib/sleep-planner.sh` | sleep-to-reset + post-wake poll plan |
| `lib/exhaustion-classifier.sh` | OK / EXHAUSTED / FAILED + reset scrape |
| `lib/pause-resume.sh` | resume vs fail (cap) for paused issues |
| `lib/pr-triage.sh` | which PR needs reconciling (ours-filter, rank, order) |
| `lib/work-probe.sh` | mid-sleep "did work appear?" scan + wake decision |
| `lib/thread-reconciler.sh` | unresolved-thread enum, in-thread reply, resolve |
| `lib/rebase-driver.sh` | rebase / continue / abort / force-with-lease push |

## Operational notes

- **Deploying loop changes** — skills and libs are read fresh each fire
  (`agent-run` resets to `origin/master`), so merging to master is the
  deploy. Only `agent-daemon`/`budget-gate`/`sleep-planner` changes need a
  daemon reload: `kill -9 <MainPID>` (sudo-free; `Restart=always` respawns
  with the new code).
- **Host env drop-in** — `~/.config/agent-daemon/env` (systemd
  `EnvironmentFile`) survives the per-fire reset; it carries
  `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` and any `GH_TOKEN`.
  `WORK_PROBE_INTERVAL=<secs>` tunes the mid-sleep probe cadence (default
  900).
- **Stuck lock** — a crashed fire normally cleans up after itself
  (`fail_inflight`); if not: `gh issue edit <N> --remove-label
  team:in-progress`.
- **Pause the whole loop** — `sudo systemctl stop agent-daemon` (start again
  to resume). Individual work items are parked by their labels instead;
  `team:paused` is the per-issue out-of-gas state, not a loop switch.

## Related

- [Agent Teams overview](index.md) — the dispatch/roles system a fire drives
- [Dispatch](dispatch.md) — `/team-dispatch` playbook and hooks
- [Claude Agent VM](../CI-CD/claude-agent-vm.md) — host setup
- Skills: `.claude/skills/team-pickup/`, `pr-watch/`, `pr-reconcile/`,
  `team-dispatch/` — the authoritative playbooks
