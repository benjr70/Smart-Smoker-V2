# Dependabot's regenerated lockfile installs cleanly under `--legacy-peer-deps`; the only drift is dev-flag churn a project `.npmrc` would remove

Ticket: [#641](https://github.com/benjr70/Smart-Smoker-V2/issues/641) (part of
wayfinder map
[#639](https://github.com/benjr70/Smart-Smoker-V2/issues/639) — Map: Dependabot
PRs verified, fixed and landed by the Daemon). Researched on 2026-09-07.

Sources:

- Live probes on this machine (npm 11.5.1, node v24.7.0) against `git archive`
  exports of `origin/master` (`9f7ab8e`) and `refs/pull/636/head` (PR #636,
  nanoid 3.3.11 → 3.3.18); every command and its output is transcribed below.
- `git diff origin/master refs/pull/{635,636,637}/head -- package-lock.json`.
- Repo files: `package.json` (root `bootstrap` + `workspaces`),
  `.github/workflows/{ci-tests,e2e-pr-gate,dev-deploy,pr-screenshots-tests,release-please}.yml`,
  `apps/device-service/Dockerfile`, `release-please-config.json`.
- `gh pr view 635|636|637 --json files,author`, `gh pr checks 636`.
- dependabot-core source (`main` on 2026-09-07):
  `npm_and_yarn/lib/dependabot/npm_and_yarn/file_updater/npm_lockfile_updater.rb`,
  `.../file_updater/npmrc_builder.rb`, `npm_and_yarn/Dockerfile`,
  `.../npm_package_manager.rb`.
- npm CLI docs: <https://docs.npmjs.com/cli/v11/commands/npm-ci>,
  <https://docs.npmjs.com/cli/v11/using-npm/config>, and the config
  definitions in `npm/cli` `workspaces/config/lib/definitions/definitions.js`
  (`force`, `legacy-peer-deps`).
- GitHub docs:
  <https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-pull-request-comment-commands>,
  <https://docs.github.com/en/code-security/dependabot/working-with-dependabot/managing-pull-requests-for-dependency-updates>.

## TL;DR

- **(1) Yes, it installs cleanly.** PR #636's lockfile passes
  `npm ci --legacy-peer-deps` (2685 packages, exit 0, lock byte-identical
  afterwards), `npm ci` without the flag, and `npm run bootstrap`. Its CI
  (Hermetic journey suite = `npm ci --legacy-peer-deps`, device-service armv7
  Docker build = `npm ci -w device-service --omit=dev --legacy-peer-deps`) is
  green. All nine workspace symlinks are present.
- **(2) No resolution change, no dropped workspace links, but visible flag
  churn.** Dependabot's diff is the bumped package plus two side effects:
  (a) it refreshes stale workspace metadata that master's lock never got from
  the release-please 1.13.0 bump (workspace `version`/`license`,
  `temperaturechart` range), which `npm run bootstrap` on master produces
  identically; (b) it flips 149 `"dev": true` lines to `"devOptional": true`
  or drops them, because Dependabot builds the tree with peer edges honoured
  (`--force`) while this repo builds it with peers ignored
  (`--legacy-peer-deps`). No `resolved`/`integrity`/`version` differs. The
  next `npm run bootstrap` flips the flags straight back, so a Dependabot
  merge followed by any agent PR that touches the lock produces a noisy
  round-trip diff.
- **(3) Yes, via a committed `.npmrc`.** Dependabot does not run
  `--legacy-peer-deps`; it runs
  `npm install <dep>@<ver> --force --ignore-scripts --package-lock-only`, and
  `--force` is why the repo's NestJS 8/9 peer conflict does not stop it.
  Dependabot copies the repo's `.npmrc` (minus `${VAR}` and `timeout` lines)
  into its working dir before running npm, so `legacy-peer-deps=true` in a
  root `.npmrc` is honoured. Reproduced locally: Dependabot's exact command
  with that `.npmrc` yields a lock that differs from master **only** in the
  nanoid entry. There is no `dependabot.yml` option for it. Adding that
  `.npmrc` is a code change and belongs in the Spec, not here.
- **(4) Fix loop.** A lock that fails `npm ci --legacy-peer-deps` fails with
  EUSAGE (`… package.json and package-lock.json … are in sync … Invalid: lock
  file's X does not satisfy Y`). Repair in-branch with
  `npm install --legacy-peer-deps --package-lock-only --ignore-scripts` (2.5 s,
  touches only the affected entries) and push; put `[dependabot skip]` in the
  commit message so Dependabot keeps rebasing. Use `@dependabot recreate`
  only when the agent wants to discard its own pushes; it "overwrit[es] any
  edits that have been made to the pull request".

## 1. What the three open Dependabot PRs actually change

`gh pr view <n> --json files,author`: each PR is authored by `app/dependabot`
and touches exactly one file, the root `package-lock.json` (#635: +90/−146,
#636: +57/−129, #637: +57/−129).

`git diff origin/master pr/636 -- package-lock.json`, with the `dev` /
`devOptional` flag lines filtered out, leaves only:

```
-      "license": "ISC",                    (root)
+      "license": "MIT",
-      "version": "0.0.1",                  (apps/backend, apps/device-service)
-      "license": "UNLICENSED",
+      "version": "1.13.0",
+      "license": "MIT",
-      "version": "0.1.0",                  (apps/frontend, apps/smoker)
+      "version": "1.13.0",
+      "license": "MIT",
-        "temperaturechart": "^1.0.0",
+        "temperaturechart": "^1.13.0",
+      "license": "MIT",                    (e2e, packages/*)
-      "version": "1.0.0",                  (packages/TemperatureChart)
+      "version": "1.13.0",
-      "version": "3.3.11",                 (node_modules/nanoid)
-      "resolved": ".../nanoid-3.3.11.tgz",
-      "integrity": "sha512-N8Sp...",
+      "version": "3.3.18",
+      "resolved": ".../nanoid-3.3.18.tgz",
+      "integrity": "sha512-DTg4...",
```

Flag counts (`grep -c` on each lock):

| lock                | `"dev": true` | `"devOptional": true` | `"peer": true` |
| ------------------- | ------------: | --------------------: | -------------: |
| `origin/master`     |           798 |                     0 |              0 |
| PR #636             |           686 |                    37 |              0 |
| PR #636 + bootstrap |           798 |                     0 |              0 |

#635 and #637 follow the same pattern (same metadata refresh, same flag flips,
plus the bumped package; #635 also adds the new transitive
`baseline-browser-mapping@2.11.20`).

**Why the workspace metadata moved.** `release-please-config.json` rewrites
the five workspace `package.json` versions and the two `temperaturechart`
ranges on each release; the header comment in `release-please.yml` records
that the nested workspace entries in `package-lock.json` "are NOT rewritten by
a release and do not need to be: npm resolves a linked workspace from the
workspace's own package.json, so stale lock version fields are inert".
Master's lock therefore still says `0.0.1`/`0.1.0`/`^1.0.0` while the
`package.json`s say `1.13.0`/`^1.13.0`. Any npm run that writes the lock
refreshes them, and Dependabot's run did. Probe on the master export:

```
$ npm ci --legacy-peer-deps --ignore-scripts        # master lock, as-is
added 2685 packages in 20s                           # exit 0
$ npm install --legacy-peer-deps --ignore-scripts    # = npm run bootstrap
changed 1 package in 4s
$ cmp package-lock.json <master lock>
package-lock.json differ: byte 203, line 10          # the same metadata refresh Dependabot shipped
```

So this part of the Dependabot diff is not Dependabot-specific: it is the
first write to the lock since the 1.13.0 release, and the lane will see it on
the first Dependabot PR after every release.

## 2. Install probes on the PR #636 export

All runs used `--ignore-scripts --no-audit --no-fund` and
`ELECTRON_SKIP_BINARY_DOWNLOAD=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` (tmpfs
budget; postinstall scripts do not touch the lock).

```
$ npm ci --legacy-peer-deps
added 2685 packages in 27s                           # exit 0; lock byte-identical (cmp)
$ ls -la node_modules | grep '^l'
api-transport -> ../packages/api-transport
backend -> ../apps/backend
device-service -> ../apps/device-service
e2e -> ../e2e
frontend -> ../apps/frontend
smoke-session -> ../packages/smoke-session
smoker -> ../apps/smoker
temperaturechart -> ../packages/TemperatureChart
theme -> ../packages/theme
$ npm ls --workspaces --depth=0 --legacy-peer-deps | grep -E 'temperaturechart|theme|smoke-session|api-transport'
├─┬ api-transport@1.0.0 -> ./packages/api-transport
│ ├── temperaturechart@1.13.0 deduped -> ./packages/TemperatureChart
…                                                    # every workspace link resolves, nothing "invalid"/"missing"

$ npm ci                                             # WITHOUT the flag
added 2685 packages in 22s                           # exit 0

$ npm install --legacy-peer-deps                     # = npm run bootstrap, on top of the PR lock
changed 1 package in 4s                              # exit 0
$ diff <PR lock> package-lock.json | grep -vE '"(dev|devOptional)": true'
(empty)                                              # 149 flag lines changed, nothing else

$ npm ci && npm install                              # no flag, twice: lock unchanged
$ npm install --legacy-peer-deps                     # then the flag: 149 lines, all flags
```

The flag flip is therefore caused by `--legacy-peer-deps` alone, not by
`install` vs `ci`. `npm explain` shows the mechanism: `jest-watch-typeahead`
(a production dependency of `react-scripts`, which `apps/frontend` and
`apps/smoker` depend on) declares `peer jest@"^27.0.0 || ^28.0.0"`. With peer
edges honoured, the whole `jest` subtree is reachable from a prod dependency,
so it loses `dev`; `jest-config`'s `peerOptional ts-node` makes
`ts-node`'s subtree `devOptional`. With `--legacy-peer-deps` those edges do not
exist, so the same packages are `dev` only. The installed tree is identical
either way (same 2685 packages, same `resolved`/`integrity`).

PR #636's own CI confirms the same on GitHub's runners (`gh pr checks 636`):
`Hermetic journey suite` (e2e-pr-gate.yml, `npm ci --legacy-peer-deps`) pass
8m42s, `device-service-armv7` (Dockerfile
`npm ci -w device-service --omit=dev --legacy-peer-deps`) pass 6m1s, all four
`build (*)` jobs pass.

## 3. Why the repo needs the flag, and why Dependabot did not

A from-scratch resolution (all `package.json`s, no lock) without the flag
fails:

```
$ npm install --package-lock-only --ignore-scripts   # fresh dir, no lockfile
npm error ERESOLVE unable to resolve dependency tree
npm error While resolving: backend@1.13.0
npm error Found: @nestjs/websockets@9.1.6
npm error   peer @nestjs/websockets@"^9.0.0" from @nestjs/platform-socket.io@9.1.6
npm error Could not resolve dependency:
npm error peerOptional @nestjs/websockets@"^8.0.0" from @nestjs/core@8.4.7
npm error Fix the upstream dependency conflict, or retry
npm error this command with --force or --legacy-peer-deps
```

`apps/backend` pins `@nestjs/core ^8.0.0` next to `@nestjs/websockets` and
`@nestjs/platform-socket.io` 9.1.6; that is the conflict `--legacy-peer-deps`
has papered over since the workspaces move (commit `66d5415`).

Dependabot never resolves from scratch. `npm_lockfile_updater.rb`
(`run_npm_install_lockfile_only`) builds the command

```
npm install <dep>@<version> --force --ignore-scripts --package-lock-only
```

with the comment "`--force` ignores checks for platform (os, cpu) and
engines". npm's own `force` definition adds "Allow conflicting
peerDependencies to be installed in the root project", which is what lets the
NestJS conflict through. The updater also states its policy on the flag this
repo uses: "Peer deps can be updated with --legacy-peer-deps flag, but it is
not recommended as the flag can mess up dependency resolution and introduce
breaking changes. So we let the update fail" (`PEER_DEPS_PATTERNS` →
`DependencyFileNotResolvable`). Dependabot's image runs Node 24 / npm 11
(`npm_and_yarn/Dockerfile`: `NODEJS_VERSION=24`, `NPM_VERSION=11.17.0`;
`npm_package_manager.rb` supports npm 7–11), so its resolver matches the npm
11.5.1 used here and in CI (`node-version: '24.7.0'` in `ci-tests.yml`,
`e2e-pr-gate.yml` and `docker-build-pr.yml`; the device-service Dockerfile
runs `node:20-bookworm-slim`, whose bundled npm 10 also passed on PR #636).

Reproduction on the master export, Dependabot's exact command:

```
$ npm install nanoid@3.3.18 --force --ignore-scripts --package-lock-only
npm warn using --force Recommended protections disabled.
up to date in 3s                                     # exit 0
$ grep -c '"devOptional": true' package-lock.json    # 37   (same as PR #636)
$ grep -c '"dev": true' package-lock.json            # 686  (same as PR #636)
$ diff package-lock.json <PR #636 lock>
<         "nanoid": "^3.3.18",                        # only the root save-dep, which
                                                     # Dependabot's remove_spurious_root_deps strips
```

## 4. Can Dependabot honour `.npmrc legacy-peer-deps=true`?

There is no Dependabot option for it: the `dependabot.yml` reference
(`dependabot-options-reference`) has no peer-dependency or npm-flag setting,
and there is no `dependabot.yml` in this repo anyway (security-update PRs
only, per #640). What Dependabot does do is write a `.npmrc` into its temp
checkout before every npm run
(`write_temporary_dependency_files` →
`File.write(File.join(lockfile_directory, ".npmrc"), npmrc_content)`). When
the repo has a committed `.npmrc`, `NpmrcBuilder#complete_npmrc_from_credentials`
starts from that file's content, dropping only lines containing `${…}` and
`timeout…`, then appends registry credentials. A `legacy-peer-deps=true`
line survives, and npm reads `legacy-peer-deps` from a project `.npmrc` like
any other config (`docs.npmjs.com/cli/v11/using-npm/config`: project
`.npmrc` is read after CLI flags and env vars). The one exception in the
builder is a credential with an explicit scope, which regenerates `.npmrc`
from credentials and ignores the committed file; this repo has no private
registry credentials.

Reproduction (master export, `.npmrc` containing `legacy-peer-deps=true`):

```
$ npm install nanoid@3.3.18 --force --ignore-scripts --package-lock-only
up to date in 2s                                     # exit 0
$ grep -c '"devOptional": true' package-lock.json    # 0    (master shape)
$ grep -c '"dev": true' package-lock.json            # 798  (master shape)
$ diff <master lock> package-lock.json | grep -vE '"license": |"version": "(0\.0\.1|0\.1\.0|1\.0\.0|1\.13\.0)"|temperaturechart'
>         "nanoid": "^3.3.18",                        # root save-dep (stripped by Dependabot)
<       "version": "3.3.11",  … +      "version": "3.3.18", …   # the bump, nothing else
```

`legacy-peer-deps` and `--force` are compatible: with the former set, npm
ignores peer edges entirely, so `--force`'s peer-conflict allowance never
engages.

npm's `npm ci` page prescribes exactly this: "If you create your
`package-lock.json` file by running `npm install` with flags that can affect
the shape of your dependency tree, such as `--legacy-peer-deps` or
`--install-links`, you _must_ provide the same flags to `npm ci` or you are
likely to encounter errors. An easy way to do this is to run, for example,
`npm config set legacy-peer-deps=true --location=project` and commit the
`.npmrc` file to your repo." The repo currently has **no** `.npmrc` at root
or in any workspace (`ls .npmrc apps/*/.npmrc packages/*/.npmrc` → none) and
carries the flag on every call site instead (`bootstrap`, `ci-tests.yml`,
`e2e-pr-gate.yml`, `dev-deploy.yml` ×2, `pr-screenshots-tests.yml`,
`apps/device-service/Dockerfile`; `install.yml` and `docker-build-pr.yml` go
through `npm run bootstrap`).

## 5. What "the lockfile broke" looks like, and the repair

`npm ci` "will never write to `package.json` or any of the package-locks", and
"If dependencies in the package lock do not match those in `package.json`,
`npm ci` will exit with an error, instead of updating the package lock"
(`npm-ci` docs). Simulated on the PR #636 export by moving
`apps/frontend`'s `web-vitals` range from `^1.1.2` to `^2.1.4` without
touching the lock:

```
$ npm ci --legacy-peer-deps --ignore-scripts
npm error `npm ci` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync. Please update your lock file with `npm install` before continuing.
npm error Invalid: lock file's web-vitals@1.1.2 does not satisfy web-vitals@2.1.4
                                                     # exit 1 (EUSAGE; same class as the
                                                     # "Missing: temperaturechart@1.0.0 from lock file"
                                                     # noted in release-please.yml)
$ npm install --legacy-peer-deps --package-lock-only --ignore-scripts
up to date in 2s                                     # exit 0, real 2.5s
$ diff <PR lock> package-lock.json | grep -vE '"(dev|devOptional)": true'
<         "web-vitals": "^1.1.2"
>         "web-vitals": "^2.1.4"
<     "apps/smoker/node_modules/web-vitals": { … 2.1.4 … }   # nested copy hoisted
<       "version": "1.1.2", … >       "version": "2.1.4", …
$ npm ci --legacy-peer-deps --ignore-scripts
added 2684 packages in 21s                           # exit 0
```

`--package-lock-only` rewrites the lock without touching `node_modules`,
which is what a fix loop wants: seconds, no native builds, no Electron
download, and the diff is confined to the entries the mismatch involved
(plus the flag flip if the lock came from Dependabot).

Two Dependabot behaviours bound how the lane may push that repair
(`managing-pull-requests-for-dependency-updates`):

- "By default, Dependabot will stop rebasing a pull request once extra
  commits have been pushed to it." Including `[dependabot skip]` in the
  commit message lets Dependabot "force push over commits added to its
  branches".
- "By default, Dependabot automatically rebases pull requests to resolve any
  conflicts. If a pull request has not been merged for 30 days, Dependabot
  will stop rebasing the pull request."

Comment commands (`dependabot-pull-request-comment-commands`):
`@dependabot rebase` "Rebases the pull request"; `@dependabot recreate`
"Recreates the pull request, overwriting any edits that have been made to
the pull request."

## 6. Recommendation for the lane

1. **Treat the Dependabot lock as trustworthy input.** It installs under every
   call site the repo uses. No pre-merge lock regeneration is needed; the
   Tier A / Tier B verification the Map already prescribes is the right bar.
2. **Expect and accept two kinds of noise in the diff:** the post-release
   workspace-metadata refresh (first Dependabot PR after each release) and
   the `dev` ↔ `devOptional` flip. Neither changes what gets installed. The
   Spec should not gate on lock diff size.
3. **Put `legacy-peer-deps=true` in a committed root `.npmrc`** as a Slice of
   the Spec (product-config change, out of this ticket's remit). It makes
   Dependabot's lock byte-compatible with `bootstrap` (proved in §4), it is
   what npm's own docs prescribe for a lock built with the flag, and it makes
   the per-call-site `--legacy-peer-deps` flags redundant (they can stay;
   npm merges CLI and `.npmrc`). Watch-out: the lockfile-only nature of
   Dependabot PRs means `ci-tests.yml` will not exercise the change (#640's
   `paths:` gap); the Spec's unit-test slice covers that.
4. **Fix loop when `npm ci --legacy-peer-deps` fails with EUSAGE on the
   Dependabot branch:** run
   `npm install --legacy-peer-deps --package-lock-only --ignore-scripts`,
   verify with `npm ci --legacy-peer-deps`, commit with `[dependabot skip]`
   in the message, push. This keeps the fix inspectable in the PR and keeps
   Dependabot's auto-rebase alive. Reserve `@dependabot recreate` for
   discarding the agent's own pushes (it overwrites them); keep
   `@dependabot rebase` as the first move on a conflict, as the Map already
   decided, and note that a branch the agent has pushed to will only be
   rebased by Dependabot if those commits carry `[dependabot skip]`.
5. **Cap the loop at the Map's 3 attempts.** An EUSAGE that survives a
   `--package-lock-only` regeneration is a `package.json` problem (a range
   Dependabot moved that a workspace cannot satisfy), which is a
   human-visible dependency decision, not a lock repair.
