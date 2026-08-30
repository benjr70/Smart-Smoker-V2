# Research: docs-only PR auto-merge on master

Ticket: [#577](https://github.com/benjr70/Smart-Smoker-V2/issues/577) (part of map #575).
Probed live on 2026-08-29 as `benjr70` (repo admin) with `gh`.

## TL;DR

- `gh pr merge --auto --squash` **does not work today**: the repo has
  `allow_auto_merge: false`, and master's branch protection requires **1
  approving review from a code owner** (`* @benjr70`), which the PR author
  cannot self-supply. Auto-merge would arm and then wait forever for a human
  approval, so it buys nothing over the status quo.
- The two required status checks ("Hermetic journey suite", "Conventional PR
  title") are both satisfiable by a docs-only PR: the e2e gate has a
  path-complement "skip" twin that reports green instantly, and the title lint
  passes any conventional title (`docs(research): ...` verified locally).
- Three viable paths, in increasing blast radius:
  1. **Admin merge from the harness** — `gh pr merge --squash --admin` works
     right now because `enforce_admins` is off; requires the merging identity to
     be an admin (the harness already runs as `benjr70` via `RUNNER_PAT`).
  2. **Enable auto-merge + a bot approval** — flip `allow_auto_merge` (one
     `gh api -X PATCH`), then have a *different* identity (a GitHub App or a
     second PAT) approve docs-only PRs; `--auto --squash` then merges when
     checks go green.
  3. **Carve docs out of the review requirement** — not possible with classic
     branch protection (one rule applies to the whole branch); would need a
     ruleset with a bypass actor, or dropping `require_code_owner_reviews` and
     making `CODEOWNERS` cover everything *except* `docs/research/**`.
- Docs-only detection: `git diff --name-only <base>...HEAD` piped through a
  `grep -v '^docs/research/'` emptiness test (snippet in section 5).

## 1. What protects `master` today (live probe)

`gh api repos/benjr70/Smart-Smoker-V2/branches/master/protection` (2026-08-29):

| Setting | Value |
| --- | --- |
| `required_status_checks.contexts` | `Hermetic journey suite`, `Conventional PR title` (both `app_id` 15368 = GitHub Actions) |
| `required_status_checks.strict` | `false` (branch need not be up to date with master) |
| `required_pull_request_reviews.required_approving_review_count` | `1` |
| `required_pull_request_reviews.require_code_owner_reviews` | `true` |
| `required_pull_request_reviews.dismiss_stale_reviews` | `true` |
| `enforce_admins.enabled` | `false` |
| `required_linear_history`, `required_conversation_resolution`, `required_signatures` | all disabled |

- `gh api repos/.../rulesets` → `[]` and `gh api repos/.../rules/branches/master` → `[]`: **no rulesets**, classic branch protection only.
- Repo merge settings (`gh api repos/benjr70/Smart-Smoker-V2`):
  `allow_auto_merge: false`, `allow_squash_merge: true`, `allow_merge_commit: false`,
  `allow_rebase_merge: false`, `squash_merge_commit_title: COMMIT_OR_PR_TITLE`,
  `squash_merge_commit_message: COMMIT_MESSAGES`, `delete_branch_on_merge: false`.
- `.github/CODEOWNERS`: `* @benjr70` — every path has a code owner, so
  `require_code_owner_reviews` means **benjr70 must approve every PR**.
- Collaborators: `benjr70` (admin), `N-Rolf`, `atkirschenman` (non-admin).

### Consequences per GitHub docs

- "Pull request authors cannot approve their own pull requests." ([Approving a
  pull request with required reviews](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews))
  → a PR opened by `benjr70` (what the harness does today; recent
  chore PRs #491/#497 were opened and merged by benjr70) cannot be approved
  by benjr70, so the review requirement is only satisfiable by admin bypass.
- "any pull request that affects code with a code owner must be approved by
  that code owner before the pull request can be merged into the protected
  branch." ([About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches))
- "By default, the restrictions of a branch protection rule don't apply to
  people with admin permissions to the repository" (same doc) — this is why
  `enforce_admins: false` lets benjr70 (or a PAT for benjr70) merge with
  `--admin`.
- Required checks must be "successful, skipped, or neutral" (same doc), and a
  workflow skipped by path filtering leaves its check "Pending" and "A pull
  request that requires those checks to be successful will be blocked from
  merging." ([Workflow syntax → paths](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions)).
  The repo already handles this: `.github/workflows/e2e-pr-gate-skip.yml`
  runs the same job name `Hermetic journey suite` on the `paths-ignore`
  complement of `e2e-pr-gate.yml`'s `paths` (`apps/**`, `packages/**`,
  `e2e/**`, Dockerfiles, compose files, `package.json`, lockfile). A diff
  confined to `docs/research/**` triggers only the skip twin → green in
  seconds.

## 2. Does `gh pr merge --auto --squash` work?

- `gh pr merge --auto`: "Automatically merge only after necessary requirements
  are met"; `--admin`: "Use administrator privileges to merge a pull request
  that does not meet requirements" ([gh pr merge manual](https://cli.github.com/manual/gh_pr_merge)).
- Auto-merge prerequisites: "Before you use auto-merge, it must be enabled for
  the repository" and it "merges a pull request automatically after all
  required reviews and status checks pass"; "People with write permissions to a
  repository can enable auto-merge for a pull request." ([Automatically merging
  a pull request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/automatically-merging-a-pull-request))
- Enabling is a single admin call: `gh api -X PATCH repos/benjr70/Smart-Smoker-V2 -F allow_auto_merge=true`
  (`allow_auto_merge`: "Either true to allow auto-merge on pull requests, or
  false to disallow auto-merge", default false — [REST: Update a repository](https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#update-a-repository)).

**Verdict:** with the current settings `--auto` fails immediately (auto-merge
not enabled). After enabling it, `--auto --squash` arms correctly but the PR
still waits on a code-owner approval that the author cannot give. Auto-merge is
only useful if some *other* identity approves docs-only PRs. Note also that
auto-merge "is disabled if someone without write permissions pushes new changes
to the head branch or switches the base branch" — not a concern for
harness-authored branches.

`--squash` itself is fine: squash is the only allowed merge method, and
`squash_merge_commit_title: COMMIT_OR_PR_TITLE` means the PR title becomes the
squash subject.

## 3. Interplay with release-please and the title lint

- `.github/workflows/pr-title-lint.yml` job `Conventional PR title` runs
  `scripts/validate-pr-title.sh "$PR_TITLE"` on every `pull_request`
  opened/edited/synchronize/reopened against master; it is one of the two
  required contexts. It has no path filter, so it always reports.
  `bash scripts/validate-pr-title.sh "docs(research): docs-only PR auto-merge on master (#577)"` → `PR title OK`.
- `.github/workflows/release-please.yml` (manifest mode, node release-type,
  auth `RUNNER_PAT`) reads the Conventional Commits prefix of each squash
  subject. Per the workflow header: "a run whose commits are only
  chore/docs/ci/refactor produces no release PR at all". So a `docs(...)`
  squash on master **does not bump the version or open/alter a release PR** —
  it only lands in the next release's CHANGELOG if a releasable commit later
  arrives. (Default release-please bump rules: feat→minor, fix→patch,
  `!`/BREAKING→major.)
- Merging a `docs:` PR while a release PR is open is safe: release-please
  regenerates the release PR on the next master push; no lockstep
  `extra-files` are touched by docs.

**Requirement for any auto-merge path:** the docs PR title must use the `docs`
type (e.g. `docs(research): <topic> (#N)`), which the existing validator
accepts and which never triggers a release.

## 4. How the harness merges today

`grep -rn "pr merge" scripts/claude-agent .claude/skills .claude/agents` →
**no hits**. The harness never merges: `scripts/claude-agent/lib/pr-triage.sh`
and `work-probe.sh` only read `mergeable` to detect `CONFLICTING` PRs, and
`pr-reconcile`/`pr-watch`/`pr-review` leave the PR for a human. So a docs-only
auto-merge would be the **first** place the harness merges anything — keep it
narrow.

## 5. Recommended recipe (no repo scripts modified here)

Preferred: admin merge, gated on a strict docs-only diff, PR authored by the
harness (`RUNNER_PAT` = benjr70, admin, so `--admin` is honoured because
`enforce_admins` is off):

```bash
#!/usr/bin/env bash
# Merge a PR only if every changed path is under docs/research/.
set -euo pipefail
PR="$1"; REPO="benjr70/Smart-Smoker-V2"
BASE="$(gh pr view "$PR" --repo "$REPO" --json baseRefName --jq .baseRefName)"
git fetch -q origin "$BASE"
# three-dot: changes on HEAD since the merge-base with the base branch only
changed="$(git diff --name-only "origin/${BASE}...HEAD")"
[ -n "$changed" ] || { echo "empty diff"; exit 1; }
if printf '%s\n' "$changed" | grep -qv '^docs/research/'; then
  echo "not docs-only:"; printf '%s\n' "$changed" | grep -v '^docs/research/'; exit 1
fi
head_sha="$(git rev-parse HEAD)"
# Wait for the two required checks, then merge with admin bypass, pinned to the
# SHA we just inspected so a later push cannot slip past the diff check.
gh pr checks "$PR" --repo "$REPO" --watch --required
gh pr merge "$PR" --repo "$REPO" --squash --admin --match-head-commit "$head_sha"
```

Notes on the snippet:
- `git diff --name-only A...B` (three dots) diffs from the merge-base, so
  files changed on master since the branch point are not counted — the
  two-dot form would misreport a stale branch as "not docs-only".
- Renames: `--name-only` lists the new path; add `--no-renames` so a rename
  *out of* `docs/research/` shows both a deletion and an addition and cannot
  pass as docs-only.
- `--match-head-commit` (gh: "Commit SHA that the pull request head must match
  to allow merge") closes the TOCTOU gap between the diff check and the merge.
- Server-side alternative for the file list, no checkout needed:
  `gh pr view "$PR" --json files --jq '.files[].path'`.

Alternative if the maintainer prefers **not** to hand the harness admin-merge
power: enable `allow_auto_merge`, create a GitHub App (or second PAT) with
write access whose only job is `gh pr review --approve` on PRs whose diff
passes the same check, then `gh pr merge --auto --squash`. The review
requirement is then met by a non-author identity and GitHub performs the
merge when both checks are green. This costs one more secret and an app
install, but keeps `--admin` out of scripts.

## Sources

- Live: `gh api repos/benjr70/Smart-Smoker-V2/branches/master/protection`, `.../rulesets`, `.../rules/branches/master`, `gh api repos/benjr70/Smart-Smoker-V2` (2026-08-29).
- Repo files: `.github/workflows/pr-title-lint.yml`, `.github/workflows/e2e-pr-gate.yml`, `.github/workflows/e2e-pr-gate-skip.yml`, `.github/workflows/release-please.yml`, `release-please-config.json`, `.github/CODEOWNERS`, `scripts/validate-pr-title.sh`, `scripts/claude-agent/lib/pr-triage.sh`.
- GitHub docs: [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches); [Approving a pull request with required reviews](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews); [Automatically merging a pull request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/automatically-merging-a-pull-request); [Workflow syntax — paths / pending checks](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions); [REST: Update a repository — allow_auto_merge](https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#update-a-repository); [gh pr merge](https://cli.github.com/manual/gh_pr_merge).
