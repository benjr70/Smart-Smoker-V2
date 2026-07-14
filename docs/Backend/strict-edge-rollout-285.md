# Strict validation-edge rollout — client sweep (#285)

Parent PRD: #279. This document records the audit behind the breaking
"strict edge" rollout: the global `ValidationPipe` in
`apps/backend/src/main.ts` runs with

```ts
new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
```

`forbidNonWhitelisted: true` rejects any request body that carries a field the
target DTO does not declare (HTTP 400), and the deep persistence layer turns
"missing current smoke" into a real 404. This audit sweeps every write call in
`apps/frontend/src` and `apps/smoker/src` against the whitelisted backend DTOs
and fixes the callers (and two backend gaps) so the strict flip does not break
the UI or device.

## Method

- Enumerated every `axios.post` / `axios.put` / `fetch(POST)` / socket `emit`
  in `apps/frontend/src` and `apps/smoker/src`.
- Cross-referenced each against the backend controller `@Body()` DTO and its
  `class-validator` whitelist.
- Verified empirically that `class-validator`'s `forbidUnknownValues` (on by
  default) rejects **any** body — even an empty one — when the `@Body()` type is
  a class carrying no `class-validator` metadata (400 "an unknown value was
  passed to the validate function").

## Findings

### A. Clients that sent non-whitelisted fields (extra-field 400)

| Caller | Endpoint | DTO whitelist | Problem | Fix |
| --- | --- | --- | --- | --- |
| `ratingsService.updateRatings` | `POST ratings/:id` | `smokeFlavor, seasoning, tenderness, overallTaste, notes` | Posts the full fetched rating incl. persisted `_id`/`__v` (see `ratingsCard.tsx`) | Project to the five whitelisted fields; id stays in the URL |
| `ratingsService.setCurrentRatings` | `POST ratings/` | same | Same object shape can carry `_id`/`__v` | Same projection |
| `preSmokeService.setCurrentPreSmoke` | `POST presmoke` | `name, meatType, weight{unit,weight}, steps, notes` | `preSmokeStep.tsx` sets the whole fetched doc into state (`_id`, `__v`, nested `weight._id`) and re-posts it on unmount | Project to whitelisted fields incl. a rebuilt `weight` |
| `postSmokeService.setCurrentPostSmoke` | `POST postSmoke/current` | `restTime, steps, notes` | Component currently picks explicit fields (clean), but the service is now hardened defensively | Project in the service |
| `smokerService.setSmokeProfile` | `POST smokeProfile/current` | `chamberName, probe1Name, probe2Name, probe3Name, notes, woodType` | Component builds an explicit DTO (clean); service hardened defensively | Project in the service |
| `notificationsService.setNotificationSettings` | `POST notifications/settings` | rule fields (see below) | Posts `{ settings: [...] }` where each rule was fetched from the backend and carries a subdocument `_id` | Strip `_id`/`__v` per rule; preserve `lastNotificationSent` |

### B. Backend endpoints that rejected every body (decorator-less `@Body()`)

These `@Body()` types had **no** `class-validator` metadata, so under
`forbidNonWhitelisted` + `forbidUnknownValues` they returned 400 for any body:

| Endpoint | Old `@Body()` type | Client caller | Fix |
| --- | --- | --- | --- |
| `POST notifications/subscribe` | `NotificationSubscription` (Mongoose schema class) | `App.tsx` push-subscription registration | New `NotificationSubscriptionDto` (+ `KeysDto`) |
| `POST notifications/settings` | `NotificationSettings` (Mongoose schema class) | `notifications.tsx` on unmount | New `NotificationSettingsDto` (+ `NotificationSettingDto`) |
| `PUT/POST api/state` | `StateDto` (Swagger-only, no validators) | none today (frontend/smoker use `state/toggleSmoking` + `state/clearSmoke`, both body-less) | Added `@IsString`/`@IsBoolean` for correctness; these routes were otherwise dead-400 |

`NotificationSettingDto` whitelist: `type, message, probe1, op, probe2?,
offset?, temperature?, lastNotificationSent?`. `lastNotificationSent` is
server-managed but validated and optional so the client can round-trip it
without resetting the notification throttle; the subdocument `_id` is stripped
client-side. `notificationSettings.schema.ts` `lastNotificationSent` was made
optional (`?`) so the DTO stays assignable to the service param — the service
itself was not touched.

### C. Verified safe (no change needed)

- **`smoker` app**: `stateService.toggleSmoking` (body-less PUT),
  `tempsService.postTempsBatch` (`POST temps/batch`). The batch handler types
  `@Body()` as `TempDto[]`; an array metatype makes the `ValidationPipe` skip
  validation entirely, so extra fields cannot 400 there.
- **WebSocket emits** (`clear`, `events`, `smokeUpdate`, `refresh`,
  `identity`): every `@SubscribeMessage` handler types `@MessageBody()` as a
  primitive (`string`/`number`), which the pipe skips. Socket payloads are not
  affected by the strict edge.
- **`deviceService.connectToWiFi`** posts to the **device-service** app
  (`http://localhost:3003`), which has **no** `ValidationPipe` in its
  `main.ts`. Out of scope for this backend slice.
- **"Current" reads** (`getCurrentPreSmoke`, `getCurrentPostSmoke`,
  `getCurrentRatings`, `getCurrentSmokeProfile`, `getState`, `getCurrentTemps`)
  use the backend `readCurrent` fallback policy and still return `200` with a
  default, so no client relied on `200 + null` in a way the 404 policy breaks.
  The `getByIdOrThrow` paths (history/review by-id reads) already sit behind a
  valid id, and the axios `.catch` handlers degrade gracefully on a 404.

## Changes landed in this slice

Frontend / smoker client sweep (payload projections + updated tests):

- `apps/frontend/src/Services/ratingsService.ts`
- `apps/frontend/src/Services/preSmokeService.ts`
- `apps/frontend/src/Services/postSmokeService.ts`
- `apps/frontend/src/Services/smokerService.ts`
- `apps/frontend/src/Services/notificationsService.ts`

Backend DTOs so valid bodies are accepted under the strict edge:

- `apps/backend/src/notifications/notificationSubscriptionDto.ts` (new)
- `apps/backend/src/notifications/notificationSettingsDto.ts` (new)
- `apps/backend/src/notifications/notifications.controller.ts` (use the DTOs)
- `apps/backend/src/notifications/notificationSettings.schema.ts`
  (`lastNotificationSent` optional)
- `apps/backend/src/State/stateDto.ts` (`class-validator` decorators)

`forbidNonWhitelisted: true` is the target end state and is already enabled in
`apps/backend/src/main.ts` (it shipped with #280); no deferral to
`false` was needed once the callers above were fixed.

## Human verification required

The following acceptance-criteria items need a running full stack and could not
be exercised headlessly in the sandbox (no live services / browser):

- [ ] `npm start` the full stack; walk the **current-smoke read + save** flow
      (pre-smoke, smoke profile, temps, post-smoke, ratings) and confirm each
      save returns 2xx (no 400) with the strict edge on.
- [ ] Settings page: add/edit a notification rule, leave the page, reload —
      confirm `POST notifications/settings` returns 2xx and the rule persists
      (no stray `_id` 400).
- [ ] In a push-capable browser, confirm `POST notifications/subscribe`
      succeeds (2xx) after granting notification permission.
- [ ] Confirm no console 400s from any client write during a full smoke
      session (frontend and smoker/device).

Automated coverage for the request-shape behavior (behavior 2 in the issue)
lives in the updated `*.Service.test.ts` suites (assert only whitelisted fields
are sent) and the new backend `*Dto.spec.ts` files (assert stray fields are
rejected under `whitelist + forbidNonWhitelisted`).
