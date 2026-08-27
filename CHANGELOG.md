# Changelog

## [1.12.0](https://github.com/benjr70/Smart-Smoker-V2/compare/v1.11.0...v1.12.0) (2026-08-27)


### Features

* **backend:** heads-up push before probe reaches its target ([#556](https://github.com/benjr70/Smart-Smoker-V2/issues/556)) ([d1ee9e1](https://github.com/benjr70/Smart-Smoker-V2/commit/d1ee9e1e0ea1cb81d643ede9b897c1590848cb81))
* **monorepo:** cook log slice 1 — cook-events backend, socket and web EventLog card ([#562](https://github.com/benjr70/Smart-Smoker-V2/issues/562)) ([8b15607](https://github.com/benjr70/Smart-Smoker-V2/commit/8b15607fdb4feb6c5a01f5eb722582e4fc371ea2))
* **monorepo:** cook log slice 2 — event markers on the chart and a history cook log ([#563](https://github.com/benjr70/Smart-Smoker-V2/issues/563)) ([05935d3](https://github.com/benjr70/Smart-Smoker-V2/commit/05935d3ad3ee187f401b44d4674d956e690a558e))
* **monorepo:** cook log slice 2 — event markers on the chart and a history cook log ([#563](https://github.com/benjr70/Smart-Smoker-V2/issues/563)) ([16b7e18](https://github.com/benjr70/Smart-Smoker-V2/commit/16b7e1834b1593860e401ea10e0bdbe9f4a13d50))
* **monorepo:** cook log slice 3 — editable stamp catalogue, web StampEditor and socket sync ([#564](https://github.com/benjr70/Smart-Smoker-V2/issues/564)) ([7e7878e](https://github.com/benjr70/Smart-Smoker-V2/commit/7e7878e863656a4d68d607a2acc964004e19227f))
* **smoker:** touchscreen stamp bar, chart markers and catalogue sync ([#565](https://github.com/benjr70/Smart-Smoker-V2/issues/565)) ([e759443](https://github.com/benjr70/Smart-Smoker-V2/commit/e759443e59fc907eda2aed9acb4a001b6ab368d2))


### Bug Fixes

* **deploy:** stop prod disk filling with stale anon volumes and image tags ([#553](https://github.com/benjr70/Smart-Smoker-V2/issues/553)) ([5314c75](https://github.com/benjr70/Smart-Smoker-V2/commit/5314c754e673d73064220f4896e2b36409efbd32))

## [1.11.0](https://github.com/benjr70/Smart-Smoker-V2/compare/v1.10.0...v1.11.0) (2026-08-24)


### Features

* **backend:** auto-stop a stale cook when a post-gap reading arrives ([#549](https://github.com/benjr70/Smart-Smoker-V2/issues/549)) ([8a9a596](https://github.com/benjr70/Smart-Smoker-V2/commit/8a9a596d9c91e0be47eff42fe64670254162021c))
* **backend:** auto-stop stale cook via lazy timeline poll ([#546](https://github.com/benjr70/Smart-Smoker-V2/issues/546)) ([3df5f76](https://github.com/benjr70/Smart-Smoker-V2/commit/3df5f766910a94b6354ec2cc3842012d74f4bce6))
* **backend:** clip stored temp series to the cook's start/finish stamps ([#552](https://github.com/benjr70/Smart-Smoker-V2/issues/552)) ([e344f84](https://github.com/benjr70/Smart-Smoker-V2/commit/e344f84b20e3fd7381c86dfe394e91980b28957f))
* **backend:** heal legacy cook windows in stats rebuild ([#551](https://github.com/benjr70/Smart-Smoker-V2/issues/551)) ([9251326](https://github.com/benjr70/Smart-Smoker-V2/commit/92513269807c4ac7af750ceead0f1e981d1def8e))
* **backend:** push notification on cook auto-stop ([#550](https://github.com/benjr70/Smart-Smoker-V2/issues/550)) ([f97f2b6](https://github.com/benjr70/Smart-Smoker-V2/commit/f97f2b64377be990a9fff024b6c8514deb41026f))
* **monorepo:** add configurable auto-stop idle threshold setting ([#545](https://github.com/benjr70/Smart-Smoker-V2/issues/545)) ([e9216e6](https://github.com/benjr70/Smart-Smoker-V2/commit/e9216e69655505a4cfb8c47daa84b478fc78d8af))
* **monorepo:** prompt before smoking over an auto-stopped cook ([#547](https://github.com/benjr70/Smart-Smoker-V2/issues/547)) ([69740cd](https://github.com/benjr70/Smart-Smoker-V2/commit/69740cd69189f75de1e6f6c64d02a8f06e00ff3b))

## [1.10.0](https://github.com/benjr70/Smart-Smoker-V2/compare/v1.9.0...v1.10.0) (2026-08-22)


### Features

* **backend:** delete a smoke and its children in one server-side cascade ([#532](https://github.com/benjr70/Smart-Smoker-V2/issues/532)) ([9e02606](https://github.com/benjr70/Smart-Smoker-V2/commit/9e02606da78ed5c409d96a00f1e4ae77ab61ba9c))
* **backend:** serve stats from a stored, self-healing aggregate ([#534](https://github.com/benjr70/Smart-Smoker-V2/issues/534)) ([e46b853](https://github.com/benjr70/Smart-Smoker-V2/commit/e46b8533f2b76842c29bd8f5375515b8271ba21c))
* **backend:** stamp peak chamber at finish with lazy legacy backfill ([#535](https://github.com/benjr70/Smart-Smoker-V2/issues/535)) ([48cc4ac](https://github.com/benjr70/Smart-Smoker-V2/commit/48cc4ac234843ee7972ee1ce3f8759fadc14b352))
* **frontend:** full Stats screen parity with records, breakdowns and score bars ([#536](https://github.com/benjr70/Smart-Smoker-V2/issues/536)) ([b2fec9f](https://github.com/benjr70/Smart-Smoker-V2/commit/b2fec9f58f14f679808b9e7990eaf494eadb6252))
* **monorepo:** add stats aggregator, endpoint and Stats tab ([#533](https://github.com/benjr70/Smart-Smoker-V2/issues/533)) ([3b9f1bc](https://github.com/benjr70/Smart-Smoker-V2/commit/3b9f1bce987743fecc40ae3043ca127ef7b9c908))


### Bug Fixes

* **scripts:** stop pre-deploy backup from filling the disk ([#524](https://github.com/benjr70/Smart-Smoker-V2/issues/524)) ([87b9728](https://github.com/benjr70/Smart-Smoker-V2/commit/87b9728c9d408e4b9b7927f15474d90a9ea37b32))

## [1.9.0](https://github.com/benjr70/Smart-Smoker-V2/compare/v1.8.0...v1.9.0) (2026-08-17)


### Features

* **backend:** estimate when the running cook will be done ([#521](https://github.com/benjr70/Smart-Smoker-V2/issues/521)) ([78ea547](https://github.com/benjr70/Smart-Smoker-V2/commit/78ea5476a9ec5bd7c24fc6c1a0c3e56a479f0106))
* **frontend:** show when the running cook will be done ([#522](https://github.com/benjr70/Smart-Smoker-V2/issues/522)) ([32596b1](https://github.com/benjr70/Smart-Smoker-V2/commit/32596b1597f8b674f7e793700f70296b30f206cd))
* **smoker:** show when the running cook will be done on the top bar ([#523](https://github.com/benjr70/Smart-Smoker-V2/issues/523)) ([1b067bf](https://github.com/benjr70/Smart-Smoker-V2/commit/1b067bfc18d8488f13671a7842f1c8ff782221ad))


### Bug Fixes

* **backend:** resolve eslint parserOptions.project against the config dir ([#519](https://github.com/benjr70/Smart-Smoker-V2/issues/519)) ([127232a](https://github.com/benjr70/Smart-Smoker-V2/commit/127232a6b36938d023e8457a00d66611cd6fefa4))

## [1.8.0](https://github.com/benjr70/Smart-Smoker-V2/compare/v1.7.0...v1.8.0) (2026-08-16)


### Features

* **agent:** conventional PR titles for team-pickup and ralph ([#509](https://github.com/benjr70/Smart-Smoker-V2/issues/509)) ([10132ad](https://github.com/benjr70/Smart-Smoker-V2/commit/10132ada506ff3c87038654607d352d9941266a7))
* **agent:** turn-squash tools — pickup triage, CI wait, verify-pr boot ([#490](https://github.com/benjr70/Smart-Smoker-V2/issues/490)) ([8a01678](https://github.com/benjr70/Smart-Smoker-V2/commit/8a01678b7aa455cea258c4e8751738e763583c96))
* **ci:** PR-title validator script + advisory lint workflow ([#505](https://github.com/benjr70/Smart-Smoker-V2/issues/505)) ([6dfa55d](https://github.com/benjr70/Smart-Smoker-V2/commit/6dfa55d022b7d6ace55b8ccf62a6dca87498e3f1))
* **daemon:** finish outstanding PRs before new pickup ([#465](https://github.com/benjr70/Smart-Smoker-V2/issues/465)) ([7d522ce](https://github.com/benjr70/Smart-Smoker-V2/commit/7d522cec1d6b2f1d860202194721d1d95ed99ba1))
* **monorepo:** replace notification rule schema with structured settings, a pure alert engine and the chamber Temperature Alert ([#440](https://github.com/benjr70/Smart-Smoker-V2/issues/440)) ([bb8adf8](https://github.com/benjr70/Smart-Smoker-V2/commit/bb8adf8fd1907c699d3699f2b7a4b5f3defb5335)), closes [#419](https://github.com/benjr70/Smart-Smoker-V2/issues/419)
* **verify-pr:** post UI screenshots into the PR description ([#441](https://github.com/benjr70/Smart-Smoker-V2/issues/441)) ([0ad36bc](https://github.com/benjr70/Smart-Smoker-V2/commit/0ad36bc772ddaf155affcf138eb9baf047e5ae0a))


### Bug Fixes

* **agent:** Fable-aware usage gate, exit-0 exhaustion guard, opus fallback ([#508](https://github.com/benjr70/Smart-Smoker-V2/issues/508)) ([e61e82a](https://github.com/benjr70/Smart-Smoker-V2/commit/e61e82a9ad12ebd68d4b849bc4aa84e7b6533392))
* **compose:** make the device healthchecks actually run ([#436](https://github.com/benjr70/Smart-Smoker-V2/issues/436)) ([42c8b79](https://github.com/benjr70/Smart-Smoker-V2/commit/42c8b79f963cddf3a88f9b0fcea62d45959ab03b))
* **frontend:** match input field backgrounds to design in dark mode ([#518](https://github.com/benjr70/Smart-Smoker-V2/issues/518)) ([843c0da](https://github.com/benjr70/Smart-Smoker-V2/commit/843c0da70feceddcb989d47f0ba973de05c56c55))
