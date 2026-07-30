/**
 * In-memory fake backend kernel implementing the transport port.
 *
 * The kernel owns everything that is the same for every app: recording each
 * request, honouring injected faults, dispatching to the app's route table and
 * turning an unmatched path into a 404 {@link ApiError}. Each app supplies only
 * its own store and route table — the part that actually mirrors its backend's
 * routing — so tests seed the store, run real client code and assert on the
 * store (and the recorded requests) afterwards, with no axios mocking.
 */
import { ApiError, HttpMethod, TransportPort } from './transport';

/**
 * Returned by a route table when it has no handler for the request: the kernel
 * turns it into a 404. A dedicated sentinel (rather than `undefined`) keeps
 * "this route resolves to undefined" distinct from "no such route".
 */
export const NO_ROUTE = Symbol('no-route');

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

/** The request as seen by an app's route table. */
export interface FakeRequest {
  method: HttpMethod;
  path: string;
  body: unknown;
}

/** An app's route table: answer the request, or decline it with NO_ROUTE. */
export type FakeRouteTable = (request: FakeRequest) => unknown;

export interface FakeBackendKernel<TStore> extends TransportPort {
  readonly requests: RecordedRequest[];
  readonly store: TStore;
  injectFault(fault: FaultInjection): void;
}

/**
 * Deep-clones a stored value so a test that mutates a response cannot corrupt
 * the fake's store (and vice versa). Route tables use it on the way in and out.
 */
export const clone = <T>(value: T): T => {
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

export const createFakeBackendKernel = <TStore>(params: {
  store: TStore;
  route: FakeRouteTable;
}): FakeBackendKernel<TStore> => {
  const { store, route } = params;
  const requests: RecordedRequest[] = [];
  const faults: FaultInjection[] = [];

  const findFault = (method: HttpMethod, path: string): FaultInjection | undefined =>
    faults.find(fault => fault.method === method && fault.path === path);

  const dispatch = <T>(method: HttpMethod, path: string, body: unknown): T => {
    requests.push({ method, path, body });

    const fault = findFault(method, path);
    if (fault) {
      throw new ApiError({ status: fault.status, path, method });
    }

    const result = route({ method, path, body });
    if (result === NO_ROUTE) {
      throw new ApiError({
        status: 404,
        path,
        method,
        message: `No fake route for ${method} ${path}`,
      });
    }
    return result as T;
  };

  return {
    get: <T>(path: string) => Promise.resolve().then(() => dispatch<T>('get', path, undefined)),
    post: <T>(path: string, body?: unknown) =>
      Promise.resolve().then(() => dispatch<T>('post', path, body)),
    put: <T>(path: string, body?: unknown) =>
      Promise.resolve().then(() => dispatch<T>('put', path, body)),
    delete: <T>(path: string) =>
      Promise.resolve().then(() => dispatch<T>('delete', path, undefined)),
    requests,
    store,
    injectFault: (fault: FaultInjection) => {
      faults.push(fault);
    },
  };
};
