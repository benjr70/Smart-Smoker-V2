---
name: team-pickup
description:
  Pick the next eligible `team`-labeled GitHub issue from the Smart Smoker V2
  GitHub Project (highest Priority field then oldest, blockers resolved, no
  other team in flight), invoke `/team-dispatch --issue <N>`, then open a PR on
  success or apply `team:failed` on failure. Designed to be fired by a Claude
  routine on cron. No arguments (besides optional --dry-run).
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
team-pickup: would-pick #<N> <title>
```

…and `exit 0`. No git or GitHub mutations.

### 4. Branch + apply lock

Fresh branch from latest master. `checkout -B` resets if a stale branch from a
prior failed fire exists.

```bash
N=<picked>
TITLE=$(gh issue view "$N" --json title --jq .title)
git fetch origin master
git checkout -B "feat/issue-$N" origin/master
gh issue edit "$N" --add-label team:in-progress
```

### 5. Delegate to /team-dispatch

Invoke the team-dispatch skill in single-issue mode:

```
/team-dispatch --issue <N>
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

Wait for the agent to return. Its final message will be one of:

- `pr-watch: PASS — all checks green at attempt <K>`
- `pr-watch: DRAFT — exhausted 10 rounds, marked draft, team:checks-failed`
- `pr-watch: ERROR — <reason>`

Whichever it is, record the result; do NOT exit team-pickup until pr-watch
returns. The §7 output block below reports both the PR URL and the pr-watch
verdict.

### 6a.2. Manual verification sweep (verifier agent, BLOCKING)

Run only when §6a.1 returned `pr-watch: PASS` (the code is final — a pr-watch
fix loop may rewrite it, so verifying earlier would produce stale evidence).
Skip when pr-watch returned DRAFT or ERROR.

Spawn a **verifier** agent to execute the PR's `## Manual verification`
checklist against the real shipped code and record the results on the PR.

Invoke via the `Agent` tool with:

- `subagent_type: verifier`
- `run_in_background: false` ← blocking
- `prompt` containing PR number, branch, repo, issue number, and these rules
  verbatim:
  1. Read the `## Manual verification` checklist from the PR body
     (`gh pr view <PR_NUM> --json body -q .body`).
  2. Verify each unchecked item **live**: execute the shipped code with its
     externals stubbed via the code's own injection points (env vars, CLI args),
     re-run the adjacent `.test.sh`/test suites, and inspect committed artifacts
     (e.g. `systemd-analyze verify` for unit files). Never spend Claude usage,
     never mutate git or GitHub state beyond this PR's body and one comment,
     never install anything on the host.
  3. Verdicts: item exercised and observed correct → **✅ pass**, tick its box
     (`- [ ]` → `- [x]`). Item requires a real deployment, a real usage window,
     or human observation → **⏭ deferred**, leave unticked. Item demonstrably
     wrong → **❌ fail**, leave unticked.
  4. Update the PR body (`gh pr edit <PR_NUM> --body-file <file>`) and post ONE
     evidence comment: one line per item — verdict, how it was exercised,
     observed result (concrete numbers/log lines, not "works").
  5. Final message (exactly):
     `manual-verify: <pass>/<total> PASS, <deferred> deferred, <fail> FAIL`

Wait for the agent to return and record its final `manual-verify:` line for the
§7 output block. On any ❌ do NOT touch labels or the PR state — CI is green and
a human reviews the PR; the FAIL line in the output block is the signal.

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
verify:   <pass>/<total> PASS, <n> deferred, <n> FAIL   (pr-watch PASS only)
```

`pr-watch` line mirrors verbatim the final message returned by the spawned
pr-watch agent in §6a.1; `verify:` mirrors the §6a.2 verifier's final
`manual-verify:` line. If §6a failed (no PR opened), omit the `pr:`,
`pr-watch:`, and `verify:` lines; if pr-watch returned DRAFT/ERROR, omit
`verify:`.

## Failure modes

- **Stale `team:in-progress` from crashed prior fire** — §1 will block all
  future fires until manually cleared. Fix:
  `gh issue edit <N> --remove-label team:in-progress`.
- **Branch `feat/issue-<N>` already exists from a prior failed fire** — §4's
  `checkout -B` resets it from `origin/master`, discarding stale work.
  Recoverable via `git reflog`.
- **Acceptance Criteria section missing from issue body** — PR body uses a
  placeholder line. PR still opens; reviewer will notice and request the
  amendment.
- **`smoke:` trailer present but says FAIL** — §6a treats as failure, routes to
  §6b. SKIPPED is acceptable (some apps have no smoke script).
- **§6a.2 manual verification reports ❌** — the PR stays open with green CI;
  the unticked box + evidence comment + `verify:` output line flag it for the
  human reviewer. No label changes, no draft conversion.
- **Network/auth flake mid-team-dispatch** — teammates may stay spawned.
  Wrapper's §6b cleans GitHub state but cannot clean teammates. Run "Clean up
  the team." manually after a §6b failure.

## Boundaries

- Never picks more than one issue per fire.
- Never invokes `scripts/ralph/*` (separate Level 6 system).
- Never modifies the parent PRD issue. Only operates on `team`-labeled child
  issues. (PRDs themselves must NOT carry the `team` label.)
- Never opens a PR if smoke did not pass or skip.
- Never exits before the §6a.1 pr-watch agent (and, on pr-watch PASS, the §6a.2
  verifier agent) returns. One fire = one issue picked, implemented, PR opened,
  CI watched to verdict, manual verification recorded on the PR.
- §6a.2 never burns Claude usage and never mutates anything beyond the PR body
  and one evidence comment.
