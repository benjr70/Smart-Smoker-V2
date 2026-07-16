/**
 * In-memory fake backend implementing the transport port.
 *
 * A seeded record store plus a path router mirroring backend routing, with a
 * fault-injection hook to return chosen statuses per method/path. Tests seed
 * it, run real client code, and assert on the store (and the recorded
 * requests) afterward — no axios mocking required.
 */
import { ApiError, HttpMethod, TransportPort } from './transport';
import { PostSmoke, PreSmoke, SmokeProfile, TempData } from './types';

/**
 * A profile as it may sit persisted on the backend: the optional `notes`/
 * `woodType` may be absent and Mongo's `_id`/`__v` may ride along. Seeded by
 * tests to exercise read-path normalization and outbound DTO projection.
 */
export type StoredSmokeProfile = Partial<SmokeProfile> & {
  _id?: string;
  __v?: number;
};

export interface RecordedRequest {
  method: HttpMethod;
  path: string;
  body: unknown;
}

export interface FaultInjection {
  method: HttpMethod;
  path: string;
  status: number;
}

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
}

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
}

export interface FakeBackend extends TransportPort {
  readonly requests: RecordedRequest[];
  readonly store: FakeStore;
  injectFault(fault: FaultInjection): void;
}

const clone = <T>(value: T): T => {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    return new Date(value.getTime()) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map(item => clone(item)) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = clone(item);
  }
  return result as T;
};

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
  };
  const requests: RecordedRequest[] = [];
  const faults: FaultInjection[] = [];

  const findFault = (method: HttpMethod, path: string): FaultInjection | undefined =>
    faults.find(fault => fault.method === method && fault.path === path);

  const route = <T>(method: HttpMethod, path: string, body: unknown): T => {
    requests.push({ method, path, body });

    const fault = findFault(method, path);
    if (fault) {
      throw new ApiError({ status: fault.status, path, method });
    }

    const segments = path.split('/');
    const [resource, id] = segments;

    if (resource === 'temps') {
      if (method === 'get' && id === undefined) {
        return clone(store.temps.current) as unknown as T;
      }
      if (method === 'get' && id !== undefined) {
        const record = store.temps.records[id];
        if (!record) {
          throw new ApiError({ status: 404, path, method });
        }
        return clone(record) as unknown as T;
      }
      if (method === 'delete' && id !== undefined) {
        delete store.temps.records[id];
        return {} as unknown as T;
      }
    }

    if (resource === 'smokeProfile') {
      if (method === 'get' && id === 'current') {
        return clone(store.smokeProfile.current) as unknown as T;
      }
      if (method === 'get' && id !== undefined) {
        const record = store.smokeProfile.records[id];
        if (!record) {
          throw new ApiError({ status: 404, path, method });
        }
        return clone(record) as unknown as T;
      }
      if (method === 'post' && id === 'current') {
        store.smokeProfile.current = clone(body) as StoredSmokeProfile;
        return clone(store.smokeProfile.current) as unknown as T;
      }
      if (method === 'delete' && id !== undefined) {
        delete store.smokeProfile.records[id];
        return {} as unknown as T;
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
        return clone(store.preSmoke.current) as unknown as T;
      }
      if (method === 'post' && id === undefined) {
        store.preSmoke.current = clone(body) as PreSmoke;
        return clone(store.preSmoke.current) as unknown as T;
      }
      if (method === 'get' && id !== undefined && id !== '') {
        const record = store.preSmoke.records[id];
        if (!record) {
          throw new ApiError({ status: 404, path, method });
        }
        return clone(record) as unknown as T;
      }
      if (method === 'delete' && id !== undefined && id !== '') {
        delete store.preSmoke.records[id];
        return {} as unknown as T;
      }
    }

    // Post-smoke routes. The current document lives at `postSmoke/current` for
    // both GET and POST; records are addressed by id at `postSmoke/:id`.
    if (resource === 'postSmoke') {
      if (method === 'get' && id === 'current') {
        if (store.postSmoke.current === undefined) {
          throw new ApiError({ status: 404, path, method });
        }
        return clone(store.postSmoke.current) as unknown as T;
      }
      if (method === 'post' && id === 'current') {
        store.postSmoke.current = clone(body) as PostSmoke;
        return clone(store.postSmoke.current) as unknown as T;
      }
      if (method === 'get' && id !== undefined && id !== 'current') {
        const record = store.postSmoke.records[id];
        if (!record) {
          throw new ApiError({ status: 404, path, method });
        }
        return clone(record) as unknown as T;
      }
      if (method === 'delete' && id !== undefined && id !== 'current') {
        delete store.postSmoke.records[id];
        return {} as unknown as T;
      }
    }

    throw new ApiError({
      status: 404,
      path,
      method,
      message: `No fake route for ${method} ${path}`,
    });
  };

  return {
    get: <T>(path: string) => Promise.resolve().then(() => route<T>('get', path, undefined)),
    post: <T>(path: string, body?: unknown) =>
      Promise.resolve().then(() => route<T>('post', path, body)),
    put: <T>(path: string, body?: unknown) =>
      Promise.resolve().then(() => route<T>('put', path, body)),
    delete: <T>(path: string) => Promise.resolve().then(() => route<T>('delete', path, undefined)),
    requests,
    store,
    injectFault: (fault: FaultInjection) => {
      faults.push(fault);
    },
  };
};
