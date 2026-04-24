# Harness

The harness is the set of automated gates and feedback loops that let agents (and humans) ship changes without waiting for a reviewer to catch every regression. It implements [PRD #183 — Level 6: Harness Engineering & Automated Feedback Loops](https://github.com/benjr70/Smart-Smoker-V2/issues/183).

The thesis: **Level 5 gives agents capability, Level 6 gives them backpressure.** Every layer below runs automatically on commit, on PR, on deploy, or on schedule — and reports back in the same transcript where the change was made.

## Pillars

| Pillar | What it catches | Docs |
|--------|-----------------|------|
| **Backpressure** | Format/lint violations, type errors, broken E2E, Docker build failures, stale docs | [Backpressure](backpressure.md) |
| **Self-validation** | Unhealthy services post-boot, broken frontend, Ralph-generated regressions | [Self-validation](self-validation.md) |
| **Infrastructure** | Terraform drift, broken Ansible intent, unhealthy compose services, failed VM provisions | [Infrastructure](infra.md) |

## Advisory → blocking rollout

Every new gate ships as **advisory** for ~2 weeks. Workflows set `continue-on-error: true`, the pre-commit hook exits 0 even on failure. This is deliberate — "throughput over perfection" per the PRD. The bake window gives us time to:

- Tune false-positive noise before it blocks in-flight branches
- Fix pre-existing violations that the new gate surfaces
- Let agents + humans learn the new signal before it starts failing CI

**Week-3 flip** — ~2 weeks after merge we flip each gate to blocking by removing `continue-on-error` (and dropping `exit 0` from `.husky/pre-commit`). Every gate has an inline comment pointing at this PRD so the flip is a mechanical grep-and-edit.

## Adding a new gate

When you add a new CI check or runtime validator:

1. Choose the pillar it belongs in (backpressure / self-validation / infra).
2. Ship the workflow or script with `continue-on-error: true` and a comment `# PRD #183, flip after ~2 weeks`.
3. Document it in the corresponding pillar page here so agents can find it without grepping `.github/workflows/`.
4. Add a calendar reminder for the blocking flip.

If the gate protects something critical enough that you cannot stomach 2 weeks of advisory output, ship it blocking from day one — but be ready for it to break in-flight branches.

## Where the wiring lives

- `.husky/pre-commit` — husky-managed hook, runs `lint-staged`
- `.github/workflows/*.yml` — CI gates (typecheck, e2e, docker-build-pr, docs-freshness, terraform-plan, terraform-drift, ansible-lint)
- `scripts/smoke/run.ts` — Playwright-based post-deploy smoke (see [Self-validation](self-validation.md))
- `scripts/ralph/ralph-prompt.md` — Ralph's post-implementation smoke step
- `AGENTS.md` — agent-facing index that points at all of the above
