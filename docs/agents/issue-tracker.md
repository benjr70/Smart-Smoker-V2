# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by the repo-local `/wayfinder`, `/to-spec` and `/to-tickets` forks in `.claude/skills/`. The **map** is a single issue with **child** issues as tickets; a **Spec** is a child of the map, and **Slices** are children of the Spec.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
- **Sub-issue**: `gh api -X POST repos/benjr70/Smart-Smoker-V2/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>` — `/to-spec` adds the Spec under its map, `/to-tickets` adds every Slice under the Spec. Like dependencies, the payload takes the numeric **database id**.
- **Labels**: `/wayfinder` tickets carry `wayfinder:<type>` plus `AFK` (research, human-free task) or `HITL` (grilling, prototype). A Spec carries `spec` and never `AFK`. Slices carry `AFK` or `HITL`. `/to-tickets` §5 bootstraps `AFK`, `HITL`, `spec` and the `AFK:*` family idempotently with `gh label create --force`.
- **Project and Priority**: every `AFK` ticket or Slice is added to Project #1 (`gh project item-add 1 --owner benjr70 --url <issue-url>`) and given a `Priority` single-select value — wayfinder tickets default `P1`, Slices default `P2`, quizzed once per batch. `HITL` issues are never projected: project membership is the Daemon's pick signal.

## Smart Smoker additions

- Tickets meant for the autonomous daemon carry the `AFK` label **and** must be added to GitHub Project #1 (`Smart Smoker V2`) with a `Priority` (P0/P1/P2; default P2, wayfinder research P1). Project membership is the pick signal; `/afk-pickup` skips un-projected issues.
- Blocking is native issue dependencies only — no `Blocked by #N` body text is parsed. Slice bodies still carry a `## Blocked by` section, but it is an informational name mirror (`- [title](url)`) for human readers.
