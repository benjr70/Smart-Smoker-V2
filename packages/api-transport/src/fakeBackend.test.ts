import { clone, createFakeBackendKernel, NO_ROUTE } from './fakeBackend';
import { ApiError } from './transport';

interface TestStore {
  state: { smoking: boolean };
}

/**
 * A miniature app fake: the store plus a route table, exactly the shape each
 * app builds on top of the kernel.
 */
const createTestBackend = (initial: boolean = false) => {
  const store: TestStore = { state: { smoking: initial } };
  return createFakeBackendKernel({
    store,
    route: ({ method, path, body }) => {
      if (path === 'state' && method === 'get') {
        return store.state;
      }
      if (path === 'state/toggleSmoking' && method === 'put') {
        store.state = { smoking: !store.state.smoking };
        return store.state;
      }
      if (path === 'state' && method === 'post') {
        store.state = body as { smoking: boolean };
        return store.state;
      }
      return NO_ROUTE;
    },
  });
};

describe('fake backend kernel', () => {
  test('answers a read from the store through the app route table', async () => {
    const backend = createTestBackend(true);

    await expect(backend.get('state')).resolves.toEqual({ smoking: true });
  });

  test('records every request in order, with the body of writes', async () => {
    const backend = createTestBackend();

    await backend.get('state');
    await backend.post('state', { smoking: true });

    expect(backend.requests).toEqual([
      { method: 'get', path: 'state', body: undefined },
      { method: 'post', path: 'state', body: { smoking: true } },
    ]);
  });

  test('rejects an unrouted path with a 404 ApiError naming the call', async () => {
    const backend = createTestBackend();

    const error = (await backend.get('nope').catch(e => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    expect(error.message).toBe('No fake route for get nope');
  });

  test('fails an injected method+path with the chosen status, leaving the store untouched', async () => {
    const backend = createTestBackend();
    backend.injectFault({ method: 'put', path: 'state/toggleSmoking', status: 500 });

    const error = (await backend.put('state/toggleSmoking').catch(e => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(500);
    expect(backend.store.state).toEqual({ smoking: false });
  });

  test('leaves other calls working when a fault targets one method+path', async () => {
    const backend = createTestBackend();
    backend.injectFault({ method: 'get', path: 'state', status: 500 });

    await expect(backend.put('state/toggleSmoking')).resolves.toEqual({ smoking: true });
  });
});

describe('clone', () => {
  test('isolates nested objects and arrays from later mutation', () => {
    const original = { rows: [{ temp: 225 }], meta: { woodType: 'oak' } };

    const copy = clone(original);
    copy.rows[0].temp = 0;
    copy.meta.woodType = 'hickory';

    expect(original).toEqual({ rows: [{ temp: 225 }], meta: { woodType: 'oak' } });
  });

  test('copies dates by value and passes primitives through', () => {
    const date = new Date('2026-07-28T00:00:00.000Z');

    const copy = clone({ date, id: null, count: 3 });

    expect(copy.date).not.toBe(date);
    expect(copy.date.getTime()).toBe(date.getTime());
    expect(copy.id).toBeNull();
    expect(copy.count).toBe(3);
  });
});
