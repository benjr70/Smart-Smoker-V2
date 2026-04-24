#!/usr/bin/env bash
# .claude/hooks/task-completed-smoke.sh
# Runs when a teammate marks a task completed. Blocks completion if the latest
# commit on the branch lacks a `smoke: PASS|FAIL|SKIPPED` trailer.
#
# Exit codes:
#   0 — trailer present (or nothing to check); allow completion
#   2 — trailer missing; block completion and send feedback to the teammate
#
# Graceful fallback: if `git` fails or the repo state is weird, exit 0 so a
# transient git hiccup does not pin a task in-progress forever. The human
# reviewer still reads commit bodies in PRs.
set -uo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0

LATEST_BODY=$(git log -1 --format=%B 2>/dev/null) || exit 0

# If the HEAD commit is unrelated to the team run (e.g., merge commit, manual
# commit predating the team), don't block. Heuristic: only enforce on commits
# whose first line matches conventional-commit format AND whose body contains
# `Closes #<N>` — that's what the implementer + verifier produce.
if ! printf '%s\n' "$LATEST_BODY" | grep -qE '^[a-z]+(\([^)]+\))?: '; then
  exit 0
fi
if ! printf '%s\n' "$LATEST_BODY" | grep -qE '^Closes #[0-9]+'; then
  exit 0
fi

# Now enforce: commit looks like a team commit, so it must carry a smoke trailer.
if printf '%s\n' "$LATEST_BODY" | grep -qE '^smoke: (PASS|FAIL|SKIPPED)\b'; then
  exit 0
fi

cat >&2 <<'EOF'
commit missing `smoke:` trailer — the verifier must amend the commit message
with one of:

  smoke: PASS — <n>/<n> probes green
  smoke: FAIL — <detail>
  smoke: SKIPPED — <reason>

before this task can be marked completed. See docs/Harness/self-validation.md
and `.claude/agents/verifier.md` for the contract.
EOF

exit 2
