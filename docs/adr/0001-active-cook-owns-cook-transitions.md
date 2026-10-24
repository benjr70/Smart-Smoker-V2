---
status: proposed
---

# Active Cook owns the cook transitions and depends only on the models

"Which cook is the smoker attached to" was re-derived in about a dozen backend
places with three different null rules, and the start / toggle / pull / finish /
auto-stop / clear transitions were split across State, Smoke, StaleCook,
Timeline and PreSmoke, held together by `forwardRef` and raw-model injections.
We decided on one Active Cook module that reads the `state` and `Smoke` models
directly (no feature services), hands callers an immutable snapshot (or an
explicit idle result; reads never write), and owns every transition, including
the start, pull and finish stamps, as conditional writes where only the winner
runs side effects. Stats recompute, broadcast and push go out through ports.
Deciding *that* a cook is stale stays in StaleCook, which calls Active Cook's
auto-stop. Deleting a stored smoke stays with history and clears the Active
Cook first if it is the one being deleted.

## Considered Options

- **A separate Cook Lifecycle module over a read-only Active Cook**: rejected.
  Two modules would each need the state singleton and the attach rules, which
  brings back the DI cycle this decision removes.
- **Building Active Cook on `StateService`/`SmokeService`**: rejected. That is
  the shape of the old `CurrentSmokeService`, and it is why `SmokeModule` could
  not use it.
- **NestJS EventEmitter for side effects**: rejected. Subscribers you can't see
  from the module scatter the "what happens on finish" knowledge.
