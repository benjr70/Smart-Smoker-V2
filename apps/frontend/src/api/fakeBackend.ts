/**
 * In-memory fake backend for the frontend's backend routes.
 *
 * A seeded record store plus a route table mirroring backend routing, mounted
 * on the shared fake-backend kernel (which records requests, injects faults and
 * 404s unrouted paths). Tests seed it, run real client code, and assert on the
 * store (and the recorded requests) afterward — no axios mocking required.
 */
import {
  ApiError,
  FakeBackendKernel,
  FakeRequest,
  NO_ROUTE,
  clone,
  createFakeBackendKernel,
} from 'api-transport/src';
import {
  CookStamp,
  DEFAULT_STAMPS,
  MAX_STAMPS,
  MAX_STAMP_LABEL,
  STAMP_TONES,
  StampTone,
  normalizeStamps,
} from './cookStamps';
import {
  ApplicationSettings,
  CompletionEstimate,
  CookEvent,
  PostSmoke,
  ProbeTargetAlertSettings,
  ProbeTargetEntry,
  PreSmoke,
  PushSubscriptionPayload,
  Smoke,
  SmokeHistory,
  SmokeProfile,
  SmokeTimeline,
  State,
  StatRecord,
  Stats,
  TargetPresets,
  TempData,
  rating,
} from './types';

/**
 * A profile as it may sit persisted on the backend: the optional `notes`/
 * `woodType` may be absent and Mongo's `_id`/`__v` may ride along. Seeded by
 * tests to exercise read-path normalization and outbound DTO projection.
 */
export type StoredSmokeProfile = Partial<SmokeProfile> & {
  _id?: string;
  __v?: number;
};

/**
 * A reading as it actually sits persisted on the backend: the temps schema
 * declares every temperature a string, so that is what the wire carries back
 * however numeric the domain type is. Seeded by tests to exercise read-path
 * normalization, because a fake that only ever answers with numbers agrees with
 * the type instead of with the deployment.
 */
export type StoredTempData = {
  [Reading in keyof Omit<TempData, 'date'>]: TempData[Reading] | string;
} & { date: Date | string };

/**
 * A cook event as it actually sits stored and comes off the wire: the moment is
 * an ISO string, because JSON has no date, and the four temperatures may be
 * absent on an event stamped before the cook reported a reading.
 */
export type StoredCookEvent = Omit<CookEvent, 'at' | 'tone'> & {
  at: string | Date;
  tone: string;
  chamberTemp?: number | null;
  probe1Temp?: number | null;
  probe2Temp?: number | null;
  probe3Temp?: number | null;
};

/**
 * The application settings as they actually sit stored: probe rows keyed by
 * slot, with the resolved name optional — the backend resolves names from the
 * active cook on the way out, and rejects them on the way in.
 */
export type StoredApplicationSettings = Omit<
  ApplicationSettings,
  'probeTarget' | 'targetPresets'
> & {
  // The wrap temperature is optional for the reason the heads-up lead below is:
  // a document stored before the field existed carries no such value, and a
  // seed that says nothing about it models exactly that installation.
  targetPresets: Omit<TargetPresets, 'wrapTemp'> & { wrapTemp?: number };
  probeTarget: Omit<ProbeTargetAlertSettings, 'probes'> & {
    // The heads-up lead is optional here as well: a document stored before the
    // setting existed carries no such field, and a seed that says nothing about
    // it means the same thing.
    probes: (Omit<ProbeTargetEntry, 'name' | 'leadMinutes'> & {
      name?: string;
      leadMinutes?: number | null;
    })[];
  };
};

/**
 * A timeline as it actually comes off the wire: the two stamps are ISO strings,
 * because JSON has no date. Seeded by tests so the client's read-path
 * conversion is exercised against what a deployment really answers with, not
 * against `Date`s a fake invented.
 */
export type StoredSmokeTimeline = Omit<SmokeTimeline, 'startedAt' | 'finishedAt'> & {
  startedAt: string | null;
  finishedAt: string | null;
};

/**
 * The running cook as it comes off `timeline/current`: a timeline with the
 * estimate block beside it, whose completion moment is an ISO string for the
 * same reason the stamps are.
 */
export type StoredCurrentTimeline = StoredSmokeTimeline & {
  estimate: Omit<CompletionEstimate, 'eta'> & { eta: string | null };
};

/**
 * What the route answers for an installation with no cook set up: a timeline of
 * nothing, and an estimate of nothing. The real backend answers this rather than
 * a 404 — there is always a "current cook", it is simply empty.
 */
export const NO_CURRENT_TIMELINE: StoredCurrentTimeline = {
  startedAt: null,
  finishedAt: null,
  durationMs: null,
  peakChamber: null,
  peakMeat: null,
  targetTemp: null,
  estimate: {
    state: null,
    eta: null,
    hoursRemaining: null,
    ratePerHour: null,
    progressPercent: null,
    startTemp: null,
    targetTemp: null,
  },
};

/**
 * The archive statistics, derived from the fixtures this fake already holds.
 *
 * Deliberately not a seeded field: the real `GET stats` is a projection of the
 * cooks in the database, and a fake that let a test seed the answer directly
 * would let a screen test pass against numbers no archive could produce. Tests
 * seed cooks and their children — the same fixtures every other route is served
 * from — and read the statistics those cooks add up to.
 *
 * This is a simplified stand-in for the backend's aggregator, covering the rules
 * the frontend has any business depending on (completed cooks only, pounds,
 * colon/bare rest, an archive with nothing on record left null, folded
 * spellings, unrated cooks excluded from averages). It
 * is not a second implementation of the aggregator's edge cases: those are the
 * backend's to get right, and its own suite is where they are pinned.
 */
const deriveStats = (store: FakeStore): Stats => {
  const cooks = store.smoke.all.filter(smoke => smoke.status === 1);
  if (cooks.length === 0) {
    return EMPTY_STATS;
  }

  const joined = cooks.map(smoke => {
    const preSmoke = store.preSmoke.records[smoke.preSmokeId];
    const weight = Number((preSmoke?.weight as { weight?: number })?.weight ?? 0);
    const unit = String((preSmoke?.weight as { unit?: string })?.unit ?? 'LB').toUpperCase();
    const pounds = Number.isFinite(weight)
      ? weight * (unit === 'OZ' ? 1 / 16 : unit === 'KG' ? 2.20462 : 1)
      : 0;
    return {
      smokeId: smoke._id ?? '',
      date: smoke.date ? new Date(smoke.date) : null,
      name: preSmoke?.name ?? '',
      meatType: preSmoke?.meatType ?? '',
      woodType: store.smokeProfile.records[smoke.smokeProfileId]?.woodType ?? '',
      restMs: restMs(store.postSmoke.records[smoke.postSmokeId]?.restTime),
      pounds: preSmoke?.weight ? pounds : null,
      durationMs: (smoke._id ? store.timeline.records[smoke._id]?.durationMs : null) ?? null,
      rating: store.ratings.records[smoke.ratingId],
    };
  });

  const durations = joined
    .map(cook => cook.durationMs)
    .filter((ms): ms is number => typeof ms === 'number');
  const totalPounds = fakeTotal(joined.map(cook => cook.pounds));
  const totalRestMs = fakeTotal(joined.map(cook => cook.restMs));
  const scores = (category: keyof rating): number[] =>
    joined
      .map(cook => Number(cook.rating?.[category] ?? 0))
      .filter(score => Number.isFinite(score) && score > 0);
  const meats = fakeTally(joined.map(cook => ({ name: cook.meatType, pounds: cook.pounds ?? 0 })));
  const woods = fakeTally(joined.map(cook => ({ name: cook.woodType, pounds: 0 })));
  const record = (valueOf: (cook: (typeof joined)[number]) => number | null): StatRecord | null => {
    const held = joined
      .map(cook => ({ cook, value: valueOf(cook) }))
      .filter(
        (entry): entry is { cook: (typeof joined)[number]; value: number } => entry.value !== null
      );
    if (held.length === 0) return null;
    const best = held.reduce((leader, entry) => (entry.value > leader.value ? entry : leader));
    return {
      smokeId: best.cook.smokeId,
      label: best.cook.name || best.cook.meatType || 'Unnamed cook',
      date: best.cook.date ? best.cook.date.toISOString() : null,
      value: best.value,
    };
  };

  return {
    totalSessions: joined.length,
    totalCookMs: durations.length === 0 ? null : durations.reduce((a, b) => a + b, 0),
    totalPounds: totalPounds === null ? null : fakeRound(totalPounds),
    approximateServings: totalPounds === null ? null : Math.round(totalPounds * 2.5),
    averageRating: fakeMean(scores('overallTaste')),
    averageCookMs:
      durations.length === 0
        ? null
        : Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
    totalRestMs,
    woodTypeCount: woods.length,
    meatTypeCount: meats.length,
    records: {
      highestRated: record(cook => Number(cook.rating?.overallTaste) || null),
      longestCook: record(cook => cook.durationMs),
      heaviestCut: record(cook => cook.pounds || null),
      hottestChamber: null,
    },
    byMeat: meats.map(group => ({
      meatType: group.name,
      sessions: group.sessions,
      pounds: fakeRound(group.pounds),
    })),
    byWood: woods.map(group => ({ woodType: group.name, sessions: group.sessions })),
    categoryAverages: {
      smokeFlavor: fakeMean(scores('smokeFlavor')),
      seasoning: fakeMean(scores('seasoning')),
      tenderness: fakeMean(scores('tenderness')),
      overallTaste: fakeMean(scores('overallTaste')),
    },
  };
};

/** What the real endpoint answers for an archive with nothing completed in it. */
const EMPTY_STATS: Stats = {
  totalSessions: 0,
  totalCookMs: null,
  totalPounds: null,
  approximateServings: null,
  averageRating: null,
  averageCookMs: null,
  totalRestMs: null,
  woodTypeCount: 0,
  meatTypeCount: 0,
  records: { highestRated: null, longestCook: null, heaviestCut: null, hottestChamber: null },
  byMeat: [],
  byWood: [],
  categoryAverages: { smokeFlavor: null, seasoning: null, tenderness: null, overallTaste: null },
};

const fakeRound = (value: number): number => Math.round(value * 10) / 10;

const fakeMean = (values: number[]): number | null =>
  values.length === 0 ? null : fakeRound(values.reduce((a, b) => a + b, 0) / values.length);

/** The sum of the figures on record, or null when none of them are. */
const fakeTotal = (values: (number | null)[]): number | null => {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
};

/**
 * `01:30` and a bare `30` — the two shapes the wizard's masked `HH:MM` field
 * produces. A bare number is minutes, as the backend reads it; anything else
 * is a rest nobody recorded, and rests for no time.
 */
const restMs = (restTime: string | undefined): number => {
  const written = (restTime ?? '').trim();
  const colon = /^(\d{1,3}):([0-5]?\d)$/.exec(written);
  if (colon) return (Number(colon[1]) * 60 + Number(colon[2])) * 60_000;
  return /^\d+(\.\d+)?$/.test(written) ? Number(written) * 60_000 : 0;
};

/** Case-folded grouping, most-used first, under the most frequent spelling. */
const fakeTally = (
  entries: { name: string; pounds: number }[]
): { name: string; sessions: number; pounds: number }[] => {
  const groups = new Map<
    string,
    { spellings: Map<string, number>; sessions: number; pounds: number }
  >();
  entries.forEach(({ name, pounds }) => {
    const written = name.trim();
    if (written === '') return;
    const key = written.toLowerCase();
    const group = groups.get(key) ?? {
      spellings: new Map<string, number>(),
      sessions: 0,
      pounds: 0,
    };
    group.sessions += 1;
    group.pounds += pounds;
    group.spellings.set(written, (group.spellings.get(written) ?? 0) + 1);
    groups.set(key, group);
  });
  return [...groups.values()]
    .map(group => ({
      name: [...group.spellings.entries()].reduce((best, entry) =>
        entry[1] >= best[1] ? entry : best
      )[0],
      sessions: group.sessions,
      pounds: group.pounds,
    }))
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
};

export interface FakeBackendSeed {
  temps?: {
    current?: StoredTempData[];
    records?: Record<string, StoredTempData[]>;
  };
  smokeProfile?: {
    current?: StoredSmokeProfile;
    records?: Record<string, StoredSmokeProfile>;
  };
  preSmoke?: {
    current?: PreSmoke;
    records?: Record<string, PreSmoke>;
  };
  postSmoke?: {
    current?: PostSmoke;
    records?: Record<string, PostSmoke>;
  };
  ratings?: {
    current?: rating;
    records?: Record<string, rating>;
  };
  appSettings?: {
    /**
     * The stored application settings document. Absent models an installation
     * that has never saved any; a partial one models a document that predates
     * the block a test is not interested in. Seeded as it is stored — probe
     * rows by slot, without names — since names are resolved on the way out.
     */
    settings?: Partial<StoredApplicationSettings>;
  };
  notifications?: {
    /**
     * The VAPID key the backend serves at runtime. `null` models a deployment
     * with no key configured.
     */
    publicKey?: string | null;
    subscriptions?: PushSubscriptionPayload[];
    /**
     * Models a push service that rejects every send (a mismatched VAPID private
     * key, or a 5xx from the push endpoint). `POST notifications/test` still
     * succeeds — the backend only logs those failures — but reports zero
     * delivered, which is the only signal a caller gets that nothing arrived.
     */
    deliveryFails?: boolean;
  };
  /**
   * The persisted state document. Seed `null` to model a backend with no state:
   * `GET state` resolves `undefined` on a fresh or reset database and
   * `PUT state/toggleSmoking` returns an explicit `null` when there is no
   * current smoke. Nest serializes both as an EMPTY body, which this app's
   * transport maps to `null` (it opts into `emptyBodyAsNull`).
   */
  state?: State | null;
  smoke?: {
    records?: Record<string, Smoke>;
    all?: Smoke[];
    finish?: Smoke;
  };
  /**
   * The cook log of the session in the store. Absent models a cook nobody has
   * stamped anything on.
   */
  cookEvents?: { current?: StoredCookEvent[] };
  history?: SmokeHistory[];
  timeline?: {
    records?: Record<string, StoredSmokeTimeline>;
    /**
     * The running cook, as `GET timeline/current` serves it. Absent models an
     * installation with no cook set up, which answers {@link
     * NO_CURRENT_TIMELINE} rather than nothing.
     */
    current?: StoredCurrentTimeline;
  };
}

/**
 * What this app's transport yields for an empty-body 200: axios surfaces `''`
 * and the frontend transport maps it to `null` (see `emptyBodyAsNull`), so the
 * fake — which stands in for the transport — hands back the mapped value.
 */
const EMPTY_BODY = null;

/** A stored event's moment, however the seed wrote it. */
const moment = (event: StoredCookEvent): number => new Date(event.at).getTime();

/** The id the fake gives the session a pre-smoke save creates. */
const NEXT_SMOKE_ID = 'smoke-next';

/** The smoker's probe slots, in the order the backend serves their rows. */
const PROBE_SLOTS = ['probe1', 'probe2', 'probe3'];

/** The target a probe carries until the user sets one, as the backend has it. */
const DEFAULT_PROBE_TARGET = 203;

/** The default target temps an installation starts from, as the backend has them. */
const DEFAULT_TARGET_PRESETS = { beef: 203, pork: 195, poultry: 165, wrapTemp: 165 };

/**
 * The settings an installation starts from, mirroring the backend's own
 * defaults. The real route answers with a complete document whether or not
 * anything has ever been saved — that is what lets the settings page render on a
 * fresh deployment — so this fake completes what it was seeded with rather than
 * handing back a half-document no real backend would produce.
 *
 * The probe rows are completed slot by slot for the same reason the backend
 * does it: a document stored before a slot existed still reads back as one row
 * per probe.
 */
const withSettingsDefaults = (
  stored: Partial<StoredApplicationSettings> | undefined
): StoredApplicationSettings => ({
  chamber: {
    enabled: stored?.chamber?.enabled ?? false,
    low: stored?.chamber?.low ?? 225,
    high: stored?.chamber?.high ?? 275,
  },
  probeTarget: {
    enabled: stored?.probeTarget?.enabled ?? false,
    probes: PROBE_SLOTS.map(slot => {
      const entry = stored?.probeTarget?.probes?.find(candidate => candidate?.slot === slot);
      const target = entry?.target ?? DEFAULT_PROBE_TARGET;
      return {
        slot,
        enabled: entry?.enabled ?? false,
        target,
        // As the backend reads a row saved before targets had a provenance: a
        // temperature that is not the shipped default was typed by hand, so it
        // is the user's and a session start never seeds over it.
        targetSource: entry?.targetSource ?? (target === DEFAULT_PROBE_TARGET ? 'default' : 'user'),
        // As the backend reads a row stored before the heads-up existed: no
        // warning at all, never some default number of minutes.
        leadMinutes: entry?.leadMinutes ?? null,
      };
    }),
  },
  smokeComplete: { enabled: stored?.smokeComplete?.enabled ?? false },
  headsUp: { enabled: stored?.headsUp?.enabled ?? false },
  targetPresets: {
    beef: stored?.targetPresets?.beef ?? DEFAULT_TARGET_PRESETS.beef,
    pork: stored?.targetPresets?.pork ?? DEFAULT_TARGET_PRESETS.pork,
    poultry: stored?.targetPresets?.poultry ?? DEFAULT_TARGET_PRESETS.poultry,
    // As the backend reads a document written before the wrap temperature
    // existed: the shipped 165°F, never an absence.
    wrapTemp: stored?.targetPresets?.wrapTemp ?? DEFAULT_TARGET_PRESETS.wrapTemp,
  },
  appearance: {
    mode: stored?.appearance?.mode ?? 'system',
    // Dark, as the real document defaults: the resolved half is read only by the
    // touchscreen, so until a browser records one it says what an unlit garage
    // needs. A fake that answered light here would let this app's tests pass
    // against a value the backend does not serve.
    resolvedMode: stored?.appearance?.resolvedMode ?? 'dark',
  },
  // As the backend reads a document written before the block existed: the six
  // shipped stamps, so a cook log has buttons on an installation that has
  // configured none.
  cookLog: { stamps: normalizeStamps(stored?.cookLog?.stamps) },
  // As the backend reads a document written before the threshold existed: the
  // six hours every auto-stop decision falls back to, never an absence.
  autoStop: { idleHours: stored?.autoStop?.idleHours ?? 6 },
  // As the backend reads a document written before the Serve Plan existed: the
  // shipped plan, which is *on* — unlike the alert blocks above, the planner is
  // part of the cook screen and the switch exists to remove it.
  servePlan: {
    enabled: stored?.servePlan?.enabled ?? true,
    driftAlert: stored?.servePlan?.driftAlert ?? true,
    driftMin: stored?.servePlan?.driftMin ?? 30,
  },
});

/** A user-added stamp's key, as the backend spells the rule: `custom-<ulid>`. */
const CUSTOM_STAMP_KEY = /^custom-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/i;

/**
 * Whether a catalogue a client asked to store may be stored, mirroring the
 * backend's `validateStamps`.
 *
 * Mirrored rather than assumed, for the reason the cook-log refusals just below
 * are: the catalogue decides what every button on both surfaces says and events
 * are keyed to it forever, so the backend refuses a list that breaks one of its
 * rules with a 400. A fake that stored whatever it was handed would let a
 * client's tests pass on an edit production answers 400 to, and the settings
 * page would find that out in the garage.
 *
 * The list is checked as it was *sent*, not as {@link normalizeStamps} would
 * repair it: normalizing puts a dropped default back, so a write that removed
 * one would look valid and quietly store something else.
 */
const refusesStamps = (stamps: readonly Partial<CookStamp>[] | undefined): boolean => {
  if (!Array.isArray(stamps) || stamps.length > MAX_STAMPS) {
    return true;
  }
  const seen = new Set<string>();
  const isDefault = (key: string): boolean => DEFAULT_STAMPS.some(stamp => stamp.key === key);
  for (const stamp of stamps) {
    const key = stamp?.key;
    if (typeof key !== 'string' || key.length === 0 || seen.has(key)) {
      return true;
    }
    seen.add(key);
    if (!isDefault(key) && !CUSTOM_STAMP_KEY.test(key)) {
      return true;
    }
    const label = typeof stamp.label === 'string' ? stamp.label.trim() : '';
    if (label.length < 1 || label.length > MAX_STAMP_LABEL) {
      return true;
    }
    if (!STAMP_TONES.includes(stamp.tone as StampTone)) {
      return true;
    }
  }
  // A default may be switched off but never removed.
  return DEFAULT_STAMPS.some(stamp => !seen.has(stamp.key));
};

/**
 * The size the caller asked a chart to be, read off the query the way the
 * endpoint reads it: a size that cannot be read as a number is the default,
 * and one outside the range is served at the nearest size in range.
 */
const SERIES_POINTS = { min: 1, max: 2000, fallback: 300 };
const pointsAsked = (search: string | undefined): number => {
  const asked = Number(new URLSearchParams(search ?? '').get('points'));
  if (!Number.isFinite(asked) || asked === 0) return SERIES_POINTS.fallback;
  return Math.min(Math.max(Math.trunc(asked), SERIES_POINTS.min), SERIES_POINTS.max);
};

/**
 * A reading as the series endpoint answers it: the number the string held, and
 * nothing at all for the zero the hardware sends on an empty port or for a
 * reading that is no number.
 */
const seriesReading = (value: number | string | undefined | null): number | null => {
  const reading = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(reading) && reading !== 0 ? reading : null;
};

/**
 * A stored cook as the decimated endpoint serves it: chart-ready points, in the
 * order the cook was cooked, thinned to the size asked for.
 *
 * Thinned by taking an even spread rather than by the backend's bucket mean —
 * this mirrors the endpoint's contract (at most `points` chart-ready samples,
 * oldest first), not its arithmetic, which is the backend's own tested concern.
 */
const tempSeriesOf = (readings: StoredTempData[], points: number): unknown[] => {
  const ordered = [...readings].sort(
    (one, other) => new Date(one.date).getTime() - new Date(other.date).getTime()
  );
  const stride = Math.max(1, Math.ceil(ordered.length / points));
  return ordered
    .filter((_, index) => index % stride === 0)
    .map(reading => ({
      date: new Date(reading.date).toISOString(),
      chamberTemp: seriesReading(reading.ChamberTemp),
      probe1Temp: seriesReading(reading.MeatTemp),
      probe2Temp: seriesReading(reading.Meat2Temp),
      probe3Temp: seriesReading(reading.Meat3Temp),
    }));
};

/** The smoke profile field naming a probe slot, as the backend reads it. */
const PROBE_NAME_FIELDS: Record<string, keyof SmokeProfile> = {
  probe1: 'probe1Name',
  probe2: 'probe2Name',
  probe3: 'probe3Name',
};

/**
 * The label an unnamed slot falls back to. Derived from the slot rather than
 * from the row's position, exactly as the backend does it: a document holding
 * only `probe2` must fall back to `Probe 2`, not to `Probe 1`.
 */
const genericProbeName = (slot: string): string => `Probe ${slot.replace('probe', '')}`;

/**
 * The settings as the real backend serves them: each probe row carries the name
 * the active cook's smoke profile gives that slot, falling back to a generic
 * slot label when the profile is absent or left that name blank. Mirrored here
 * so component tests exercise the same read the deployed app does.
 */
const withResolvedProbeNames = (
  settings: StoredApplicationSettings,
  profile: StoredSmokeProfile
): ApplicationSettings => ({
  ...settings,
  // Named because the seed type leaves the wrap temperature optional — a
  // document stored before the field existed carries none — while what is
  // served always has one, exactly as the backend fills it on the way out.
  targetPresets: {
    ...settings.targetPresets,
    wrapTemp: settings.targetPresets?.wrapTemp ?? DEFAULT_TARGET_PRESETS.wrapTemp,
  },
  probeTarget: {
    ...settings.probeTarget,
    probes: (settings.probeTarget?.probes ?? []).map(probe => ({
      slot: probe.slot,
      enabled: probe.enabled,
      target: probe.target,
      targetSource: probe.targetSource,
      leadMinutes: probe.leadMinutes ?? null,
      name: profile[PROBE_NAME_FIELDS[probe.slot]]?.trim() || genericProbeName(probe.slot),
    })),
  },
});

interface FakeStore {
  temps: {
    current: StoredTempData[];
    records: Record<string, StoredTempData[]>;
  };
  smokeProfile: {
    current: StoredSmokeProfile;
    records: Record<string, StoredSmokeProfile>;
  };
  preSmoke: {
    current: PreSmoke | undefined;
    records: Record<string, PreSmoke>;
  };
  postSmoke: {
    current: PostSmoke | undefined;
    records: Record<string, PostSmoke>;
  };
  ratings: {
    current: rating | undefined;
    records: Record<string, rating>;
  };
  appSettings: Partial<StoredApplicationSettings> | undefined;
  notifications: {
    publicKey: string | null;
    subscriptions: PushSubscriptionPayload[];
    /** Bodies dispatched through `notifications/test`. */
    testSends: number;
    /** When true, a dispatched test reaches nobody (see the seed field). */
    deliveryFails: boolean;
  };
  state: State | null;
  /**
   * The smoke a pre-smoke save created that the state has not been pointed at
   * yet, or `null` when the state is up to date.
   *
   * The backend answers a pre-smoke save before the new smoke is linked to the
   * state — `PreSmokeService.startSmokeWith` does not await the link — so a
   * caller that reads the state on the strength of the save alone can find it
   * still empty. The fake reproduces that beat exactly: the link lands on the
   * read *after* the first one, so a caller that looks once and lights a cook
   * gets the answer the deployed backend would have given it.
   */
  pendingSmokeId: string | null;
  smoke: {
    records: Record<string, Smoke>;
    all: Smoke[];
    finish: Smoke | Record<string, never>;
  };
  cookEvents: StoredCookEvent[];
  /**
   * How many events this store has ever recorded — the id counter, kept apart
   * from the list because the list shrinks. Numbering from the length hands a
   * new event the id of one that was deleted, and two rows with one id is a
   * single delete removing both and React keying them together.
   */
  cookEventsRecorded: number;
  history: SmokeHistory[];
  timeline: {
    records: Record<string, StoredSmokeTimeline>;
    current: StoredCurrentTimeline;
  };
}

export type FakeBackend = FakeBackendKernel<FakeStore>;

export const createFakeBackend = (seed: FakeBackendSeed = {}): FakeBackend => {
  const store: FakeStore = {
    temps: {
      current: seed.temps?.current ?? [],
      records: seed.temps?.records ?? {},
    },
    smokeProfile: {
      current: seed.smokeProfile?.current ?? {},
      records: seed.smokeProfile?.records ?? {},
    },
    preSmoke: {
      current: seed.preSmoke?.current,
      records: seed.preSmoke?.records ?? {},
    },
    postSmoke: {
      current: seed.postSmoke?.current,
      records: seed.postSmoke?.records ?? {},
    },
    ratings: {
      current: seed.ratings?.current,
      records: seed.ratings?.records ?? {},
    },
    appSettings: seed.appSettings?.settings,
    notifications: {
      publicKey:
        seed.notifications?.publicKey === undefined
          ? 'BSeededTestVapidPublicKey'
          : seed.notifications.publicKey,
      subscriptions: seed.notifications?.subscriptions ?? [],
      testSends: 0,
      deliveryFails: seed.notifications?.deliveryFails ?? false,
    },
    state: seed.state === undefined ? { smokeId: '', smoking: false } : seed.state,
    pendingSmokeId: null,
    smoke: {
      records: seed.smoke?.records ?? {},
      all: seed.smoke?.all ?? [],
      finish: seed.smoke?.finish ?? {},
    },
    cookEvents: seed.cookEvents?.current ?? [],
    cookEventsRecorded: seed.cookEvents?.current?.length ?? 0,
    history: seed.history ?? [],
    timeline: {
      records: seed.timeline?.records ?? {},
      // Copied, never aliased: a test that reaches into the store and moves the
      // running cook on must not be editing the constant every other test in
      // the run starts from.
      current: seed.timeline?.current ?? clone(NO_CURRENT_TIMELINE),
    },
  };
  const route = ({ method, path, body }: FakeRequest): unknown => {
    // A route is a path; what a caller asked *of* it rides behind the `?`. The
    // recorded request keeps the whole thing, so a test can still assert on the
    // size a chart asked for.
    const [routePath, search] = path.split('?');
    const segments = routePath.split('/');
    const [resource, id] = segments;

    if (resource === 'temps') {
      // The chart-ready read, before the by-id read below can claim the id: a
      // cook nobody recorded is an empty chart here rather than a 404, exactly
      // as the endpoint answers it.
      if (method === 'get' && segments[2] === 'series') {
        return tempSeriesOf(store.temps.records[id] ?? [], pointsAsked(search));
      }
      if (method === 'get' && id === undefined) {
        return clone(store.temps.current);
      }
      if (method === 'get' && id !== undefined) {
        const record = store.temps.records[id];
        if (!record) {
          throw new ApiError({ status: 404, path, method });
        }
        return clone(record);
      }
      if (method === 'delete' && id !== undefined) {
        delete store.temps.records[id];
        return {};
      }
    }

    if (resource === 'smokeProfile') {
      if (method === 'get' && id === 'current') {
        return clone(store.smokeProfile.current);
      }
      if (method === 'get' && id !== undefined) {
        const record = store.smokeProfile.records[id];
        if (!record) {
          throw new ApiError({ status: 404, path, method });
        }
        return clone(record);
      }
      if (method === 'post' && id === 'current') {
        store.smokeProfile.current = clone(body) as StoredSmokeProfile;
        return clone(store.smokeProfile.current);
      }
      if (method === 'delete' && id !== undefined) {
        delete store.smokeProfile.records[id];
        return {};
      }
    }

    // Pre-smoke routes. The current document lives at the trailing-slash path
    // `presmoke/` (GET) and is saved at the bare `presmoke` (POST); records are
    // addressed by id at `presmoke/:id`.
    if (resource === 'presmoke') {
      if (method === 'get' && id === '') {
        if (store.preSmoke.current === undefined) {
          throw new ApiError({ status: 404, path, method });
        }
        return clone(store.preSmoke.current);
      }
      if (method === 'post' && id === undefined) {
        store.preSmoke.current = clone(body) as PreSmoke;
        // Saving a pre-smoke while nothing is current is what *creates* the
        // next session on the backend; there is no route that makes one any
        // other way. The link to the state is deferred (see
        // {@link FakeStore.pendingSmokeId}), which is the backend's own
        // behaviour and the reason anything starting a session has to wait for
        // it rather than assume it.
        if (!store.state?.smokeId) {
          store.pendingSmokeId = NEXT_SMOKE_ID;
        }
        return clone(store.preSmoke.current);
      }
      if (method === 'get' && id !== undefined && id !== '') {
        const record = store.preSmoke.records[id];
        if (!record) {
          throw new ApiError({ status: 404, path, method });
        }
        return clone(record);
      }
      if (method === 'delete' && id !== undefined && id !== '') {
        delete store.preSmoke.records[id];
        return {};
      }
    }

    if (resource === 'ratings') {
      if (method === 'get' && id === undefined) {
        return clone(store.ratings.current);
      }
      if (method === 'get' && id !== undefined) {
        const record = store.ratings.records[id];
        if (!record) {
          throw new ApiError({ status: 404, path, method });
        }
        return clone(record);
      }
      if (method === 'post' && id === undefined) {
        // Create: the new current rating.
        store.ratings.current = clone(body) as rating;
        return clone(body);
      }
      if (method === 'post' && id !== undefined) {
        // Update the id-scoped record.
        store.ratings.records[id] = clone(body) as rating;
        return clone(body);
      }
      if (method === 'delete' && id !== undefined) {
        delete store.ratings.records[id];
        return {};
      }
    }

    // Post-smoke routes. The current document lives at `postSmoke/current` for
    // both GET and POST; records are addressed by id at `postSmoke/:id`.
    if (resource === 'postSmoke') {
      if (method === 'get' && id === 'current') {
        if (store.postSmoke.current === undefined) {
          throw new ApiError({ status: 404, path, method });
        }
        return clone(store.postSmoke.current);
      }
      if (method === 'post' && id === 'current') {
        store.postSmoke.current = clone(body) as PostSmoke;
        return clone(store.postSmoke.current);
      }
      if (method === 'get' && id !== undefined && id !== 'current') {
        const record = store.postSmoke.records[id];
        if (!record) {
          throw new ApiError({ status: 404, path, method });
        }
        return clone(record);
      }
      if (method === 'delete' && id !== undefined && id !== 'current') {
        delete store.postSmoke.records[id];
        return {};
      }
    }

    // The application settings document: the chamber alert the settings page
    // saves and the appearance any browser saves when it repaints, on one
    // route. A write merges block by block, mirroring the backend — either
    // writer replacing the whole document would silently reset the other's
    // block, and a fake that did not would hide that.
    if (resource === 'appSettings' && id === undefined) {
      if (method === 'get') {
        // Every probe row is named on the way out, from the smoke profile of
        // the cook that is set up now — the names belong to the cook, not to
        // the stored settings, so they are resolved here rather than seeded.
        return clone(
          withResolvedProbeNames(
            withSettingsDefaults(store.appSettings),
            store.smokeProfile.current
          )
        );
      }
      if (method === 'post') {
        const incoming = clone(body) as Partial<StoredApplicationSettings>;
        // Refused at the door, as the backend refuses it, and nothing at all is
        // stored — not even the blocks that were fine — because the real route
        // throws before it writes.
        if (incoming.cookLog && refusesStamps(incoming.cookLog.stamps)) {
          throw new ApiError({ status: 400, path, method });
        }
        store.appSettings = withSettingsDefaults({
          ...store.appSettings,
          ...incoming,
        });
        return clone(store.appSettings);
      }
    }

    if (resource === 'notifications' && id === 'publicKey' && method === 'get') {
      return clone({ publicKey: store.notifications.publicKey });
    }

    // Registration is an upsert keyed on the endpoint, mirroring the backend:
    // re-registering the same browser replaces its record instead of failing.
    if (resource === 'notifications' && id === 'subscribe' && method === 'post') {
      const subscription = clone(body) as PushSubscriptionPayload;
      const existing = store.notifications.subscriptions.findIndex(
        stored => stored.endpoint === subscription.endpoint
      );
      if (existing === -1) {
        store.notifications.subscriptions.push(subscription);
      } else {
        store.notifications.subscriptions[existing] = subscription;
      }
      return clone(subscription);
    }

    if (resource === 'notifications' && id === 'test' && method === 'post') {
      store.notifications.testSends += 1;
      return clone({
        sent: store.notifications.deliveryFails ? 0 : store.notifications.subscriptions.length,
      });
    }

    if (resource === 'state') {
      if (method === 'get' && id === undefined) {
        const answer = store.state === null ? EMPTY_BODY : clone(store.state);
        if (store.pendingSmokeId !== null) {
          // The link a pre-smoke save set going lands *after* this read has
          // been answered, so the first look at the state still shows no cook
          // and the one after it shows the new session.
          store.state = { smokeId: store.pendingSmokeId, smoking: false };
          store.pendingSmokeId = null;
        }
        return answer;
      }
      if (method === 'put' && id === 'toggleSmoking') {
        // With no state (or no smokeId) the backend toggles nothing and returns
        // null, which reaches this port as the mapped empty body.
        if (store.state === null) {
          return EMPTY_BODY;
        }
        store.state = { ...store.state, smoking: !store.state.smoking };
        return clone(store.state);
      }
      if (method === 'put' && id === 'clearSmoke') {
        store.state = { smokeId: '', smoking: false };
        store.pendingSmokeId = null;
        return clone(store.state);
      }
    }

    if (resource === 'smoke') {
      if (method === 'get' && id === 'all') {
        return clone(store.smoke.all);
      }
      if (method === 'post' && id === 'finish') {
        return clone(store.smoke.finish);
      }
      if (method === 'get' && id !== undefined) {
        const record = store.smoke.records[id];
        if (!record) {
          throw new ApiError({ status: 404, path, method });
        }
        return clone(record);
      }
      if (method === 'delete' && id !== undefined) {
        const record = store.smoke.records[id];
        // The route is a deep delete: an unknown smoke is a 404 and removes
        // nothing, exactly as the backend's `getByIdOrThrow` makes it.
        if (!record) {
          throw new ApiError({ status: 404, path, method });
        }
        // The cook's five children go first, then the cook — the backend's
        // ordering, mirrored so a delete here leaves the same store behind.
        // Absent child ids (legacy records) remove nothing and fail nothing.
        delete store.preSmoke.records[record.preSmokeId];
        delete store.smokeProfile.records[record.smokeProfileId];
        delete store.temps.records[record.tempsId];
        delete store.postSmoke.records[record.postSmokeId];
        delete store.ratings.records[record.ratingId];
        delete store.smoke.records[id];
        // History is a derived read-model on the real backend, so deleting a
        // smoke removes its history row too; mirror that here so the delete is
        // reflected in the refreshed list.
        store.history = store.history.filter(row => row.smokeId !== id);
        return {};
      }
    }

    if (resource === 'timeline' && method === 'get' && id === 'current') {
      return clone(store.timeline.current);
    }

    if (resource === 'timeline' && method === 'get' && id !== undefined) {
      const record = store.timeline.records[id];
      if (!record) {
        throw new ApiError({ status: 404, path, method });
      }
      return clone(record);
    }

    if (resource === 'cook-events') {
      // The log of the session in the store: this fake holds one cook, so the
      // current log and a by-id log are the same rows — which is what the
      // backend answers too when the id is the cook in progress.
      const log = () =>
        clone([...store.cookEvents].sort((one, other) => moment(one) - moment(other)));
      if (method === 'get' && id === 'current') {
        return log();
      }
      if (method === 'get' && id === 'smoke') {
        return log();
      }
      if (method === 'post' && id === undefined) {
        const stampKey = (body as { stampKey?: string })?.stampKey;
        // Resolved against the stored catalogue, as the backend resolves it:
        // the label and colour recorded are the ones the stamp carries now, so
        // a rename saved a moment ago is what the next tap is logged under.
        const catalogue = withSettingsDefaults(store.appSettings).cookLog.stamps;
        const stamp = catalogue.find(candidate => candidate.key === stampKey);
        // The backend's two refusals, mirrored: a stamp nobody offers — or one
        // the user switched off — is the caller's mistake, and a session with
        // no cook set up is a conflict.
        if (!stamp || !stamp.enabled) {
          throw new ApiError({ status: 400, path, method });
        }
        if (!store.state?.smokeId) {
          throw new ApiError({ status: 409, path, method });
        }
        const latest = store.temps.current[store.temps.current.length - 1];
        store.cookEventsRecorded += 1;
        const recorded: StoredCookEvent = {
          _id: `cook-event-${store.cookEventsRecorded}`,
          smokeId: store.state.smokeId,
          stampKey: stamp.key,
          label: stamp.label,
          tone: stamp.tone,
          // The server's clock, as the backend stamps it.
          at: new Date().toISOString(),
          chamberTemp: latest === undefined ? null : Number(latest.ChamberTemp),
          probe1Temp: latest === undefined ? null : Number(latest.MeatTemp),
          probe2Temp: latest === undefined ? null : Number(latest.Meat2Temp),
          probe3Temp: latest === undefined ? null : Number(latest.Meat3Temp),
        };
        store.cookEvents.push(recorded);
        return clone(recorded);
      }
      if (method === 'delete' && id !== undefined) {
        store.cookEvents = store.cookEvents.filter(event => event._id !== id);
        return {};
      }
    }

    if (resource === 'history' && method === 'get' && id === undefined) {
      return clone(store.history);
    }

    if (resource === 'stats' && method === 'get' && id === undefined) {
      return deriveStats(store);
    }

    return NO_ROUTE;
  };

  return createFakeBackendKernel({ store, route });
};
