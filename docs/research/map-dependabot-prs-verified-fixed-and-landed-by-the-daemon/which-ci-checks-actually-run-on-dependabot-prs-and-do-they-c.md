# Dependabot PRs: which CI checks run, which secrets they see, and how to tell a security PR from a version bump

Ticket: [#640](https://github.com/benjr70/Smart-Smoker-V2/issues/640) (part of
wayfinder map
[#639](https://github.com/benjr70/Smart-Smoker-V2/issues/639) — Map: Dependabot
PRs verified, fixed and landed by the Daemon). Researched on 2026-09-07.

Sources: the 31 files under `.github/workflows/` at master `9f7ab8e`; live probes
against the three open Dependabot PRs #635, #636, #637 (`gh pr view`,
`gh pr checks`, `gh run list --branch`, `gh run view --log`); branch protection
(`gh api repos/…/branches/master/protection`); repo secret stores
(`gh api repos/…/actions/secrets`, `…/dependabot/secrets`); Dependabot alerts
REST (`gh api repos/…/dependabot/alerts`); GitHub docs pages listed in
[GitHub docs](#github-docs-secret-scoping-and-security-updates) below.

## TL;DR

- **Only four workflows run** on a lockfile-only Dependabot PR: `Docs Freshness`,
  `PR Title Lint`, `E2E PR Gate`, `Docker Build (PR)`. All 9 resulting checks
  were green on all three PRs.
- **Both required checks run and report**: `Hermetic journey suite` (E2E PR
  Gate) and `Conventional PR title` (PR Title Lint). Nothing else is required.
- **`CI Tests` (unit tests, lint, typecheck) does NOT run** — its `paths:` filter
  lists `package.json` and `**/package.json` but not root `package-lock.json`,
  and every Dependabot PR so far touches only that file. A dependency bump
  therefore lands without unit tests. Gap to close in the Spec.
- **No PR-triggered workflow references any secret.** The four that run use only
  `GITHUB_TOKEN` (`docs-freshness` needs `pull-requests: write` to upsert its
  comment; the live run log shows the `permissions:` key is honored on
  Dependabot PRs). Secret-consuming workflows (Docker Hub, `RUNNER_PAT`,
  `TF_API_TOKEN`, `SSH_PRIVATE_KEY`, Mongo/VAPID) are all `push`/`release`/
  `workflow_dispatch`/`schedule` or `workflow_call`-only and never fire on a PR.
- Run logs on Dependabot PRs say `Secret source: Dependabot`; the repo has **0**
  Dependabot secrets, so `${{ secrets.X }}` would be empty there — irrelevant
  today because nothing PR-triggered reads one.
- No workflow uses `pull_request_target`. Nothing degrades.
- **Security signal**: no `security` label is applied (labels are exactly
  `dependencies` + `javascript`), and there is no `.github/dependabot.yml`, so
  every Dependabot PR in this repo is a security update by construction. The
  robust per-PR signal is the body footer line
  `You can disable automated security fix PRs for this repo from the [Security Alerts page]`
  (present on all three), cross-checked against
  `GET /repos/{o}/{r}/dependabot/alerts?state=open` filtered by
  `dependency.package.name` with `security_vulnerability.first_patched_version`
  ≤ the bumped-to version.

## Per-workflow table

Event for a Dependabot PR is `pull_request` from an in-repo
`dependabot/npm_and_yarn/*` branch. "Runs" = observed on #635/#636/#637.

| Workflow file               | Trigger on PR?                   | Ran on #635/636/637 | Why / path filter                                                    | Secrets read              |
| --------------------------- | -------------------------------- | ------------------- | -------------------------------------------------------------------- | ------------------------- |
| `docs-freshness.yml`        | `pull_request` (no paths)        | ✅ `check`          | always                                                               | none (`GITHUB_TOKEN` PR-write) |
| `pr-title-lint.yml`         | `pull_request` (no paths)        | ✅ `Conventional PR title` **(required)**, `Validator self-tests` | always                          | none                      |
| `e2e-pr-gate.yml`           | `pull_request` paths             | ✅ `Hermetic journey suite` **(required)** | matches `package-lock.json`                          | none (`contents: read`)   |
| `e2e-pr-gate-skip.yml`      | `pull_request` paths-ignore      | ⏭ skipped            | ignores `package-lock.json` (complement of the gate)                 | none                      |
| `docker-build-pr.yml`       | `pull_request` paths             | ✅ `build (×4)` advisory, `device-service-armv7` blocking | matches `package-lock.json`; `push: false`, no registry login | none              |
| `ci-tests.yml`              | `pull_request` paths             | ❌ **not triggered** | paths list `package.json`, `**/package.json`, `apps/**`, … but **not root `package-lock.json`** | none |
| `claude-agent-tests.yml`    | `pull_request` paths             | ⏭ skipped            | `scripts/claude-agent/**` only                                       | none                      |
| `harness-runbook.yml`       | `pull_request` paths             | ⏭ skipped            | skill/harness files only                                             | none                      |
| `pr-screenshots-tests.yml`  | `pull_request` paths             | ⏭ skipped            | `scripts/pr-images/**`, verify-pr scripts                            | none                      |
| `release-config-tests.yml`  | `pull_request` paths             | ⏭ skipped            | release-please config/scripts                                        | none                      |
| `ansible-lint.yml`          | `pull_request` paths             | ⏭ skipped            | `infra/proxmox/ansible/**`                                           | none                      |
| `terraform-plan.yml`        | `pull_request` paths             | ⏭ skipped            | `infra/proxmox/terraform/**`                                         | `TF_API_TOKEN` — would be **empty** on a Dependabot PR touching TF (none expected: npm ecosystem only) |
| `terraform-validate.yml`    | `pull_request` paths             | ⏭ skipped            | `infra/proxmox/terraform/**`                                         | none                      |
| `nightly.yml`, `release-please.yml`, `docs.yml`, `ansible-provision.yml`, `infra-provision-vm.yml` | `push: master` only | n/a | fire **after** merge, on master, with full secrets | `RUNNER_PAT`, `SSH_PRIVATE_KEY`, `TF_API_TOKEN`, … |
| `dev-deploy.yml`            | `workflow_run` of nightly        | n/a                  | post-merge                                                           | SSH, Mongo, VAPID, Discord |
| `prod-deploy.yml`, `release.yml` | `release: published` / dispatch | n/a             | post-release                                                         | Docker Hub, SSH, Mongo, VAPID |
| `terraform-apply-prod.yml`, `ansible-prod-cloud.yml` | `workflow_dispatch` | n/a          | manual                                                               | `TF_API_TOKEN`, SSH, Mongo |
| `terraform-drift.yml`       | `schedule` / dispatch            | n/a                  | nightly                                                              | `TF_API_TOKEN`            |
| `device-deploy.yml`, `build.yml`, `test.yml`, `typecheck.yml`, `e2e.yml`, `install.yml`, `publish.yml` | `workflow_call` | n/a | reusable; inherit caller's context — no PR caller passes secrets | callers' Docker Hub creds (publish) |

`pull_request_target`: **zero** occurrences in `.github/workflows/` (grep
`pull_request_target` → no matches).

### Live evidence

```
$ gh run list --branch dependabot/npm_and_yarn/browserslist-4.28.8 --json workflowName,event,conclusion
Docker Build (PR)   pull_request  success
E2E PR Gate         pull_request  success
PR Title Lint       pull_request  success
Docs Freshness      pull_request  success
# identical set on nanoid-3.3.18 and xmldom/xmldom-0.8.15

$ gh pr checks 635   # 9/9 pass; same for 636, 637
build (backend|device-service|frontend|smoker)  pass
check                                           pass
Conventional PR title                           pass
device-service-armv7                            pass
Hermetic journey suite                          pass
Validator self-tests                            pass

$ gh api repos/benjr70/Smart-Smoker-V2/branches/master/protection --jq .required_status_checks.contexts
["Hermetic journey suite","Conventional PR title"]     # strict: false

$ gh run view 33573530386 --log | grep -A6 'GITHUB_TOKEN Permissions'
GITHUB_TOKEN Permissions
  Contents: read
  Metadata: read
  PullRequests: write        # docs-freshness `permissions:` block honored
Secret source: Dependabot

$ gh api repos/benjr70/Smart-Smoker-V2/dependabot/secrets --jq .total_count
0
$ gh api repos/benjr70/Smart-Smoker-V2/actions/secrets --jq '[.secrets[].name]'
["DISCORD_WEBHOOK_URL","DOCKERHUB_TOKEN","DOCKERHUB_USERNAME","MONGO_APP_PASSWORD",
 "MONGO_ROOT_PASSWORD","RUNNER_PAT","SSH_PRIVATE_KEY","TF_API_TOKEN","VAPID_PRIVATE_KEY","VAPID_PUBLIC_KEY"]

$ gh pr view 635 --json files,labels --jq '[.files[].path], [.labels[].name]'
["package-lock.json"]  ["dependencies","javascript"]
```

The `Docs freshness` bot comment did post on #635 (author `github-actions[bot]`),
confirming the write permission worked under the Dependabot token.

### Implications for the lane

1. **`CI Tests` is silently absent** — Tier A "all CI green" is weaker than it
   looks for a lockfile-only bump. Either add `package-lock.json` to
   `ci-tests.yml` `paths:`, or have the lane run unit tests itself. Note
   `ci-tests.yml` already keys its cache on `hashFiles('package-lock.json')`, so
   the omission is an oversight, not a design choice.
2. `Docker Build (PR)` and `E2E PR Gate` already give real coverage: images
   build for all four apps + arm/v7, and the hermetic journey suite passes.
3. Secrets are a non-issue today: no PR workflow needs one. Keep it that way —
   never add a secret-consuming step to a `pull_request` workflow expecting it
   to work on Dependabot PRs; switching to `pull_request_target` to get secrets
   would run base-branch code against an untrusted head and is the documented
   anti-pattern.
4. Agent-pushed fixes on a Dependabot branch change the PR author of the
   **commit**, not the PR (`author` stays `app/dependabot`, so the Dependabot
   secret scope stays in force for `pull_request` runs).

## Security-alert PR vs version-update PR

| Signal                                                                   | Present on #635/636/637 | Reliable?                                                                  |
| ------------------------------------------------------------------------ | ----------------------- | -------------------------------------------------------------------------- |
| `security` label                                                         | ❌ (labels: `dependencies`, `javascript`) | No — Dependabot does not apply it; repo has the label but unused |
| Body footer `You can disable automated security fix PRs for this repo from the [Security Alerts page](…/network/alerts).` | ✅ all three | **Strong heuristic** — observed on every security PR; not documented by GitHub (see docs section) |
| Body badge link `…about-dependabot-security-updates#about-compatibility-scores` | ✅ all three | Weak — compatibility badges appear on version updates too |
| No `.github/dependabot.yml`                                              | ✅ file absent          | **Yes, repo-wide**: without a config file Dependabot cannot open version updates, so every PR is a security update |
| Alerts REST: open alert whose `dependency.package.name` == bumped package and `security_vulnerability.first_patched_version.identifier` ≤ new version | ✅ e.g. alert 339 browserslist `first_patched 4.28.7`, PR bumps to 4.28.8 | **Yes** — authoritative linkage; alert flips `state: fixed` after merge |
| PR timeline `cross-referenced` to an alert                               | ❌ (only to #640/#641)  | No — alerts are not issues; no timeline edge exists                        |
| `dependabot/fetch-metadata` action outputs (`alert-state`, `ghsa-id`, `cvss`, `update-type`) | not used in repo | Yes if adopted, but requires a workflow step; the two above need no workflow |

Live probe:

```
$ gh api --paginate 'repos/benjr70/Smart-Smoker-V2/dependabot/alerts?state=open&per_page=100' \
    --jq '.[] | select(.dependency.package.name|test("^(browserslist|nanoid|@xmldom/xmldom)$")) | "\(.number)\t\(.dependency.package.name)\t\(.security_advisory.ghsa_id)\t\(.security_advisory.severity)"'
342  @xmldom/xmldom  GHSA-6gmq-8vp8-gcm6  medium
340  nanoid          GHSA-xwg4-73v4-xw9w  high
339  browserslist    GHSA-c83g-rgw3-j3cx  high
338  browserslist    GHSA-73wf-gq98-2v4g  high
310  nanoid          GHSA-2v37-7h3g-55p8  high
308  nanoid          GHSA-28wg-ghj8-5hjv  high
218  @xmldom/xmldom  GHSA-f6ww-3ggp-fr8h  high
…
$ gh api repos/benjr70/Smart-Smoker-V2/dependabot/alerts/339 \
    --jq '{state, first_patched: .security_vulnerability.first_patched_version.identifier, range: .security_vulnerability.vulnerable_version_range}'
{"state":"open","first_patched":"4.28.7","range":"<= 4.28.6"}
```

**Recommended rule for the lane** (no workflow changes needed):

```bash
is_security_pr() {  # $1 = PR number
  gh pr view "$1" --json body --jq .body \
    | grep -q 'You can disable automated security fix PRs for this repo'
}
# Belt-and-braces: package name from the title "bump <pkg> from X to Y", then
# gh api dependabot/alerts?state=open filtered on .dependency.package.name.
```

Both open Dependabot PR shapes today (`chore(deps):` and `chore(deps-dev):`)
are security updates, so retitling to `fix(deps):` before merge is correct for
all three; the footer check keeps it correct if a `dependabot.yml` is ever added.

## GitHub docs: secret scoping and security updates

Fetched 2026-09-07 via WebFetch (model-summarised page text; quotes are those
marked verbatim). Live probes above agree with every claim.

### Secret scoping

- "When a Dependabot event triggers a workflow, the only secrets available to
  the workflow are Dependabot secrets. GitHub Actions secrets are not
  available." — [Troubleshooting Dependabot on GitHub Actions][S2]. Matches the
  `Secret source: Dependabot` line in run 33573530386.
- "GitHub Actions workflow runs that are triggered by Dependabot from `push`,
  `pull_request`, `pull_request_review`, or `pull_request_review_comment`
  events are treated as if they were opened from a repository fork … they
  receive a read-only `GITHUB_TOKEN` and do not have access to any secrets
  that are normally available." — [S2]. Also [Events that trigger
  workflows][S5]: Dependabot PRs "are treated as though they are from a forked
  repository".
- "By default, GitHub Actions workflows triggered by Dependabot get a
  `GITHUB_TOKEN` with read-only permissions. You can use the `permissions` key
  in your workflow to increase the access for the token." — [S2]. Confirmed
  live: `docs-freshness.yml`'s `pull-requests: write` produced
  `PullRequests: write` in the token and the bot comment posted.
- A referenced but unavailable secret "will be an empty string" — no failure —
  [Using secrets in GitHub Actions][S4]. So a future secret-consuming PR step
  would **degrade silently** on a Dependabot PR, not error.
- `pull_request_target` runs "in the context of the default branch of the base
  repository" with secrets and a write token; "Running untrusted code on the
  `pull_request_target` trigger may lead to security vulnerabilities … Avoid
  using this event if you need to build or run code from the pull request." —
  [S5]. This repo uses it nowhere; keep it that way.

### Security update vs version update

- Definitions: security updates "help you update dependencies with known
  vulnerabilities"; version updates "keep your dependencies updated, even when
  they don't have any vulnerabilities" — [About Dependabot security
  updates][S6], [About Dependabot version updates][S9].
- **Version updates require `dependabot.yml`**: "You enable Dependabot version
  updates by checking a `dependabot.yml` configuration file into your
  repository." — [S9]. Security updates are enabled from repo Settings
  independently ([Configuring Dependabot security updates][S7]); the file only
  *overrides* their defaults. This repo has no `dependabot.yml` ⇒ every
  Dependabot PR here is a security update. Primary repo-wide signal.
- **Labels**: the only documented default label is `dependencies` on both
  kinds — [Managing pull requests for dependency updates][S11]. No default
  `security` label exists in the docs (absence-of-evidence). A custom label
  could be set via `dependabot.yml` `labels:` with `open-pull-requests-limit: 0`
  so the config "only apply[s] to security updates" — [Customizing Dependabot
  security PRs][S10] — but that means adding the config file the Map keeps
  untouched.
- **Body footer**: the `You can disable automated security fix PRs for this
  repo from the Security Alerts page` line is **observed** on all three PRs but
  **not documented** anywhere fetched. Treat as a strong heuristic, not a
  contract; pair it with the alerts API.
- **Alert linkage**: docs say Dependabot "links the pull request to the
  Dependabot alert" — [S6] — but that link is UI-only. The [REST alerts
  schema][S8] exposes `state` (`open|fixed|dismissed|auto_dismissed`),
  `fixed_at`, `security_vulnerability.first_patched_version`,
  `security_advisory.ghsa_id`/`cve_id`/`severity` and **no PR field**. The
  API-side check is therefore indirect: an open alert on the bumped package
  whose `first_patched_version` ≤ the PR's target version.
- **`dependabot/fetch-metadata`** ([S13]) exposes `update-type`
  (`version-update:semver-major|minor|patch` — the **major-bump signal** the
  Map's fog asks about), `dependency-type`, and with `alert-lookup: true`
  plus a PAT/App token (default `GITHUB_TOKEN` insufficient): `alert-state`,
  `ghsa-id`, `cvss` (`0` when not security). Outputs populate only when the PR
  "contains only Dependabot-created commits" — so it stops working once the
  lane pushes a fix commit. Usable in a workflow; not needed for the lane,
  which can read the PR title + alerts API from the Daemon box.

[S1]: https://docs.github.com/en/code-security/dependabot/working-with-dependabot/automating-dependabot-with-github-actions
[S2]: https://docs.github.com/en/code-security/dependabot/troubleshooting-dependabot/troubleshooting-dependabot-on-github-actions
[S4]: https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions
[S5]: https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#pull_request_target
[S6]: https://docs.github.com/en/code-security/dependabot/dependabot-security-updates/about-dependabot-security-updates
[S7]: https://docs.github.com/en/code-security/dependabot/dependabot-security-updates/configuring-dependabot-security-updates
[S8]: https://docs.github.com/en/rest/dependabot/alerts?apiVersion=2022-11-28
[S9]: https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/about-dependabot-version-updates
[S10]: https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/manage-your-dependency-security/customizing-dependabot-security-prs
[S11]: https://docs.github.com/en/code-security/dependabot/working-with-dependabot/managing-pull-requests-for-dependency-updates
[S12]: https://docs.github.com/en/code-security/dependabot/dependabot-alerts/viewing-and-updating-dependabot-alerts
[S13]: https://github.com/dependabot/fetch-metadata
