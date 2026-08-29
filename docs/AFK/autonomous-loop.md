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
       └─ agent-run      one fire: reset to master, run claude --print "/afk-pickup"
            └─ /afk-pickup      ONE unit of work per fire, in priority order:
                 1. /pr-reconcile   an open PR needs attention (conflict / AFK:revise)
                 2. resume          an AFK:paused issue (usage ran out mid-run)
                 3. new pick        next eligible `AFK` issue from Project #1
                      └─ /afk-dispatch   implementer/reviewer/verifier TDD team
                      └─ PR open → /pr-watch (CI babysitter) → /pr-review (one-time code review) → manual verification
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
3. **Action** — run `agent-run` (one `/afk-pickup` fire). After a clean run
   the loop re-checks the gate immediately, so the backlog drains within a
   window.
4. **Schedule** — the **Sleep Planner** (`lib/sleep-planner.sh`) sleeps to the
   window reset and polls after waking.

`agent-run` markers steer the exceptions:

| Marker on stdout | Meaning | Daemon reaction |
| --- | --- | --- |
| `AGENT_RUN_NO_WORK=1` | queue empty or lock skip | chunked sleep with the **Work Probe** (below) — wakes early if work appears |
| `AGENT_RUN_RESET_AT=<iso>` | usage exhausted mid-run (issue paused) | sleep to that reset |
| non-zero exit, no marker | genuine failure | probe-sleep (wakeable), deaf after `AGENT_DAEMON_FAIL_CAP` (default 3) consecutive failures — bounded retry, no hot-loop |

### The Work Probe (early wake on new work)

A no-work sleep used to be deaf until the window reset — observed live
2026-07-10: a human merge 52 seconds after a no-work fire conflicted an open
PR, which then waited ~4 hours for the reset. Now the daemon sleeps in
`WORK_PROBE_INTERVAL` chunks (default 300s) and runs `lib/work-probe.sh`
between chunks — a pure `gh` sweep, **zero Claude cost**. Wake rules:

- **lock held** (`AFK:in-progress` anywhere) → never wake; a fire would just
  skip. A `gh` error on the lock read fails safe as "locked".
- **reconcile candidate** (same `pr_triage_pick` the fire runs) or a
  **`AFK:paused`** issue → wake unconditionally; afk-pickup
  deterministically acts on both.
- **new pick candidates** (open `AFK` issues with no state label) → wake only
  when the candidate set *differs* from the baseline captured when the fire
  reported no work — an issue afk-pickup already declined (open blocker, not
  in the project) cannot wake-loop the daemon; a genuinely new issue wakes it
  once.

The **Exhaustion Classifier** (`lib/exhaustion-classifier.sh`) tells an
out-of-gas event apart from a real failure: exhaustion **pauses** the issue
(`wip:` freeze commit, `AFK:in-progress → AFK:paused`, branch kept) and is
never a failure; the next window resumes it (cap 3 resumes, then
`AFK:failed`).

## One fire = one unit of work

`agent-run` hard-resets the checkout to `origin/master` (anything worth
keeping is already committed on its own branch), then runs
`claude --permission-mode bypassPermissions --print "/afk-pickup"` with the
background-task ceiling lifted (`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` — a
team dispatch routinely runs past the 600s default).

`/afk-pickup` then does exactly one of the following, in priority order:

1. **Reconcile** an open PR needing attention (§1.2) — see below. A human
   waiting on their own review outranks everything.
2. **Resume** an `AFK:paused` issue (§1.5) — in-flight work finishes before
   new work starts; the partial branch is preserved, never reset.
3. **Pick** the next eligible `AFK` issue (§2) — must be in GitHub Project
   #1, highest Priority (`P0` > `P1` > `P2`) then oldest, all `Blocked by`
   blockers closed. Dispatches a full TDD team via `/afk-dispatch`, opens a
   PR with the issue's Acceptance Criteria as a `## Manual verification`
   checklist, then drives the verification tail (next section).

`AFK:in-progress` is the repo-wide single-flight lock: any open issue holding
it makes every other fire skip.

## The verification tail (every PR, every push)

After a PR opens (and after **any** later push to it), the same tail runs
before the fire may exit:

- **`/pr-watch`** — polls CI every 60s (45 min cap per round); on red, spawns
  an implementer to fix and pushes `fix(ci):` commits (cap 10 rounds); on
  exhaustion converts the PR to draft + `AFK:checks-failed`.
- **`/pr-review`** — the **one-time** autonomous code review (afk-pickup
  §6a.1b), gated by a `<!-- pr-review-done -->` marker comment so it runs
  exactly once in a PR's life and every later tail pass skips it. Two parallel
  review axes — correctness (built-in `/code-review` at medium effort) and
  spec (diff vs. the issue's Acceptance Criteria + parent PRD: missing
  requirements, scope creep, spec mismatches) — post findings as inline review
  threads marked `<!-- pr-review-bot -->` / 🤖. The reviewer never fixes its
  own findings: when it posted any, it applies **`AFK:revise`** and the fire
  ends there — the next fire's triage routes the PR into `/pr-reconcile`, whose
  comment loop fixes the threads, replies in-thread, resolves them, drops the
  label, and re-runs this whole tail. Zero findings → straight on to manual
  verification. Best-effort by design: never pushes, never drafts the PR.
- **Manual verification sweep** — afk-pickup §6a.2 delegates the round to the
  **`/verify-pr`** harness: it parses the PR's `## Manual verification`
  checklist, boots a hermetic per-PR stack, spawns the `manual-verifier` agent
  to exercise each unchecked item **live** in a real headful browser / Electron /
  hermetic Mongo, ticks the boxes it proved, posts one evidence comment per round
  (`### Manual verification — round <M>/3`), and tears the stack down. Failures —
  and deployed-env deferrals that demand a tagged `<!-- post-deploy: … -->` spec
  the PR does not yet carry — loop an implementer (`fix(manual):` commits, cap 3
  rounds) and re-enter pr-watch, since a push stales CI. A justified DEFER (real
  hardware, human observation, or a deployed-env item whose demanded spec is
  already present) does not loop; it stays unticked for the human.

## PR reconcile (the post-review loop)

Before this existed, the flow dead-ended the moment a human left review
comments or master moved under an open PR. Now afk-pickup's §1.2 runs a
**cheap `gh` triage** (zero Claude cost when nothing needs attention) using
`lib/pr-triage.sh`:

A PR **needs attention** when it is *ours* (open, not draft, head
`feat/issue-<N>`, agent-authored) AND either:

- it carries **`AFK:revise`** — a human reviewed it and explicitly handed it
  back (this is the human→agent signal; apply it after leaving **inline**
  review comments), or `/pr-review` posted 🤖 findings and applied the label
  itself (agent→agent hand-back, same machinery), or
- its mergeable state is **`CONFLICTING`** — master moved under it (auto,
  no label needed), or
- it is **bot-incomplete** — no conflict, no label, but the bot tail never
  finished: the one-time review marker (`<!-- pr-review-done -->`) and/or any
  `Manual verification — … round` comment is missing because a prior fire
  died mid-tail. Detected by `pr_triage_enrich` (one `gh pr view --json
  comments` per otherwise-clean agent PR; fails safe toward "complete").

`AFK:revise` outranks plain conflicts, which outrank `incomplete`; oldest
first within rank. Parked PRs (`AFK:revise-failed` / `AFK:rebase-failed`)
and drafts are skipped.

This gives the pipeline its ordering invariant: **outstanding agent PRs are
finished before any new `AFK` issue is picked** — while any PR still needs
bot work (CI fix, one-time review, verification round, conflict, revise
threads), every fire goes to that PR and §2 never runs. A bot-complete PR
that merely awaits a human merge blocks nothing (work-ahead stays).

A master push leaves every open PR's mergeable state `UNKNOWN` for a few
seconds while GitHub recomputes it asynchronously. The triage scan
(`pr_triage_scan`) re-lists while any agent-shaped PR is still `UNKNOWN` (up
to ~2 min) rather than skipping a conflict the fire lands seconds after a
merge; the work probe re-checks every 5 minutes as the backstop.

The picked PR goes to **`/pr-reconcile`** (`.claude/skills/pr-reconcile/`),
which is fresh and stateless — context is rebuilt from the issue, the diff,
and the review threads (no session resume). Per fire:

1. **Rebase phase** (first, only when CONFLICTING; cap 1 attempt) — rebase
   onto `origin/master` via `lib/rebase-driver.sh`; an implementer resolves
   conflict stops in place; publish with `git push --force-with-lease` — the
   **only sanctioned force-push in the entire system**, and the lease
   guarantees a concurrent human push is never clobbered (push refused
   instead). Unresolvable → `AFK:rebase-failed` + PR comment, parked.
2. **Comment phase** (only with `AFK:revise`; cap 3 rounds) — enumerate
   unresolved review threads via `lib/thread-reconciler.sh`, spawn an
   implementer to address them, commit `fix(review): round <R>`, plain push,
   then **reply in-thread** `fixed in <sha>: <what changed>` and **resolve
   each addressed thread**. All threads done → drop `AFK:revise`.
   Exhaustion/disputes → in-thread "human triage" replies +
   `AFK:revise-failed`, parked.
3. **Verification tail** — any push staled everything, so the full pr-watch +
   manual-verification tail re-runs, **re-verifying every checklist item**
   including previously ticked ones.

During a reconcile the backing issue's label flips
`AFK:done → AFK:in-progress` (reusing the single-flight lock) and is
restored on exit — even after a crash (`agent-run` restores `AFK:done`,
never `AFK:failed`, for a crashed reconcile: the issue's work was already
done).

### Human workflow

1. Review an agent PR. Want changes? Leave **inline review comments** (not
   just a top-level comment) and apply the **`AFK:revise`** label.
2. Or do nothing: if master drifts and the PR conflicts, the next fire
   rebases it automatically.
3. The agent pushes fixes, replies to each comment with what changed,
   resolves the threads, drops the label, and re-greens CI + manual
   verification.
4. Fix missed the point? **Re-open the thread and re-apply `AFK:revise`.**
5. `AFK:rebase-failed` / `AFK:revise-failed` on a PR means the agent gave
   up — it is parked for you and will not be re-picked until the label is
   removed.

## Label taxonomy

| Label | On | Meaning |
| --- | --- | --- |
| `AFK` | issue | eligible for autonomous pickup (must also be in Project #1) |
| `AFK:in-progress` | issue | single-flight lock — a fire is working it (or reconciling its PR) |
| `AFK:paused` | issue | usage ran out mid-run; branch kept; resumes next window |
| `AFK:done` | issue | implemented; PR open/merged |
| `AFK:failed` | issue | dispatch failed or resume cap hit; human triage |
| `AFK:checks-failed` | PR | CI or manual verification could not be brought to pass (fix loops exhausted); PR is drafted |
| `AFK:revise` | PR | hand-back: address the unresolved review comments — applied by a **human** review or by **`/pr-review`** (its 🤖 findings) |
| `AFK:revise-failed` | PR | revise loop exhausted (3 rounds) or disputed; parked |
| `AFK:rebase-failed` | PR | auto-rebase failed (conflicts unresolvable or lease refused); parked |

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
| `lib/review-poster.sh` | render/post marked inline review comments, agent-thread filter, done-marker |
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
  300); `AGENT_DAEMON_FAIL_CAP=<n>` the consecutive-failure cap before the
  failure path sleeps deaf to the reset (default 3).
- **Stuck lock** — a crashed fire normally cleans up after itself
  (`fail_inflight`); if not: `gh issue edit <N> --remove-label
  AFK:in-progress`.
- **Pause the whole loop** — `sudo systemctl stop agent-daemon` (start again
  to resume). Individual work items are parked by their labels instead;
  `AFK:paused` is the per-issue out-of-gas state, not a loop switch.

## Related

- [Agent Teams overview](index.md) — the dispatch/roles system a fire drives
- [Dispatch](dispatch.md) — `/afk-dispatch` playbook and hooks
- [Claude Agent VM](../CI-CD/claude-agent-vm.md) — host setup
- Skills: `.claude/skills/afk-pickup/`, `pr-watch/`, `pr-review/`,
  `pr-reconcile/`, `afk-dispatch/` — the authoritative playbooks
