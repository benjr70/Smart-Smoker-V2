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
  PostSmoke,
  PreSmoke,
  PushSubscriptionPayload,
  Smoke,
  SmokeHistory,
  SmokeProfile,
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

export interface FakeBackendSeed {
  temps?: {
    current?: TempData[];
    records?: Record<string, TempData[]>;
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
     * the block a test is not interested in.
     */
    settings?: Partial<ApplicationSettings>;
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
}

/**
 * What this app's transport yields for an empty-body 200: axios surfaces `''`
 * and the frontend transport maps it to `null` (see `emptyBodyAsNull`), so the
 * fake — which stands in for the transport — hands back the mapped value.
 */
const EMPTY_BODY = null;

/**
 * The settings an installation starts from, mirroring the backend's own
 * defaults. The real route answers with a complete document whether or not
 * anything has ever been saved — that is what lets the settings page render on a
 * fresh deployment — so this fake completes what it was seeded with rather than
 * handing back a half-document no real backend would produce.
 */
const withSettingsDefaults = (
  stored: Partial<ApplicationSettings> | undefined
): ApplicationSettings => ({
  chamber: {
    enabled: stored?.chamber?.enabled ?? false,
    low: stored?.chamber?.low ?? 225,
    high: stored?.chamber?.high ?? 275,
  },
  appearance: {
    mode: stored?.appearance?.mode ?? 'system',
    resolvedMode: stored?.appearance?.resolvedMode ?? 'light',
  },
});

interface FakeStore {
  temps: {
    current: TempData[];
    records: Record<string, TempData[]>;
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
  appSettings: Partial<ApplicationSettings> | undefined;
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
        return clone(withSettingsDefaults(store.appSettings));
      }
      if (method === 'post') {
        const incoming = clone(body) as Partial<ApplicationSettings>;
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
        delete store.smoke.records[id];
        // History is a derived read-model on the real backend, so deleting a
        // smoke removes its history row too; mirror that here so a cascade
        // delete is reflected in the refreshed list.
        store.history = store.history.filter(row => row.smokeId !== id);
        return {};
      }
    }

    if (resource === 'history' && method === 'get' && id === undefined) {
      return clone(store.history);
    }

    return NO_ROUTE;
  };

  return createFakeBackendKernel({ store, route });
};
