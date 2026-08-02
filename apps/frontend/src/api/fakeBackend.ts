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
  NotificationSettings,
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
  notifications?: {
    /** The stored settings document; absent models a backend that has none. */
    settings?: NotificationSettings;
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
  notifications: {
    settings: NotificationSettings | undefined;
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
    notifications: {
      settings: seed.notifications?.settings,
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

    if (resource === 'notifications' && id === 'settings') {
      if (method === 'get') {
        // A backend with no settings document answers with an empty body, which
        // this app's transport maps to null (see EMPTY_BODY).
        return store.notifications.settings === undefined
          ? EMPTY_BODY
          : clone(store.notifications.settings);
      }
      if (method === 'post') {
        store.notifications.settings = clone(body) as NotificationSettings;
        return clone(store.notifications.settings);
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
