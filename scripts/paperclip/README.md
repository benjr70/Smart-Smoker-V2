# Paperclip bridge

`mirror-slices.sh [--dry-run] <spec-or-issue-number|url>...` mirrors a Spec's
Slices (or a standalone `AFK`/`HITL` issue) into Paperclip tasks so the
Developer → Code Reviewer ∥ QA pipeline runs them in dependency order. Rules and
rationale: `docs/agents/issue-tracker.md` → "Executor: Paperclip", ADR-0002.

`reconcile-prs.sh [--dry-run]` finds every open PR linked to a Paperclip task
(`Closes #N` in the body) and, when GitHub reports it `dirty` (conflicting with
`master`) and the task is waiting on the human, posts a `rebase-requested:`
comment and hands the task back to the Developer, which rebases, reverifies and
hands it back. Run both right after merging a PR; the reconcile script also
suits a timer, needing only `PAPERCLIP_TOKEN` (GitHub reads on this public repo
need no auth; set `GH_TOKEN` for a higher rate limit).

Both need `PAPERCLIP_TOKEN` (a Paperclip board API key); `PAPERCLIP_URL`
defaults to the VM over Tailscale. The mirror also needs `gh` logged in (repo +
project read).

Tests: `bash scripts/paperclip/mirror-slices.test.sh` and
`bash scripts/paperclip/reconcile-prs.test.sh` (stubbed `gh` and `curl`).
