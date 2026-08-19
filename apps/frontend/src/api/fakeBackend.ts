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
  ApplicationSettings,
  CompletionEstimate,
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
 * The application settings as they actually sit stored: probe rows keyed by
 * slot, with the resolved name optional — the backend resolves names from the
 * active cook on the way out, and rejects them on the way in.
 */
export type StoredApplicationSettings = Omit<ApplicationSettings, 'probeTarget'> & {
  probeTarget: Omit<ProbeTargetAlertSettings, 'probes'> & {
    probes: (Omit<ProbeTargetEntry, 'name'> & { name?: string })[];
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

/** The smoker's probe slots, in the order the backend serves their rows. */
const PROBE_SLOTS = ['probe1', 'probe2', 'probe3'];

/** The target a probe carries until the user sets one, as the backend has it. */
const DEFAULT_PROBE_TARGET = 203;

/** The default target temps an installation starts from, as the backend has them. */
const DEFAULT_TARGET_PRESETS = { beef: 203, pork: 195, poultry: 165 };

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
      };
    }),
  },
  smokeComplete: { enabled: stored?.smokeComplete?.enabled ?? false },
  targetPresets: {
    beef: stored?.targetPresets?.beef ?? DEFAULT_TARGET_PRESETS.beef,
    pork: stored?.targetPresets?.pork ?? DEFAULT_TARGET_PRESETS.pork,
    poultry: stored?.targetPresets?.poultry ?? DEFAULT_TARGET_PRESETS.poultry,
  },
  appearance: {
    mode: stored?.appearance?.mode ?? 'system',
    // Dark, as the real document defaults: the resolved half is read only by the
    // touchscreen, so until a browser records one it says what an unlit garage
    // needs. A fake that answered light here would let this app's tests pass
    // against a value the backend does not serve.
    resolvedMode: stored?.appearance?.resolvedMode ?? 'dark',
  },
});

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
  probeTarget: {
    ...settings.probeTarget,
    probes: (settings.probeTarget?.probes ?? []).map(probe => ({
      slot: probe.slot,
      enabled: probe.enabled,
      target: probe.target,
      targetSource: probe.targetSource,
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
  smoke: {
    records: Record<string, Smoke>;
    all: Smoke[];
    finish: Smoke | Record<string, never>;
  };
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
    smoke: {
      records: seed.smoke?.records ?? {},
      all: seed.smoke?.all ?? [],
      finish: seed.smoke?.finish ?? {},
    },
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
    const segments = path.split('/');
    const [resource, id] = segments;

    if (resource === 'temps') {
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
        return store.state === null ? EMPTY_BODY : clone(store.state);
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

    if (resource === 'history' && method === 'get' && id === undefined) {
      return clone(store.history);
    }

    return NO_ROUTE;
  };

  return createFakeBackendKernel({ store, route });
};
