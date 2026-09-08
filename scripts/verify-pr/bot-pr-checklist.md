<!-- bot-pr-checklist v1 -->

## Manual verification

Fixed Bot-PR checklist (Spec #651). Run the items in order against the hermetic
per-PR stack alone — no hardware, no deployed environment: the cook started in
item 3 is what items 4 and 5 observe. "No console errors" means no uncaught
error in that surface's browser/Electron console, and applies to every item,
including the reachability checks in item 1.

- [ ] Stack healthy: backend /health + /ready, device /health, frontend all 200
- [ ] Electron launches at 800x480, renders the Smoke screen, no console errors
- [ ] Start a cook in Electron: probe temps update <30s, no console errors
- [ ] Web 427x952: cook updates over WebSocket, no reload, no console errors
- [ ] Finish in Electron: History lists it, Review renders, no console errors
- [ ] Settings renders and a toggle persists across reload, no console errors

<!-- /bot-pr-checklist -->

Everything above the closing marker — the opening marker, the heading, the intro
and the six boxes — is the **injected unit**: the `deps-land` lane appends that
block verbatim to a Dependabot PR body once, skipping any PR whose body already
carries the `<!-- bot-pr-checklist v1 -->` marker, which travels with the block.
`/verify-pr` then reads the boxes back out of the body through
`parse-checklist.sh` and ticks the ones it passes. Nothing below the closing
marker is ever injected.

Every box has to fit on one line: this file is Prettier-formatted at
`printWidth: 80` with `proseWrap: always`, and a longer item is re-wrapped onto
a continuation line the parser cannot see, silently truncating the item text.

Screenshot tour (same six shots on every Bot PR, so they diff by eye from one
bump to the next): `smoker-01-smoke-screen`, `smoker-02-smoking-live`,
`frontend-01-smoke-live`, `frontend-02-history`, `frontend-03-review`,
`frontend-04-settings`.
