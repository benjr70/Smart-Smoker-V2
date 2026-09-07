# What CI actually runs on a Dependabot PR here, and how to tell a security PR apart

Ticket: [#640](https://github.com/benjr70/Smart-Smoker-V2/issues/640) (part of
wayfinder map
[#639](https://github.com/benjr70/Smart-Smoker-V2/issues/639) —
Map: Dependabot PRs verified, fixed and landed by the Daemon). Researched on 2026-09-07.

Sources: every file under `.github/workflows/` (33 files, read on master
`9f7ab8e`); repo branch protection via
`gh api repos/benjr70/Smart-Smoker-V2/branches/master/protection`; live probes
of PRs #635, #636, #637 and the one merged Dependabot PR #571 (`gh pr view`,
`gh pr checks`, `gh run list`, `gh api .../actions/runs/<id>`,
`.../issues/<n>/timeline`); Dependabot alerts via REST
`GET /repos/{owner}/{repo}/dependabot/alerts` and GraphQL
`repository.vulnerabilityAlert(number:).dependabotUpdate`; GitHub docs
[Troubleshooting Dependabot on GitHub Actions](https://docs.github.com/en/code-security/dependabot/troubleshooting-dependabot/troubleshooting-dependabot-on-github-actions),
[Automating Dependabot with GitHub Actions](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/automating-dependabot-with-github-actions),
[About Dependabot security updates](https://docs.github.com/en/code-security/dependabot/dependabot-security-updates/about-dependabot-security-updates),
[Dependabot options reference](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference);
source of `dependabot/fetch-metadata`
([`update_metadata.ts`](https://raw.githubusercontent.com/dependabot/fetch-metadata/main/src/dependabot/update_metadata.ts),
[`verified_commits.ts`](https://raw.githubusercontent.com/dependabot/fetch-metadata/main/src/dependabot/verified_commits.ts)).

## TL;DR

- **Both required checks run and report green on Dependabot PRs.**
  `Hermetic journey suite` (E2E PR Gate) and `Conventional PR title` (PR Title
  Lint) passed on #635, #636 and #637; neither workflow reads a secret.
- **Only four workflows fire on a typical Dependabot PR**: PR Title Lint, Docs
  Freshness, E2E PR Gate, Docker Build (PR). All four passed on all three live
  PRs. Nothing was skipped by an `if:` — no workflow in this repo conditions on
  `github.actor` / `dependabot`, and none uses `pull_request_target`.
- **The big gap is path filters, not secrets.** A security bump of a transitive
  npm dep touches only the root `package-lock.json`, and `ci-tests.yml` (unit
  tests, coverage, lint, typecheck, build validation) does **not** list that
  path — so "CI - Tests and Build Validation" never ran on #635/#636/#637. Tier
  A "all CI green" therefore means *no unit tests ran* unless the PR also edits
  a `package.json`.
- **Secrets are a non-issue for what runs today.** None of the four PR-path
  workflows references `secrets.*`; `docker-build-pr` builds with `push: false`
  and no registry login. The read-only `GITHUB_TOKEN` did **not** block the
  `pull-requests: write` comment steps (Docs Freshness upserted its comment on
  #636 successfully) because a job-level `permissions:` block elevates it.
  `RUNNER_PAT`, `TF_API_TOKEN`, `DOCKERHUB_*`, `SSH_PRIVATE_KEY` are only read
  by push/dispatch/schedule/`workflow_call` workflows that a PR never triggers.
- **Security-PR signal, ranked:** (1) GraphQL
  `vulnerabilityAlert(number:N).dependabotUpdate.pullRequest.number` is the
  authoritative link (alert → PR; verified for all seven open alerts behind the
  three PRs); (2) the PR body's footer line *"You can disable automated
  security fix PRs for this repo from the Security Alerts page"* is a
  PR-side marker present on every security PR; (3) labels are **not** a
  signal — security PRs carry only `dependencies` + `javascript`, same as a
  version update. There is **no `.github/dependabot.yml`** in the repo;
  security updates come from the repo setting
  `dependabot_security_updates: enabled`, so every Dependabot PR here is a
  security PR today.

## Per-workflow table

"Dependabot PR" below means the real shape seen live: author `app/dependabot`
(`github.actor` = `dependabot[bot]`), base `master`, event `pull_request`, diff
= root `package-lock.json` only (#635, #636, #637; verified with
`gh pr view <n> --json files`). Effect-of-missing-secret is what would happen
if the workflow *did* run on a Dependabot PR.

| Workflow file | `name:` | Trigger(s) | On a Dependabot PR | `secrets.*` referenced | If secret missing | Live evidence (#636 branch) |
| --- | --- | --- | --- | --- | --- | --- |
| `pr-title-lint.yml` | PR Title Lint | `pull_request` (opened/edited/synchronize/reopened) + push master paths | **Runs** — job `Conventional PR title` (required) + `Validator self-tests` | none | n/a | run 33573532872 success |
| `e2e-pr-gate.yml` | E2E PR Gate | `pull_request` paths incl. `package-lock.json` | **Runs** — job `Hermetic journey suite` (required); `permissions: contents: read` | none | n/a | run 33573532875 success (8m42s) |
| `e2e-pr-gate-skip.yml` | E2E PR Gate (skip) | `pull_request` `paths-ignore` complement | Not triggered (lockfile is in the ignore list); would report the same required-check name green on a non-code PR | none | n/a | no run on #636; ran on #571 (scripts/smoke lockfile) |
| `docs-freshness.yml` | Docs Freshness | `pull_request` (no paths) | **Runs**; `pull-requests: write` job permission; comment upsert succeeded | none | n/a | run 33573532838 success, all 9 steps success |
| `docker-build-pr.yml` | Docker Build (PR) | `pull_request` paths incl. `package-lock.json`, `apps/*/package.json` | **Runs** — `build (backend/device-service/frontend/smoker)` advisory `push: false`, plus blocking `device-service-armv7` | none (no registry login) | n/a | run 33573532882 success (armv7 6m1s) |
| `ci-tests.yml` | CI - Tests and Build Validation | `pull_request` paths: `apps/**`, `packages/**`, `package.json`, `**/package.json`, `.github/workflows/**`, docs/config lists — **not** root `package-lock.json` | **Not triggered** for lockfile-only bumps; triggers if Dependabot also edits any `package.json` (as #571 did) | none (`report-results` uses `GITHUB_TOKEN` with `pull-requests: write`) | n/a | no run on #635/#636/#637; 1 run on #571 |
| `claude-agent-tests.yml` | Claude Agent Tests | `pull_request`/push paths `scripts/claude-agent/**` | Not triggered | none | n/a | no run |
| `harness-runbook.yml` | Harness Runbook Check | `pull_request`/push paths (skills, verify-pr scripts) | Not triggered | none | n/a | no run |
| `pr-screenshots-tests.yml` | PR Screenshot Tour Tests | `pull_request`/push paths `scripts/pr-images/**` etc. | Not triggered | none | n/a | no run |
| `release-config-tests.yml` | Release Config Tests | `pull_request`/push paths (release-please files) | Not triggered | none | n/a | no run |
| `ansible-lint.yml` | Ansible Lint | push/`pull_request` paths `infra/proxmox/ansible/**` | Not triggered (npm ecosystem never touches it) | none | n/a | no run |
| `terraform-validate.yml` | Terraform Validation | push/`pull_request` paths `infra/proxmox/terraform/**` | Not triggered | none | n/a | no run |
| `terraform-plan.yml` | Terraform Plan (PR) | `pull_request` paths `infra/proxmox/terraform/**`; self-hosted runner | Not triggered | `TF_API_TOKEN` (env `TF_TOKEN_app_terraform_io`) | would **fail** (`terraform init` against Terraform Cloud unauthenticated); only reachable if Dependabot ever edited terraform paths, which no ecosystem does | no run |
| `nightly.yml` | Nightly Dev Build & Deploy | push master, dispatch | Not triggered by PRs | via `workflow_call` to publish.yml (`DOCKERHUB_*`) | n/a on PR | — |
| `dev-deploy.yml` | Dev Deploy | `workflow_run` of Nightly, dispatch | Not triggered by PRs | `SSH_PRIVATE_KEY`, `MONGO_*`, `VAPID_*`, `DISCORD_WEBHOOK_URL` | n/a on PR | — |
| `release-please.yml` | Release Please | push master | Not triggered by PRs (runs after the squash-merge) | `RUNNER_PAT` | n/a on PR — the merge commit is authored by the merger, not Dependabot | — |
| `release.yml` | Release Smart Smoker v2 | dispatch, `release: published` | Not triggered by PRs | via `workflow_call` | — | — |
| `prod-deploy.yml` | Production Deploy | `release: published`, dispatch | Not triggered by PRs | `DOCKERHUB_*`, `SSH_PRIVATE_KEY`, `MONGO_*`, `VAPID_*`, `DISCORD_WEBHOOK_URL` | — | — |
| `ansible-provision.yml` | Ansible Provision | push master paths, dispatch | Not triggered by PRs | `SSH_PRIVATE_KEY`, `RUNNER_PAT`, `TAILSCALE_AUTH_KEY`, `MONGO_APP_PASSWORD` | — | — |
| `ansible-prod-cloud.yml` | Ansible Prod Cloud | dispatch | Not triggered | `SSH_PRIVATE_KEY`, `MONGO_APP_PASSWORD` | — | — |
| `infra-provision-vm.yml` | Provision Virtual Smoker VM | dispatch, push master paths | Not triggered | `TF_API_TOKEN`, `SSH_PRIVATE_KEY`, `TAILSCALE_AUTH_KEY` | — | — |
| `terraform-apply-prod.yml` | Production Terraform Apply | dispatch | Not triggered | `TF_API_TOKEN` | — | — |
| `terraform-drift.yml` | Terraform Drift | schedule, dispatch | Not triggered | `TF_API_TOKEN` | — | — |
| `docs.yml` | docs | push master/main | Not triggered | none | — | — |
| `build.yml`, `test.yml`, `typecheck.yml`, `e2e.yml`, `install.yml`, `publish.yml`, `device-deploy.yml` | (reusable) | `workflow_call` only | Only run when a caller runs; on a Dependabot PR the only PR-path caller is `ci-tests.yml`, which does not trigger | `publish.yml` requires `DOCKERHUB_*`; `device-deploy.yml` uses `SSH_PRIVATE_KEY` | n/a on PR | — |

Path-filter evidence: `.github/workflows/ci-tests.yml` `on.pull_request.paths`
(lines 3–62) lists `package.json` and `**/package.json` but no
`package-lock.json` entry; `docker-build-pr.yml` and `e2e-pr-gate.yml` both list
`package-lock.json` explicitly. The repo has one workspace lockfile at the root
(`git ls-files | grep package-lock.json` → `package-lock.json`,
`scripts/pr-images/…`, `scripts/smoke/…`, `scripts/stack-runner/…`), so every
transitive npm bump is a root-lockfile-only diff.

`if:` conditions found across all 33 workflows are only step/job outcome
guards (`always()`, `failure()`, `steps.x.outcome`, `inputs.*`,
`github.event_name == 'pull_request'`). No workflow references `github.actor`,
`github.event.pull_request.user.login`, `dependabot`, or `pull_request_target`
(`grep -nE 'github\.actor|dependabot|pull_request_target' .github/workflows/*`
hits only two Slack-message strings in `terraform-validate.yml`).

## Required checks

`gh api repos/benjr70/Smart-Smoker-V2/branches/master/protection`:

```json
{"contexts":["Hermetic journey suite","Conventional PR title"],"strict":false,
 "reviews":1,"codeowners":true,"enforce_admins":false}
```

No rulesets (`gh api repos/benjr70/Smart-Smoker-V2/rulesets` → `[]`).

| PR | Conventional PR title | Hermetic journey suite |
| --- | --- | --- |
| #635 | pass, [job 100072408706](https://github.com/benjr70/Smart-Smoker-V2/actions/runs/33573530431/job/100072408706) | pass 9m50s, [job 100072409239](https://github.com/benjr70/Smart-Smoker-V2/actions/runs/33573530499/job/100072409239) |
| #636 | pass, [job 100072416729](https://github.com/benjr70/Smart-Smoker-V2/actions/runs/33573532872/job/100072416729) | pass 8m42s, [job 100072416662](https://github.com/benjr70/Smart-Smoker-V2/actions/runs/33573532875/job/100072416662) |
| #637 | pass, [job 100349216741](https://github.com/benjr70/Smart-Smoker-V2/actions/runs/33660389062/job/100349216741) | pass 9m29s, [job 100349215443](https://github.com/benjr70/Smart-Smoker-V2/actions/runs/33660388867/job/100349215443) |

Both required checks are satisfied without any secret; the remaining blocker
to a merge is the branch-protection review rule (1 approving code-owner
review), which the Map already settles with
`gh pr merge --squash --admin` as `benjr70` (`enforce_admins: false`) — the
same path `docs-only-gate.sh` uses.

Title history matters for the lint: on #571 Dependabot first opened the PR as
`Chore(deps): bump esbuild and tsx in /scripts/smoke` (capital C), PR Title
Lint **failed three times**, then Dependabot itself force-pushed and renamed to
`chore(deps): …` 26 minutes later (`gh api …/issues/571/timeline`: `renamed`
by `dependabot[bot]` at 2026-08-28T19:32:32Z). #635–#637 opened directly as
`chore(deps):` / `chore(deps-dev):`. With no `dependabot.yml`, the prefix comes
from Dependabot's convention detection — "Commit messages follow similar
patterns to those detected in the repository" (options reference,
`commit-message`). The lane should not assume the first title passes lint.

## Live evidence

```
$ gh pr view 636 --json title,author,headRefName,labels,mergeable
{"author":"app/dependabot","head":"dependabot/npm_and_yarn/nanoid-3.3.18",
 "labels":["dependencies","javascript"],"mergeable":"MERGEABLE",
 "title":"chore(deps): bump nanoid from 3.3.11 to 3.3.18"}

$ gh pr view 636 --json files --jq '.files[].path'
package-lock.json                       # same for #635 and #637

$ gh run list --branch dependabot/npm_and_yarn/nanoid-3.3.18 \
    --json workflowName,event,conclusion
pull_request  success  Docker Build (PR)
pull_request  success  E2E PR Gate
pull_request  success  Docs Freshness
pull_request  success  PR Title Lint        # identical set on #635, #637

$ gh api repos/benjr70/Smart-Smoker-V2/actions/runs/33573532875 \
    --jq '{event,actor:.actor.login,triggering_actor:.triggering_actor.login}'
{"actor":"dependabot[bot]","event":"pull_request","triggering_actor":"dependabot[bot]"}

$ gh api repos/benjr70/Smart-Smoker-V2/actions/runs/33573532838/jobs \
    --jq '.jobs[].steps[] | "\(.name)=\(.conclusion)"'
… Find existing comment=success  Upsert PR comment=success …   # Docs Freshness wrote its PR comment

$ gh pr checks 636        # every job pass; full list in the required-checks section
```

Comparison PR (#634, an agent PR touching `apps/**` + `e2e/**`) ran
`CI - Tests and Build Validation`, `Docs Freshness`, `E2E PR Gate`,
`PR Title Lint` — i.e. the unit-test workflow that the Dependabot PRs lacked.

## Secret scoping (GitHub docs)

From *Troubleshooting Dependabot on GitHub Actions*:

- Workflows "activated by Dependabot through push, pull_request,
  pull_request_review, or pull_request_review_comment events … receive a
  read-only `GITHUB_TOKEN`" and "do not have access to any secrets that are
  normally available."
- "the only secrets available to the workflow are Dependabot secrets. GitHub
  Actions secrets are **not available**."
- Remedies: "modify your workflows to use a two-step process that includes
  `pull_request_target` which does not have these limitations", or "use the
  `permissions` key in your workflow to increase the access for the token."
  The second remedy is what already makes `docs-freshness.yml` and
  `ci-tests.yml`'s `report-results` job work (job-level
  `permissions: pull-requests: write`, verified live above).
- Detection idiom: `if: github.actor != 'dependabot[bot]'` /
  `github.event.pull_request.user.login == 'dependabot[bot]'`. Note `gh pr view
  --json author` reports the same identity as `app/dependabot`, which is what
  `scripts/claude-agent/lib/pr-triage.sh` compares via `PR_TRIAGE_AUTHOR`.

Applied to this repo: no `pull_request`-triggered workflow reads a repository
secret (table above), so the scoping rule currently changes nothing. It would
bite only if Dependabot ever produced a diff under `infra/proxmox/terraform/**`
(`terraform-plan.yml` needs `TF_API_TOKEN`) — impossible for the npm
ecosystem — or if the lane added a secret-bearing workflow to the PR path.
`RUNNER_PAT` is consumed only by `release-please.yml` (push to master) and
`ansible-provision.yml`; both run after/without the PR and under the merger's
push event, not Dependabot's.

## Security-alert vs version-update signal

What exists on this repo:

- **No `.github/dependabot.yml`** (`git log --all -- .github/dependabot.yml`
  is empty; `gh api …/contents/.github/dependabot.yml` → 404). Security updates
  come from the repository setting: `gh api repos/benjr70/Smart-Smoker-V2
  --jq .security_and_analysis` → `dependabot_security_updates.status =
  "enabled"`. Per the docs, that is sufficient: "If you enable Dependabot
  security updates, when a Dependabot alert is raised … Dependabot
  automatically tries to fix it." So **today every Dependabot PR on this repo
  is a security PR**; version updates cannot appear until a `dependabot.yml`
  is added (Map: out of scope).
- Labels: `dependencies` + `javascript` on all three PRs. Docs: "All pull
  requests have a `dependencies` label … an additional label for the ecosystem
  or language is added"; no distinct security label exists by default.
  **Labels do not distinguish** security from version PRs.
- 328 open alerts (`gh api 'repos/…/dependabot/alerts?state=open&per_page=100'
  --paginate`), all on manifest `package-lock.json`.

Signals, ranked by trust:

1. **Alert → PR link (authoritative).** GraphQL
   `RepositoryVulnerabilityAlert.dependabotUpdate.pullRequest`:

   ```
   $ gh api graphql -f query='query { repository(owner:"benjr70", name:"Smart-Smoker-V2") {
       vulnerabilityAlert(number:340) { number state
         securityVulnerability { package { name } }
         dependabotUpdate { pullRequest { number state } error { title } } } } }'
   338 OPEN browserslist    PR=635 OPEN
   339 OPEN browserslist    PR=635 OPEN
   340 OPEN nanoid          PR=636 OPEN
   308 OPEN nanoid          PR=636 OPEN
   310 OPEN nanoid          PR=636 OPEN
   218 OPEN @xmldom/xmldom  PR=637 OPEN
   342 OPEN @xmldom/xmldom  PR=637 OPEN
   ```

   The direction is alert → PR, so the lane inverts it: page all alerts with
   `states:OPEN` (or the REST list) and build a `pr → [alert numbers]` map,
   then a Dependabot PR whose number appears is a security PR; otherwise it is
   a version update. Gotcha: `vulnerabilityAlerts(first:100)` returns the
   lowest-numbered alerts first and this repo has 328 open, so an unpaginated
   query misses all recent alerts (probed: `first:100, states:OPEN` returned no
   alert with a `dependabotUpdate`). Paginate on `pageInfo.endCursor`, or use
   the REST list, which also carries `security_advisory.ghsa_id`, `severity`,
   `security_vulnerability.first_patched_version` for the `fix(deps):` body.
2. **PR body footer (cheap, PR-side).** Every security PR body ends its
   "Dependabot commands and options" block with *"You can disable automated
   security fix PRs for this repo from the
   [Security Alerts page](…/network/alerts)."* (present on #635, #636, #637;
   `gh pr view <n> --json body --jq .body | grep -c 'automated security fix
   PRs'`). Version-update PRs are documented as a separate product ("Dependabot
   **will not** group security updates with version updates") and carry the
   `@dependabot ignore …` command block without that sentence; this repo has no
   version-update PR to confirm the negative live, so treat (2) as a positive
   marker only and fall back to (1) when absent.
3. **`dependabot/fetch-metadata` action** (`alert-lookup: true`, requires a
   PAT/App token as `github-token`) exposes `alert-state`, `ghsa-id`, `cvss`.
   Its own lookup is a GraphQL `vulnerabilityAlerts(first: 100)` matched on
   package name + manifest path + `vulnerableRequirements == "= <from>"`
   (`verified_commits.ts`), i.e. the same 100-cap gotcha as above — not
   useful for the Daemon, which runs outside Actions anyway.
4. **Not signals**: labels (see above); the commit message YAML block
   (`updated-dependencies: … dependency-type: indirect`) says direct/indirect
   and versions but nothing about alerts; PR title prefix `chore(deps)` vs
   `chore(deps-dev)` is production vs dev dependency, not security vs version.

Major-bump signal (adjacent Map fog): the commit-message YAML block gives
`dependency-version` (new) and the title gives `from X to Y`; fetch-metadata
computes `update-type` as `version-update:semver-major` when the first semver
component differs (`update_metadata.ts`). REST alerts give
`first_patched_version` so the lane can also tell "minimum fix" from
"Dependabot chose a later version".

## Implications for the lane

- Tier A "all CI green" on a lockfile-only PR is only four workflows and
  includes **no unit tests, lint or typecheck**. The Spec must either (a) treat
  Tier B (hermetic suite + `/verify-pr` round) as the real bar, or (b) add
  `package-lock.json` to `ci-tests.yml`'s `paths` (a code change, so a Slice).
  The hermetic E2E gate already boots the full stack from the bumped lockfile,
  which is why the required check is a meaningful signal on its own.
- Secrets need no handling: nothing on the PR path reads one, and `permissions:`
  elevation already works for comment steps. Do **not** introduce
  `pull_request_target` for this lane.
- The lane's "pr → security?" check should be one paginated alert query per
  fire (cacheable), not per-PR body parsing; the body footer is a fine
  fast-path.
- Title lint can fail on Dependabot's first attempt (#571 history). The lane's
  retitle step (`fix(deps): …` for security PRs) doubles as the fix; validate
  with `scripts/validate-pr-title.sh` before pushing the title.
- Because there is no `dependabot.yml`, "security PRs outrank version PRs" is
  a no-op ordering today; keep the classifier so it is correct the day version
  updates are switched on.
- Author identity differs by API: `github.actor` / commit author =
  `dependabot[bot]`; `gh pr view --json author` = `app/dependabot`. Triage
  should match on the `gh` form.
