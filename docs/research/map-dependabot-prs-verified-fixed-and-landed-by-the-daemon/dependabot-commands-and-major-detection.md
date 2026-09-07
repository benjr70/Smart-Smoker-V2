# Dependabot stops touching a branch once the agent pushes to it, and "major" is best read from the bot commit's version pairs

Ticket: [#642](https://github.com/benjr70/Smart-Smoker-V2/issues/642) (part of
wayfinder map
[#639](https://github.com/benjr70/Smart-Smoker-V2/issues/639) — Map: Dependabot
PRs verified, fixed and landed by the Daemon). Researched on 2026-09-07.

Sources: GitHub Docs — [Managing pull requests for dependency
updates](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/managing-pull-requests-for-dependency-updates),
[Dependabot pull request comment
commands](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-pull-request-comment-commands),
[Dependabot options reference](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference)
(`rebase-strategy`, `ignore` / `update-types`); dependabot-core source at
`main` —
[`common/lib/dependabot/pull_request_updater/github.rb`](https://github.com/dependabot/dependabot-core/blob/main/common/lib/dependabot/pull_request_updater/github.rb),
[`updater/lib/dependabot/updater/operations/refresh_security_update_pull_request.rb`](https://github.com/dependabot/dependabot-core/blob/main/updater/lib/dependabot/updater/operations/refresh_security_update_pull_request.rb),
[`updater/lib/dependabot/updater/operations/refresh_version_update_pull_request.rb`](https://github.com/dependabot/dependabot-core/blob/main/updater/lib/dependabot/updater/operations/refresh_version_update_pull_request.rb),
[`common/lib/dependabot/pull_request_creator/message_builder.rb`](https://github.com/dependabot/dependabot-core/blob/main/common/lib/dependabot/pull_request_creator/message_builder.rb);
dependabot/fetch-metadata source at `main` —
[`src/dependabot/update_metadata.ts`](https://github.com/dependabot/fetch-metadata/blob/main/src/dependabot/update_metadata.ts),
[`src/dependabot/output.ts`](https://github.com/dependabot/fetch-metadata/blob/main/src/dependabot/output.ts),
[`src/dependabot/verified_commits.ts`](https://github.com/dependabot/fetch-metadata/blob/main/src/dependabot/verified_commits.ts),
[`README.md`](https://github.com/dependabot/fetch-metadata/blob/main/README.md);
live probes on `benjr70/Smart-Smoker-V2` (2026-09-07): `gh pr list --author
app/dependabot --state all`, `gh pr view 636|571 --json body,commits`, and the
prototype rule below run against PRs #635/#636/#637/#571.

## TL;DR

- **Any non-Dependabot commit freezes Dependabot's own updates of that branch.**
  Docs: "By default, Dependabot will stop rebasing a pull request once extra
  commits have been pushed to it." The only opt-out is a marker string
  (`[dependabot skip]` etc.) in the commit message, which lets Dependabot
  **force-push over** the extra commits. So: once the agent pushes a fix, the
  agent owns conflicts on that branch (the Map's "agent rebases itself only
  when it already pushed fixes" plan is confirmed).
- **`@dependabot rebase`** = "Rebases the pull request." **`@dependabot
  recreate`** = "Recreates the pull request, overwriting any edits that have
  been made to the pull request." Both, when they act, land as a single new
  bot commit force-pushed onto the head ref (`update_ref(..., force: true)` in
  dependabot-core) — i.e. the agent's fix commits are **discarded**, not
  rebased. Docs never say `rebase` "refuses" a foreign-commit branch; the
  documented behaviour is that Dependabot _stops rebasing_ such a PR, and the
  agent must never rely on `rebase` preserving its commits.
- **`@dependabot ignore this {dependency|major|minor|patch version}`** closes
  the PR and suppresses future PRs for that scope "unless you reopen the pull
  request or upgrade to … yourself". These are scope-closers, not branch
  operations; foreign commits are irrelevant to them.
- **Auto-rebase on conflict** happens by default (`rebase-strategy: auto`)
  when "A Dependabot pull request is in conflict after a recent push to the
  target branch", but stops 30 days after the PR opened and stops entirely
  once extra commits are on it (previous bullet).
- **Newer advisory / newer version mid-fix:** dependabot-core's refresh
  operation for security PRs either updates the existing PR (same versions),
  or — "The existing PR is for a previous version. Supersede it." — creates a
  **new** PR; when the dependency set changed it closes the old one
  (`:dependencies_changed`) and creates a new one. So the agent's fix branch
  can be orphaned by a superseding PR at any time; the lane must re-check the
  PR is still open and not superseded before merging.
- **Major detection — read the bot's first commit message**, not the title.
  Dependabot's own YAML trailer (`updated-dependencies:`) carries
  `dependency-name`, `dependency-version` (new) and `dependency-type` but
  **no previous version and no update-type** (live probe). The previous
  version lives in the prose: `Bumps … from A to B.` (single-dep) and
  `Updates \`name\` from A to B` (one line per dep, multi-dep). That is exactly
  what `dependabot/fetch-metadata` parses, and `update-type` is then the
  **highest** level across all deps in the PR. Grouped-PR titles carry no
  versions at all (live probe: #571 "bump esbuild and tsx in /scripts/smoke").
- **Pre-1.0:** Dependabot and fetch-metadata treat `0.27 -> 0.28` as
  `semver-minor` — docs: "Dependabot assumes that versions in this form are
  always major.minor.patch." The recommended rule below **promotes a 0.x minor
  bump to major** for the HITL decision (SemVer §4: 0.y.z "anything MAY change
  at any time"), which is a deliberate divergence from fetch-metadata.
- **Recommended `pr-triage.sh` rule**: parse `commits[0]` of
  `gh pr view --json commits`; collect every `from X to Y` pair from the
  `Bumps …` line and every `Updates \`…\`` line; level each pair
  (major/minor/patch, 0.x-minor => major); PR level = max; no pair => `unknown`
  => treat as major (HITL). Prototype verified live: #635 minor, #636 patch,
  #637 patch, #571 major (esbuild 0.27.7 -> 0.28.2).

## 1. Bot commands vs agent pushes

### 1.1 What foreign commits do to Dependabot's behaviour

From [Managing pull requests for dependency
updates](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/managing-pull-requests-for-dependency-updates),
section "Allowing Dependabot to rebase and force push over extra commits":

> By default, Dependabot will stop rebasing a pull request once extra commits
> have been pushed to it. To allow Dependabot to force push over commits added
> to its branches, include any of the following strings: `[dependabot skip]`,
> `[skip dependabot]`, `[dependabot-skip]`, or `[skip-dependabot]`, in either
> lower or uppercase, to the commit message.

Two consequences for the lane:

1. **Dependabot does not force-push over the agent's commits unless the agent
   asks it to** (via the marker in its own commit message). An agent fix
   commit with a plain message is safe from Dependabot's automatic rebases.
2. **The price is that Dependabot stops rebasing the PR at all.** Auto-conflict
   resolution (§1.3) is gone for that branch; the agent must rebase itself.

The live PR body says the same thing in Dependabot's own words (probe, PR
#636): "Dependabot will resolve any conflicts with this PR as long as you
don't alter it yourself. You can also trigger a rebase manually by commenting
`@dependabot rebase`."

### 1.2 Command semantics

From [Dependabot pull request comment
commands](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-pull-request-comment-commands)
(verbatim):

| Command                                            | Documented effect                                                                                                                                                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@dependabot rebase`                               | "Rebases the pull request."                                                                                                                                                                                    |
| `@dependabot recreate`                             | "Recreates the pull request, overwriting any edits that have been made to the pull request."                                                                                                                   |
| `@dependabot show DEPENDENCY_NAME ignore conditions` | "Retrieves information on the ignore conditions for the specified dependency, and comments on the pull request with a table that displays all ignore conditions for the dependency."                        |
| `@dependabot ignore this dependency`               | "Closes the pull request and prevents Dependabot from creating any more pull requests for this dependency (unless you reopen the pull request or upgrade to the suggested version yourself)."                  |
| `@dependabot ignore this major version`            | "Closes the pull request and prevents Dependabot from creating any more pull requests for this major version (unless you reopen the pull request or upgrade to this major version yourself)."                  |
| `@dependabot ignore this minor version`            | "Closes the pull request and prevents Dependabot from creating any more pull requests for this minor version (unless you reopen the pull request or upgrade to this minor version yourself)."                  |
| `@dependabot ignore this patch version`            | "Closes the pull request and prevents Dependabot from creating any more pull requests for this patch version (unless you reopen the pull request or upgrade to this patch version yourself)."                  |

The docs do **not** define what `rebase` does on a branch that already carries
foreign commits — there is no "refuses" sentence anywhere. What is documented is
the §1.1 rule (Dependabot stops rebasing once extra commits exist). The source
tells the rest: **whenever Dependabot does act on an existing PR, it replaces
the branch head with one fresh bot commit**. In
[`pull_request_updater/github.rb`](https://github.com/dependabot/dependabot-core/blob/main/common/lib/dependabot/pull_request_updater/github.rb):

```ruby
def update
  return unless pull_request_exists?
  return unless branch_exists?(...head ref...)
  commit = create_commit
  branch = update_branch(commit)
  ...
end

def update_branch(commit)
  head = github_resource(pull_request, :head, "pull request")
  github_client_for_source.update_ref(
    source.repo, "heads/" + ...head ref..., ...commit sha..., true   # force
  )
```

and the commit message it reuses is looked up by `old_commit` — the PR's
original bot commit — via `commit_being_updated` (`pull_request.commits == 1`
fast path, else find `old_commit` among the PR's commits). So:

- `recreate` **does** discard the agent's fix commits (docs say "overwriting any
  edits"; the source shows one commit, force-pushed).
- `rebase`, if the service lets it run on a modified branch, goes through the
  same `update` path and would likewise force-push one bot commit. The docs'
  §1.1 wording ("stop rebasing") is the documented contract; nothing in the
  docs promises `rebase` will preserve or replay foreign commits. The lane must
  treat **both** commands as "throw away the agent's work" and only ever comment
  `@dependabot rebase` on a branch the agent has **not** pushed to — which is
  the Map's plan.
- `ignore …` commands close the PR and register an ignore condition; they do
  not touch the branch, so foreign commits are irrelevant. Reopening the PR
  undoes the ignore (docs, above).

### 1.3 Auto-rebase on conflict

From the [options
reference](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference),
`rebase-strategy` (verbatim):

> Dependabot default behavior is to rebase open pull requests when Dependabot
> detects any changes to a version or security update pull request. Dependabot
> checks for changes when: Your schedule runs to check for version updates. You
> reopen a closed Dependabot pull request. You change the value of
> `target-branch` in the Dependabot configuration file … A Dependabot pull
> request is in conflict after a recent push to the target branch.

and from [Managing pull
requests](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/managing-pull-requests-for-dependency-updates),
"Changing the rebase strategy for Dependabot pull requests":

> By default, Dependabot automatically rebases pull requests to resolve any
> conflicts. If a pull request has not been merged for 30 days, Dependabot will
> stop rebasing the pull request.

Combined with §1.1: auto-rebase on conflict is on for this repo (no
`dependabot.yml`, so defaults apply), but is off for any PR older than 30 days
and for any PR the agent has pushed to. **For the lane:** a conflicting
Dependabot PR with only bot commits → comment `@dependabot rebase` (or simply
wait — the conflict itself triggers a rebase check). A conflicting PR with agent
commits → the agent rebases with `lib/rebase-driver.sh`; never comment
`@dependabot rebase`/`recreate` there.

### 1.4 Newer advisory / newer version while the agent is mid-fix

GitHub Docs are silent on supersession for security PRs (checked: [About
Dependabot security
updates](https://docs.github.com/en/code-security/dependabot/dependabot-security-updates/about-dependabot-security-updates),
[Configuring Dependabot security
updates](https://docs.github.com/en/code-security/dependabot/dependabot-security-updates/configuring-dependabot-security-updates)).
The source is explicit. In
[`refresh_security_update_pull_request.rb`](https://github.com/dependabot/dependabot-core/blob/main/updater/lib/dependabot/updater/operations/refresh_security_update_pull_request.rb)
(`applies_to?` = `job.security_updates_only?` and
`job.updating_a_pull_request?`), `check_and_update_pull_request` ends with:

```ruby
if changed_dependencies.sort_by(&:downcase) != job_dependencies.sort_by(&:downcase)
  # The dependencies being updated have changed. Close the existing
  # multi-dependency PR and try creating a new one.
  close_pull_request(reason: :dependencies_changed)
  create_pull_request(dependency_change)
elsif existing_pull_request(dependency_change.updated_dependencies)
  # The existing PR is for this version. Update it.
  update_pull_request(dependency_change)
else
  # The existing PR is for a previous version. Supersede it.
  create_pull_request(dependency_change)
end
```

Earlier in the same method the PR is closed outright when the dependency is
gone (`:dependency_removed` / `:dependencies_removed`), already fixed
(`:up_to_date`) or no longer fixable (`:update_no_longer_possible`). The
version-update twin
([`refresh_version_update_pull_request.rb`](https://github.com/dependabot/dependabot-core/blob/main/updater/lib/dependabot/updater/operations/refresh_version_update_pull_request.rb))
states the policy in its header: "in the case where the project folder's
dependencies have changed or a newer version is available, it will supersede
the existing pull request with a new one for clarity."

**For the lane:** a refresh is only triggered when Dependabot re-checks the PR
(§1.3 triggers, or a new alert). When it does, three outcomes can hit an agent
mid-fix: (a) `update_pull_request` — but §1.1 says this stops once foreign
commits exist, so the agent's branch is left alone; (b) a **new** superseding
PR appears (old one closed by the service as superseded); (c) the PR is closed
as `up_to_date` / `dependencies_changed`. The lane cannot prevent (b)/(c); it
must re-read `state` and `closed`/`merged` right before `gh pr merge` and abort
the fire (drop the lock, no label) if the PR is no longer open, so the next fire
picks the successor PR fresh.

## 2. Major-bump detection

### 2.1 What machine-readable data a Dependabot PR carries (live probe)

`gh pr view 636 --json body,commits` (single dependency) — the one bot commit:

```
chore(deps): bump nanoid from 3.3.11 to 3.3.18

Bumps [nanoid](https://github.com/ai/nanoid) from 3.3.11 to 3.3.18.
- [Release notes](...)
- [Changelog](...)
- [Commits](https://github.com/ai/nanoid/compare/3.3.11...3.3.18)

---
updated-dependencies:
- dependency-name: nanoid
  dependency-version: 3.3.18
  dependency-type: indirect
...

Signed-off-by: dependabot[bot] <support@github.com>
```

`gh pr view 571 --json body,commits` (multi-dependency security PR, title
`chore(deps): bump esbuild and tsx in /scripts/smoke` — **no versions in the
title**):

```
Bumps [esbuild](...) to 0.28.2 and updates ancestor dependency [tsx](...). These dependencies need to be updated together.

Updates `esbuild` from 0.27.7 to 0.28.2
- [Release notes](...) ...

Updates `tsx` from 4.21.0 to 4.23.12
- [Release notes](...) ...

---
updated-dependencies:
- dependency-name: esbuild
  dependency-version: 0.28.2
  dependency-type: indirect
- dependency-name: tsx
  dependency-version: 4.23.12
  dependency-type: direct:development
...
```

Findings from the probe:

- The YAML trailer has **no previous version and no `update-type`** field. It
  cannot decide major/minor on its own.
- The PR **body** of a single-dep PR carries the compatibility badge URL with
  `previous-version=3.3.11&new-version=3.3.18`; the multi-dep body (#571)
  carries **no** badge (`grep -c compatibility_score` → 0). Not reliable.
- The **title** carries `from X to Y` only for single-dependency PRs
  (`message_builder.rb#application_pr_name`: one dep → `"<name> from A to B"`;
  several → `"<a>, <b> and <c>"` with no versions).
- The **commit message** always carries a version pair per dependency:
  single-dep → `Bumps <link> from A to B.`; multi-dep → one
  `Updates \`name\` from A to B` line per dependency (`message_builder.rb`,
  `metadata_links`: `"\n\nUpdates `#{dep.display_name}` #{from_version_msg(...)}to #{dep.humanized_version}"`).
  `gh pr view --json commits` exposes it as `messageHeadline` +
  `messageBody`.

### 2.2 How `dependabot/fetch-metadata` computes `update-type`

[`update_metadata.ts`](https://github.com/dependabot/fetch-metadata/blob/main/src/dependabot/update_metadata.ts)
`parse()`:

- Reads the version pair from the commit message first:
  `bumpFragment = commitMessage.match(/^Bumps .* from (?<from>v?\d[^ ]*) to (?<to>v?\d[^ ]*)\.$/m)`,
  falling back to an `[Uu]pdate .* requirement from … to …` regex on the first
  line, and only then to the PR **title** (`titleUpdateFragment`).
- Requires the YAML block (`/^-{3}\n(?<dependencies>[\S|\s]*?)\n^\.{3}\n/m`)
  and a branch name starting with `dependabot`.
- For multi-dep PRs, `parseMetadataLinks()` scans
  `/^Updates `(?<dependencyName>\S+)` (from (?<from>\S+) )?to (?<to>\S+)$/gm`
  — "This data is only available if more than one dependency is updated in a
  single PR."
- Per dependency: `updateType = dependency['update-type'] || calculateUpdateType(lastVersion, nextVersion)`
  — i.e. it would honour an `update-type` key in the YAML if Dependabot ever
  emitted one (it does not today, per §2.1).
- `calculateUpdateType`: strips a leading `v`, splits on `.`; differing first
  component → `version-update:semver-major`; missing or differing second →
  `semver-minor`; else `semver-patch`. **No special case for `0.x`.**

[`output.ts`](https://github.com/dependabot/fetch-metadata/blob/main/src/dependabot/output.ts)
`maxSemver()` picks, in priority order `major, minor, patch`, the first level
present among all dependencies — README: "The highest semver change being made
by this PR". So a grouped PR with one major and five patches is `semver-major`.

[`verified_commits.ts`](https://github.com/dependabot/fetch-metadata/blob/main/src/dependabot/verified_commits.ts)
reads **`commits[0]`** of `pulls.listCommits` and, unless `skip-verification`,
requires PR author and `commits[0].author.login` to be `dependabot[bot]` — but
README: "these outputs will only be populated if the target Pull Request was
opened by Dependabot and contains **only** Dependabot-created commits" by
default. For the lane this means the action itself would refuse after the
agent's first fix push, but the underlying rule (parse `commits[0]`) keeps
working as long as the bot commit stays first — which it does under a plain
rebase and under the agent's fix commits appended on top.

### 2.3 Pre-1.0 packages

Docs, `ignore` → `update-types`: "SemVer is an accepted standard for defining
versions of software packages, in the form x.y.z. Dependabot assumes that
versions in this form are always major.minor.patch." fetch-metadata's
`calculateUpdateType` does the same. So both call esbuild `0.27.7 -> 0.28.2`
(PR #571) a **minor** bump, even though SemVer 2.0.0 §4 says of 0.y.z that
"Anything MAY change at any time" ([semver.org](https://semver.org/#spec-item-4)).
For a "major means a human looks" gate the safe reading is to **promote a 0.x
minor bump to major**; a 0.x patch bump stays patch.

### 2.4 Recommended detection rule for `pr-triage.sh`

Pure jq over `gh pr view <n> --json commits` (already the shape
`pr_triage_enrich` uses; `gh` + `jq` only, no Node). Reads `commits[0]` — the
bot's own commit — so it stays correct after the agent appends fix commits.
Emits `major|minor|patch|unknown`; `unknown` (no version pair parsed, e.g. a
rewritten first commit) must be treated as **major** so a broken sensor can
never auto-merge.

```bash
# dependabot_update_type — highest semver level a Dependabot PR bumps.
# stdin: `gh pr view --json commits` JSON. stdout: major|minor|patch|unknown.
dependabot_update_type() {
    jq -r '
      def parts: ltrimstr("v") | split(".") ;
      def level(a; b):
        (a|parts) as $x | (b|parts) as $y
        | if $x[0] != $y[0] then "major"
          elif ($x|length) < 2 or ($y|length) < 2 or $x[1] != $y[1] then "minor"
          else "patch" end ;
      # 0.x: a minor bump is breaking by the SemVer spec; promote it.
      def level0(a; b):
        level(a; b) as $l
        | if $l == "minor" and ((a|parts)[0] == "0") then "major" else $l end ;
      (.commits[0].messageHeadline + "\n" + .commits[0].messageBody) as $m
      | [ $m | capture("(?m)^Bumps .* from (?<from>v?[0-9][^ ]*) to (?<to>v?[0-9][^ ]*)\\.$")
        , ($m | [ scan("(?m)^Updates `[^`]+` from (v?[0-9]\\S*) to (v?[0-9]\\S*)$") ]
             | .[] | {from: .[0], to: .[1]}) ]
      | map(level0(.from; .to))
      | if length == 0 then "unknown"
        elif index("major") then "major"
        elif index("minor") then "minor"
        else "patch" end'
}
```

The two regexes are fetch-metadata's own (`bumpFragment` and `updatesExpr`),
so the rule agrees with `dependabot/fetch-metadata` everywhere except the
deliberate 0.x promotion. Live probe, 2026-09-07:

| PR   | Bump(s)                                          | Rule    | fetch-metadata would say |
| ---- | ------------------------------------------------ | ------- | ------------------------ |
| #635 | browserslist 4.25.1 → 4.28.8                     | minor   | semver-minor             |
| #636 | nanoid 3.3.11 → 3.3.18                           | patch   | semver-patch             |
| #637 | @xmldom/xmldom 0.8.10 → 0.8.15                   | patch   | semver-patch             |
| #571 | esbuild 0.27.7 → 0.28.2, tsx 4.21.0 → 4.23.12    | major   | semver-minor             |

Synthetic checks: `1.2.3 → 2.0.0` → major; grouped `1.0.0→1.1.0, 2.3.4→2.3.5,
0.9.0→0.10.0` → major; grouped `1.0.0→1.1.0, 2.3.4→2.3.5` → minor; grouped
`1.0.0→1.0.1, 2.3.4→3.0.0` → major; `v1.4.0 → v1.5.0` → minor; a single
non-bot first commit with no version pair → unknown.

What **not** to use, and why:

- **Title parse** — versions are absent on every multi-dependency PR (#571)
  and the title can be rewritten (the Map plans `fix(deps):` retitles).
- **YAML trailer alone** — no previous version, no `update-type`.
- **Compatibility badge in the body** — absent on multi-dep PRs.
- **The `dependabot/fetch-metadata` action** — correct, but it needs a
  workflow run and refuses once non-bot commits exist; the jq rule above is the
  same computation without the Action.

## 3. What this settles for the Spec

- Conflict handling: bot-only branch → `@dependabot rebase` (or let the
  automatic conflict rebase run); agent-touched branch → `rebase-driver.sh`,
  never a bot command (both `rebase` and `recreate` land one force-pushed bot
  commit and drop the agent's fixes).
- Never put `[dependabot skip]` in agent commit messages: it invites Dependabot
  to force-push over the fixes.
- Before merging, re-verify the PR is still open (superseded/closed PRs are a
  normal Dependabot outcome, not an error) and that `commits[0]` is still the
  bot commit (a rebase changes SHAs but keeps order).
- `major` per the §2.4 rule (including 0.x minor) → verify + fix, then `HITL`;
  `minor`/`patch` → auto-merge; `unknown` → `HITL`.
