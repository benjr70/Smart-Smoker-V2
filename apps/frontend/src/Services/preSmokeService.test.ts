import {
  getCurrentPreSmoke,
  setCurrentPreSmoke,
  getPreSmokeById,
  deletePreSmokeById,
} from './preSmokeService';
import { createApiClient } from '../api/client';
import { createFakeBackend, FakeBackend } from '../api/fakeBackend';
import { PreSmoke } from '../api/types';
import { WeightUnits } from '../components/common/interfaces/enums';

// Mock only the client-injection boundary: the deprecated shims delegate to the
// default client, and here that default is a client backed by an in-memory fake
// backend. Everything below the seam (real client + real fake backend) runs.
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return { ...actual, getDefaultApiClient: jest.fn() };
});

// eslint-disable-next-line import/first, @typescript-eslint/no-var-requires
const api = require('../api');

const samplePreSmoke: PreSmoke = {
  name: 'Test Brisket',
  meatType: 'Beef',
  weight: { weight: 12, unit: WeightUnits.LB },
  steps: ['Season meat', 'Let rest'],
  notes: 'Test notes',
};

let backend: FakeBackend;

beforeEach(() => {
  backend = createFakeBackend({
    preSmoke: { current: samplePreSmoke, records: { abc123: samplePreSmoke } },
  });
  (api.getDefaultApiClient as jest.Mock).mockReturnValue(createApiClient(backend));
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('preSmokeService (deprecated shims)', () => {
  test('getCurrentPreSmoke resolves the current pre-smoke on success', async () => {
    const result = await getCurrentPreSmoke();
    expect(result).toEqual(samplePreSmoke);
    expect(backend.requests).toContainEqual({ method: 'get', path: 'presmoke/', body: undefined });
  });

  test('getCurrentPreSmoke resolves undefined and logs on failure', async () => {
    backend.injectFault({ method: 'get', path: 'presmoke/', status: 500 });
    const consoleSpy = jest.spyOn(console, 'log');

    const result = await getCurrentPreSmoke();

    expect(result).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  test('setCurrentPreSmoke posts the projected payload and resolves on success', async () => {
    const fetched = { ...samplePreSmoke, _id: 'x', __v: 1 } as unknown as PreSmoke;
    await setCurrentPreSmoke(fetched);

    const posted = backend.requests.find(r => r.method === 'post')?.body as Record<string, unknown>;
    expect(posted).not.toHaveProperty('_id');
    expect(posted).not.toHaveProperty('__v');
    expect(backend.store.preSmoke.current).toEqual(posted);
  });

  test('setCurrentPreSmoke resolves undefined and logs on failure', async () => {
    backend.injectFault({ method: 'post', path: 'presmoke', status: 500 });
    const consoleSpy = jest.spyOn(console, 'log');

    const result = await setCurrentPreSmoke(samplePreSmoke);

    expect(result).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  test('getPreSmokeById resolves the record on success', async () => {
    const result = await getPreSmokeById('abc123');
    expect(result).toEqual(samplePreSmoke);
    expect(backend.requests).toContainEqual({
      method: 'get',
      path: 'presmoke/abc123',
      body: undefined,
    });
  });

  test('getPreSmokeById resolves undefined and logs when the record is missing', async () => {
    const consoleSpy = jest.spyOn(console, 'log');

    const result = await getPreSmokeById('missing');

    expect(result).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  test('deletePreSmokeById removes the record and resolves on success', async () => {
    await deletePreSmokeById('abc123');
    expect(backend.store.preSmoke.records.abc123).toBeUndefined();
    expect(backend.requests).toContainEqual({
      method: 'delete',
      path: 'presmoke/abc123',
      body: undefined,
    });
  });

  test('deletePreSmokeById resolves undefined and logs on failure', async () => {
    backend.injectFault({ method: 'delete', path: 'presmoke/abc123', status: 500 });
    const consoleSpy = jest.spyOn(console, 'log');

    const result = await deletePreSmokeById('abc123');

    expect(result).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    // faulted delete must leave the record intact
    expect(backend.store.preSmoke.records.abc123).toEqual(samplePreSmoke);
  });
});
