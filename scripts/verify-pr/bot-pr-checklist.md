<!-- bot-pr-checklist v1 -->

## Manual verification

Fixed Bot-PR checklist (Spec #651). The `deps-land` lane appends this section
verbatim to a Dependabot PR body before its Tier B `/verify-pr` round; the round
ticks the boxes it passes. Every item is one action plus one observable, run
against the hermetic per-PR stack alone — no hardware, no deployed environment.
Run them in order: the cook started in item 3 is what items 4 and 5 observe. "No
console errors" means no uncaught error in that surface's browser/Electron
console, and applies to every item, including the reachability checks in item 1.

- [ ] Stack healthy: backend /health + /ready, device /health, frontend all 200
- [ ] Electron launches at 800x480, renders the Smoke screen, no console errors
- [ ] Start a cook in Electron: probe temps update <30s, no console errors
- [ ] Web 427x952 shows the live cook, chart >=1 line, no 5xx, no console errors
- [ ] Finish the cook: History lists it, Review draws chart, no console errors
- [ ] Settings renders and a toggle persists across reload, no console errors

Screenshot tour (same six shots on every Bot PR, so they diff by eye from one
bump to the next): `smoker-01-smoke-screen`, `smoker-02-smoking-live`,
`frontend-01-smoke-live`, `frontend-02-history`, `frontend-03-review`,
`frontend-04-settings`.
