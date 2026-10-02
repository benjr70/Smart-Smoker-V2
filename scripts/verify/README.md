# verify — Smart Smoker's side of the auto-agent harness

The autonomous Daemon that works this repo's `AFK` tickets is the
[auto-agent harness](https://github.com/benjr70/auto-agent). It owns the
verification round: the checklist, the launchers, the screenshot tour and the
evidence. This repo owns only how its own environment comes up, and declares
that in [`.auto-agent/harness.json`](../../.auto-agent/harness.json). The files
here are what that declaration names.

| File              | What it is                                                                                                                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider`        | The Environment provider: `up --pr N` boots the per-PR stack through [`scripts/stack-runner`](../stack-runner/README.md), `down --pr N` tears it down, `smoke` runs [`scripts/smoke`](../smoke/README.md), `status` reports the deployed environment. |
| `smoker-launcher` | The `smoker` Surface's launcher: maps the stack URLs into the Electron shell and execs it. The harness supplies the display, the debugging port and the lifecycle.                                                                                    |
| `shell-bundle.sh` | Keeps the shell's main-process bundle built from this checkout; `provider up` and the Host extension both call it.                                                                                                                                    |
| `verify.test.sh`  | The suite for all of the above and for `.auto-agent/host-extension`.                                                                                                                                                                                  |

The contract the provider implements, with its exit codes, is
`plugin/providers/CONTRACT.md` in the harness repo. To check the provider
against it from a Host (this boots a real stack):

```bash
~/auto-agent-install/bin/auto-agent provider-check .
```

## Tests

```bash
bash scripts/verify/verify.test.sh
# and, with a checkout of the harness, its own Provider check against a stub stack:
AUTO_AGENT_ROOT=~/auto-agent-install bash scripts/verify/verify.test.sh
```

No docker, display, Electron or tailnet is needed: every script is driven
through its documented seams.
