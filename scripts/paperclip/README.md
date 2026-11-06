# Paperclip bridge

`mirror-slices.sh [--dry-run] <spec-or-issue-number|url>...` mirrors a Spec's
Slices (or a standalone `AFK`/`HITL` issue) into Paperclip tasks so the
Developer → Code Reviewer ∥ QA pipeline runs them in dependency order. Rules and
rationale: `docs/agents/issue-tracker.md` → "Executor: Paperclip", ADR-0002.

Needs `gh` logged in (repo + project read) and `PAPERCLIP_TOKEN` (a Paperclip
board API key); `PAPERCLIP_URL` defaults to the VM over Tailscale. Re-run after
merging a Slice's PR to close its task and unblock dependents.

Tests: `bash scripts/paperclip/mirror-slices.test.sh` (stubbed `gh` and `curl`).
