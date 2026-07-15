/**
 * In-memory fake backend implementing the transport port.
 *
 * A seeded record store plus a path router mirroring backend routing, with a
 * fault-injection hook to return chosen statuses per method/path. Tests seed
 * it, run real client code, and assert on the store (and the recorded
 * requests) afterward — no axios mocking required.
 */
import { ApiError, HttpMethod, TransportPort } from './transport';
import { TempData } from './types';

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
}

interface FakeStore {
  temps: {
    current: TempData[];
    records: Record<string, TempData[]>;
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
