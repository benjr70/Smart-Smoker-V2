# Ralph Loop: Implement GitHub Issue

You are an autonomous developer implementing a single GitHub issue as part of a development loop. Follow these instructions precisely.

## Context Files

Read these files for project conventions and TDD methodology:
- @CLAUDE.md
- @.agents/skills/tdd/SKILL.md
- @.agents/skills/tdd/tests.md
- @.agents/skills/tdd/mocking.md
- @.agents/skills/tdd/deep-modules.md
- @.agents/skills/tdd/interface-design.md

## Your Task

Implement issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}

### Issue Body

{{ISSUE_BODY}}

## Rules

### 1. Understand before coding

- Read the acceptance criteria, interface changes, and behaviors to test carefully.
- If there is a "Parent PRD" reference, fetch it with `gh issue view <number>` to understand the broader context.
- If there is a "Blocked by" section, verify those issues are closed with `gh issue view <number> --json state --jq '.state'`. If any blocker is still open, output `<ralph>BLOCKED #<number></ralph>` and stop immediately.
- Explore the relevant parts of the codebase before writing any code.

### 2. Implement using TDD (red-green-refactor)

Follow the TDD skill methodology:

- Use the "Behaviors to Test" section from the issue as your test plan — these replace the interactive TDD planning step.
- Use the "Testing Priority" section to decide which tests are critical vs nice-to-have.
- Use the "Interface Changes" section to understand what modules to modify.
- Work in VERTICAL SLICES. One test at a time, then implementation, then next test.
- DO NOT write all tests first then all implementation.
- Tests must verify behavior through public interfaces, not implementation details.
- Only mock at system boundaries (external APIs, hardware, databases) — never mock internal collaborators.

### 3. Run tests (CRITICAL — monorepo rules)

Tests MUST be run from within each app directory, NOT from the repository root:

```
apps/backend/         → cd apps/backend && npm test
apps/device-service/  → cd apps/device-service && npm test
apps/frontend/        → cd apps/frontend && npm test
apps/smoker/          → cd apps/smoker && npm test
packages/TemperatureChart/ → cd packages/TemperatureChart && npm test
```

- Run tests for ALL apps that have changes.
- All tests must pass before committing.
- If tests fail, fix the issue and re-run. Do not commit failing tests.

### 4. Lint and format

From the repository root:
```
npm run lint:fix
npm run format
```

### 5. Self-validation smoke (PRD #183)

Before committing, run the smoke script against localhost so the commit message
can carry a `smoke: PASS|FAIL|SKIPPED` line — reviewers + downstream gates rely
on it. Steps:

1. Best-effort start the relevant services (backend, frontend, device-service)
   if they aren't already running. If you can't start them in this sandbox
   (e.g., no docker, missing env), record `SKIPPED` and skip to step 4.
2. Install smoke deps once per workspace if missing:
   ```bash
   cd scripts/smoke && npm install --legacy-peer-deps && npx playwright install --with-deps chromium
   ```
3. Run the smoke script:
   ```bash
   cd scripts/smoke && npm run smoke
   # or with a device probe:
   # npx tsx run.ts --backend http://localhost:3001 --frontend http://localhost:3000 --device http://localhost:3003
   ```
   Capture the final `smoke: ...` line from stdout.
4. Decide the smoke outcome:
   - Exit code `0` → `smoke: PASS`
   - Exit code `1` → `smoke: FAIL` — investigate; if the failure is in code you
     just wrote, fix it and re-run before committing.
   - Couldn't run (no services up, sandbox lacks chromium, etc.) →
     `smoke: SKIPPED — <one-line reason>`

### 6. Commit

- Stage only the files you changed (do not use `git add .` or `git add -A`).
- Commit message format:
  ```
  feat(<scope>): <short description>

  Closes #{{ISSUE_NUMBER}}
  smoke: PASS|FAIL|SKIPPED — <one-line detail>
  ```
- Scope should match the app(s) changed (e.g., `backend`, `frontend`, `device-service`).
- If multiple apps changed, use the primary one or `monorepo`.
- The `smoke:` trailer is REQUIRED — never omit it. PRD #183 graders + the
  ralph PR opener look for that line.

### 7. Update the GitHub issue

```bash
gh issue comment {{ISSUE_NUMBER}} --body "Implemented in $(git rev-parse --short HEAD). Summary: <what you did>"
gh issue edit {{ISSUE_NUMBER}} --remove-label "ralph:in-progress" --add-label "ralph:done"
gh issue close {{ISSUE_NUMBER}}
```

### 8. Report status

After completing all steps, output exactly ONE of these signals:

- `<ralph>DONE #{{ISSUE_NUMBER}}</ralph>` — if you successfully implemented and committed the issue.
- `<ralph>FAILED #{{ISSUE_NUMBER}}: <reason></ralph>` — if you could not complete the task (explain why).
- `<ralph>BLOCKED #{{ISSUE_NUMBER}}: blocked by #<number></ralph>` — if a blocking issue is still open.

Then check if any open issues with label `ralph` remain: `gh issue list --label ralph --state open --json number --jq 'length'`

If the count is 0, also output: `<ralph>COMPLETE</ralph>`

## IMPORTANT

- ONLY WORK ON THIS ONE ISSUE. Do not look ahead to other issues.
- Do not modify code unrelated to this issue.
- Follow existing patterns and conventions from CLAUDE.md.
- Do not add unnecessary abstractions, comments, or features beyond the acceptance criteria.
