/**
 * In-memory fake backend implementing the transport port.
 *
 * A seeded record store plus a path router mirroring the smoker's two backends
 * (cloud API + local device service), with a fault-injection hook to return
 * chosen statuses per method/path. Tests seed it, run real client code, and
 * assert on the store and the recorded requests afterward — no axios mocking.
 *
 * The smoker uses one instance per base URL: a cloud instance handles the
 * `state`/`smokeProfile`/`temps` routes and a device instance handles the
 * `api/wifiManager` routes, so a test can prove a call landed on the correct
 * host by inspecting which instance recorded it.
 */
import { ApiError, HttpMethod, TransportPort } from './transport';
import { State, TempData } from './types';

/**
 * A profile as it may sit persisted on the backend: the optional `notes`/
 * `woodType` may be absent and Mongo's `_id`/`__v` may ride along. Seeded by
 * tests to exercise read-path normalization; an absent current profile is
 * seeded as `undefined` so the client maps it to `null`.
 */
export type StoredSmokeProfile = {
  chamberName?: string;
  probe1Name?: string;
  probe2Name?: string;
  probe3Name?: string;
  notes?: string;
  woodType?: string;
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
  state?: State;
  smokeProfile?: {
    current?: StoredSmokeProfile;
  };
  temps?: {
    current?: TempData[];
    batches?: TempData[][];
  };
  wifi?: {
    connection?: unknown;
    connectResult?: unknown;
  };
}

interface FakeStore {
  state: State;
  smokeProfile: {
    current: StoredSmokeProfile | undefined;
  };
  temps: {
    current: TempData[];
    batches: TempData[][];
  };
  wifi: {
    connection: unknown;
    connectResult: unknown;
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
    state: seed.state ?? { smokeId: '', smoking: false },
    smokeProfile: {
      current: seed.smokeProfile?.current,
    },
    temps: {
      current: seed.temps?.current ?? [],
      batches: seed.temps?.batches ?? [],
    },
    wifi: {
      connection: seed.wifi?.connection ?? [],
      connectResult: seed.wifi?.connectResult ?? { success: true },
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

    // Cloud API routes.
    if (path === 'state' && method === 'get') {
      return clone(store.state) as unknown as T;
    }
    if (path === 'state/toggleSmoking' && method === 'put') {
      store.state = { ...store.state, smoking: !store.state.smoking };
      return clone(store.state) as unknown as T;
    }
    if (path === 'smokeProfile/current' && method === 'get') {
      // An unsaved profile is represented as null on the wire, never undefined.
      return (store.smokeProfile.current === undefined
        ? null
        : clone(store.smokeProfile.current)) as unknown as T;
    }
    if (path === 'smokeProfile/current' && method === 'post') {
      store.smokeProfile.current = clone(body) as StoredSmokeProfile;
      return clone(store.smokeProfile.current) as unknown as T;
    }
    if (path === 'temps' && method === 'get') {
      return clone(store.temps.current) as unknown as T;
    }
    if (path === 'temps/batch' && method === 'post') {
      const batch = clone(body) as TempData[];
      store.temps.batches.push(batch);
      return { success: true, count: batch.length } as unknown as T;
    }

    // Device-service routes.
    if (path === 'api/wifiManager/connect' && method === 'post') {
      return clone(store.wifi.connectResult) as unknown as T;
    }
    if (path === 'api/wifiManager/connection' && method === 'get') {
      return clone(store.wifi.connection) as unknown as T;
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
