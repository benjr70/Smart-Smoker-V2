# Research: series-serving strategy for the Compare Cooks chart

Ticket: [#611](https://github.com/benjr70/Smart-Smoker-V2/issues/611) (part of the Compare Cooks map).
Investigated 2026-08-30 against the repo source and the live dev-cloud stack
(`https://smart-smoker-dev-cloud.tail74646.ts.net:8443`).

## TL;DR

- **Decision: (b) — add `GET /api/temps/:tempsId/series?points=300`, a decimated
  numeric endpoint.** The numbers support the lean: a raw stored series for a
  12-hour cook is ~7,900 rows / ~1.5 MB of JSON, and the compare view fetches
  **two** cooks — ~3 MB on the wire, **uncompressed** (the dev nginx sends no
  `Content-Encoding`, verified live), parsed and string→number coerced on a
  phone, only for the client to immediately throw ~96% of it away with
  `decimate(temps, 300)`. The decimated response is ~28 KB per cook (~56 KB for
  two) — roughly **54× smaller** — and the decimation algorithm is ~40 lines of
  pure, dependency-free bucket-mean logic that ports cleanly into the temps
  service.
- The one honest caveat: option (a) is zero backend work and the review screen
  proves it functions. It functions because the review screen loads **one** cook
  behind a spinner; compare loads two at once, and the second cook doubles every
  cost while the user is actively flipping between picks.
- (b) also erases the string-temp wart at the right layer: the temps collection
  stores readings as **strings**, and today every client re-coerces them
  (`apps/frontend/src/api/client.ts:464` `asReading`,
  `apps/smoker/.../useTemperatureSeries.ts:31` `parseFloat`). A numeric series
  endpoint answers in the shape charts actually consume — the same shape
  `cookEvents` already chose for its snapshot temps
  (`cook-events.schema.ts:47-61`, numbers, nullable).

## 1. What exists today (source)

### The raw endpoint and its shape

- `GET /api/temps/:id` → `TempsController.getAllTempsById`
  (`apps/backend/src/temps/temps.controller.ts:23-26`, controller base
  `api/temps` at line 9). Returns full Mongoose docs.
- `Temp` schema (`apps/backend/src/temps/temps.schema.ts:5-23`): `MeatTemp`,
  `Meat2Temp`, `Meat3Temp`, `ChamberTemp` — **all `string`** — plus `tempsId:
  string` and `date: Date`. Compound index `{ tempsId: 1, date: -1 }`
  (`temps.schema.ts:35`).
- `TempsService.getAllTempsById` (`apps/backend/src/temps/temps.service.ts:159-173`)
  already **clips the series to the cook's stamped window** — `startedAt`
  −15 min to `finishedAt` +15 min (`CLOCK_SKEW_TOLERANCE_MS`,
  `temps.service.ts:25`, window built at `temps.service.ts:49-62`), falling back
  to the unclipped series when the clip would return nothing. So the *range* of
  a series is already bounded; the *density* is not.
- Key/type boundary (relevant to compare, which draws both): `temps` rows are
  keyed by `smoke.tempsId` (`apps/backend/src/smoke/smoke.schema.ts:16`) with
  string temps; `cookEvents` are keyed by `smokeId`
  (`apps/backend/src/cookEvents/cook-events.schema.ts:27`) with **numeric,
  nullable** snapshot temps (`cook-events.schema.ts:47-61`), served under
  `api/cook-events/smoke/:smokeId` (`cook-events.controller.ts:21,52`). A
  compare screen therefore already juggles two keys per cook; the series
  endpoint keeps `tempsId` addressing to match the resource it thins.

### How dense a stored series is

- The firmware emits a reading every **500 ms**
  (`MicroController/MicroController.ino:102`).
- The websocket gateway relays every frame but **persists every 11th**
  (`MESSAGES_PER_STORED_READING = 11`,
  `apps/backend/src/websocket/events.gateway.ts:23,139-145`, store at line 183)
  → one stored row every **~5.5 s** while `smoking` is true. (The smoker's
  offline buffer flushes through `POST /api/temps/batch` at the same recorded
  density — `temps.controller.ts:29-32`, `temps.service.ts:87-94`.)

### How the client consumes it

- The review screen fetches the raw series inside `client.smoke.getReview`
  (`apps/frontend/src/api/client.ts:930-957`; temps fetch at line 942), coerces
  every reading string→number in `normalizeTemps`/`asReading`
  (`client.ts:464-467,486`), then the chart thins it to 300 points:
  `decimate(temps)` in
  `apps/frontend/src/components/history/smokeReview/SmokeSection.tsx:62`.
- `decimate` lives in `packages/TemperatureChart/src/chartGeometry.ts:197-210`
  (`DEFAULT_MAX_POINTS = 300` at line 134): order by time (`inTimeOrder`,
  line 174), then split into ≤300 positional buckets and replace each bucket
  with its **mean** — where the mean of a probe counts only *reported* readings
  (>0, finite; `isReported`, line ~60), so an unplugged probe's zero-sentinel
  doesn't drag averages down (behaviour pinned by
  `chartGeometry.test.ts:161-174`).
- The live smoke screen does the same thinning client-side
  (`useTemperatureSeries.ts:93,110,123`) — that one **stays client-side**; it
  compacts a stream, not a stored fetch.

## 2. Measured numbers

### Live dev-cloud probes (2026-08-30)

- `GET /api/smoke/all` → 200, **7,963 bytes**, and byte-identical with
  `Accept-Encoding: gzip` (`curl --compressed`, no `Content-Encoding` header):
  **the deployed nginx does not gzip API responses**. Raw JSON size ≈ bytes on
  the wire.
- Dev Mongo (queried directly on the box, read-only): `temps` holds **85 docs,
  9,946 BSON bytes total (avg 117 B/doc), all with `tempsId: null`** — e2e
  leftovers, unreachable via `GET /api/temps/:id`; all 22 `smokes` docs lack
  `tempsId`; `cookevents` is empty. **Dev has no real cook to measure
  end-to-end**, and the prod box was off-limits to this agent (SSH blocked by
  the permission policy). The payload numbers below are therefore *derived*
  from measured shapes and the code's own recording cadence, not fetched — they
  are worth re-checking against one real prod cook when convenient, but the
  ratio (~50×) cannot plausibly invert.

### Per-row wire size (measured shape)

One serialized `Temp` doc as `GET /api/temps/:id` returns it (Mongoose JSON:
`_id`, four temp strings, `tempsId`, ISO `date`, `__v`), with realistic decimal
readings:

```json
{"_id":"6a6e1cc7c576f51b96f57898","MeatTemp":"165.75","Meat2Temp":"170.25","Meat3Temp":"54.5","ChamberTemp":"225.5","tempsId":"6a6e1cc7c576f51b96f57899","date":"2026-08-01T16:20:23.624Z","__v":0}
```

= **195 bytes** (~196 with the array comma). The dev sample doc
(`temps.findOne()`) confirms the field set; short integer temp strings shave
~15 bytes, long cooks trend toward the decimal form.

### Whole-series payloads (rows = duration ÷ 5.5 s, bytes = rows × 196)

| Cook | Stored rows | Raw JSON, one cook | Raw JSON, ×2 cooks (compare) |
| --- | --- | --- | --- |
| 6 h | ~3,900 | ~755 KB | ~1.5 MB |
| 12 h (brisket — the case `SmokeSection.tsx:60-62` names) | ~7,900 | ~1.5 MB | **~3.0 MB** |
| 18 h | ~11,800 | ~2.3 MB | ~4.4 MB |

Uncompressed on the wire (nginx probe above), then `JSON.parse` of megabytes,
then 4 × rows `Number()` coercions per cook (`asReading`), then `inTimeOrder` +
bucket-mean over the lot — on a phone, twice, per compare-pick change unless
cached.

### The decimated alternative

A lean numeric point —
`{"date":"2026-08-01T16:20:23.624Z","chamberTemp":225.5,"probe1Temp":165.8,"probe2Temp":170.3,"probe3Temp":54.5}`
— is ~95-110 bytes; 300 of them ≈ **28 KB per cook, ~56 KB for two**. Versus
3.0 MB for two 12-hour cooks: **~54× less transfer**, and the client-side work
drops from ~16,000 parsed-and-coerced rows to 600 ready numbers.

## 3. Analysis: (a) vs (b)

| | (a) raw ×2 + client decimate | (b) `GET …/series?points=300` |
| --- | --- | --- |
| Backend work | none | one route + DTO + ~40 ported lines + tests |
| Wire, 2×12 h cooks | ~3.0 MB, no gzip | ~56 KB |
| Client CPU/memory | parse+coerce ~16k rows ×4 probes, hold both arrays | negligible |
| String→number | every client re-implements (already 2 copies) | once, server-side |
| Range bounding | ±15 min clip already server-side | same (reuses `getAllTempsById`) |
| Fidelity | identical — client decimates to 300 anyway | identical algorithm, moved |

The clinching point is the last row: option (a) does not show more data — the
chart draws at most 300 points either way (`SmokeSection.tsx:62`). The 3 MB is
pure waste, and compare doubles it and re-pays it per re-pick. (b)'s cost is
small and bounded because the hard parts already exist server-side (the clip)
and client-side (the algorithm, with tests to port against).

**Decision: (b).** The user's lean is confirmed by the numbers. The review
screen can migrate to the same endpoint later, but that is not in scope here —
`getReview` keeps its contract.

One honest flag: today's *actual dev data* would make (a) free (85 stray rows
total). The endpoint is justified by real cook shapes — 12 h at the code's own
5.5 s cadence — not by what dev currently holds.

## 4. Endpoint spec (for the implementing slice)

**Route** — `GET /api/temps/:id/series?points=300` on the existing
`TempsController` (`api/temps` base). Declared alongside `@Get('/:id')`; no
route conflict (`/:id` matches one path segment, `/:id/series` two). `id` is the
`tempsId`, validated with the existing `ParseObjectIdPipe`
(`temps.controller.ts:23`).

**Query params** — `points`: optional int, **default 300** (mirror
`DEFAULT_MAX_POINTS`, `chartGeometry.ts:134`), min 1, max 2000 (a guard, not a
use case; reject above with 400 via class-validator on a query DTO —
`@IsInt() @Min(1) @Max(2000)` with `@Type(() => Number)`, per the DTO
conventions in `tempDto.ts` / `cook-events.dto.ts`).

**Response DTO** — `TempSeriesPointDto[]`, ordered oldest-first, field names
matching the numeric convention `cookEvents` already established
(`cook-events.schema.ts:47-61`):

```ts
export class TempSeriesPointDto {
  @ApiProperty({ description: 'Bucket moment (mean of the bucket), ISO date.' })
  date: string; // serialized Date

  @ApiProperty({ nullable: true, type: Number })
  chamberTemp: number | null;

  @ApiProperty({ nullable: true, type: Number })
  probe1Temp: number | null; // from MeatTemp

  @ApiProperty({ nullable: true, type: Number })
  probe2Temp: number | null; // from Meat2Temp

  @ApiProperty({ nullable: true, type: Number })
  probe3Temp: number | null; // from Meat3Temp
}
```

**Semantics** —
- Rows come from the existing `getAllTempsById(id)` (so the ±15 min stamp clip
  and the clock-skew fallback ride along for free, `temps.service.ts:159-173`).
- String→number server-side: `parseFloat`; `NaN` → `null`. The hardware's
  `0`/`"0"` unplugged sentinel also maps to **`null`** (the reported-only rule
  of `isReported`/`meanOf`, `chartGeometry.ts` + tests at
  `chartGeometry.test.ts:161-174`) — the DTO says "no reading" honestly instead
  of exporting the wire sentinel.
- Decimation: **port** the bucket-mean algorithm (`inTimeOrder` + positional
  buckets + reported-only means, `chartGeometry.ts:174-210`) into the temps
  module as a pure helper (e.g. `temp-series.decimate.ts`, beside
  `temp-series.filter.ts`). Do **not** import `packages/TemperatureChart`:
  the backend doesn't depend on it (`apps/backend/package.json`), its `main`
  points at a browser-oriented build, and `chartGeometry.ts` imports
  `d3-scale`/`d3-shape` (ESM) at module top — dead weight and a CJS/ESM
  headache for a NestJS server. The algorithm itself is dependency-free; port
  it with tests translated from `chartGeometry.test.ts:118-215` to keep the two
  implementations honest, and a comment in each pointing at the other.
- A series shorter than `points` returns as-is (converted, ordered); an unknown
  or empty `tempsId` returns `[]`, matching the raw route's behaviour.
- Swagger: `@ApiTags('Temps')` is inherited; add `@ApiOkResponse({ type:
  TempSeriesPointDto, isArray: true })` and `@ApiQuery({ name: 'points',
  required: false })` per the decorated style of `cook-events.controller.ts`.

**Frontend** — one new client method `temps.getSeries(id, points?)` beside
`temps.getById` (`apps/frontend/src/api/client.ts:747-752`); no
`normalizeTemps` needed — the response is already numeric and ordered. The rest
of compare reuses `client.smoke.getReview(id)`, `useCookEventsForSmoke(smokeId)`
and `GET /api/timeline/:id` as ticket #611 assumes.

## 5. Sources

- `apps/backend/src/temps/temps.controller.ts:9,23-26,29-32` — routes.
- `apps/backend/src/temps/temps.service.ts:25,49-62,87-94,159-184` — clip
  window, batch write, by-id read.
- `apps/backend/src/temps/temps.schema.ts:5-23,35` — string temp fields, index.
- `apps/backend/src/smoke/smoke.schema.ts:16` — `tempsId` key.
- `apps/backend/src/cookEvents/cook-events.schema.ts:27,47-61`;
  `cook-events.controller.ts:21,45,52` — numeric snapshot convention, `smokeId`
  key.
- `apps/backend/src/websocket/events.gateway.ts:23,139-145,183` — persist every
  11th 500 ms frame → ~5.5 s/row.
- `MicroController/MicroController.ino:102` — 500 ms firmware cadence.
- `packages/TemperatureChart/src/chartGeometry.ts:134,174-210` and
  `chartGeometry.test.ts:118-215` — `decimate`, `DEFAULT_MAX_POINTS`,
  reported-only means.
- `apps/frontend/src/api/client.ts:464-467,486,747-752,930-957` — `asReading`,
  `normalizeTemps`, temps client, `getReview`.
- `apps/frontend/src/components/history/smokeReview/SmokeSection.tsx:60-62`;
  `apps/smoker/src/components/home/useTemperatureSeries.ts:31,93-123` — client
  decimation and parsing today.
- Live probes (2026-08-30): dev API `GET /api/smoke/all` = 7,963 B with and
  without `Accept-Encoding: gzip` (no `Content-Encoding` header ⇒ no
  compression); dev Mongo `smartsmoker.temps` = 85 docs / 9,946 BSON bytes /
  `tempsId: null`, `smokes` = 22 (0 with `tempsId`), `cookevents` = 0.
- Derived sizes: 195-byte measured row shape × cadence-derived row counts
  (table in §2); 300-point lean shape = ~95-110 B/point ≈ 28 KB.
