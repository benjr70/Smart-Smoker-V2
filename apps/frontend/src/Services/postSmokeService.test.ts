import {
  getCurrentPostSmoke,
  setCurrentPostSmoke,
  getPostSmokeById,
  deletePostSmokeById,
} from './postSmokeService';
import { createApiClient } from '../api/client';
import { createFakeBackend, FakeBackend } from '../api/fakeBackend';
import { PostSmoke } from '../api/types';

// Mock only the client-injection boundary: the deprecated shims delegate to the
// default client, and here that default is a client backed by an in-memory fake
// backend. Everything below the seam (real client + real fake backend) runs.
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return { ...actual, getDefaultApiClient: jest.fn() };
});

// eslint-disable-next-line import/first, @typescript-eslint/no-var-requires
const api = require('../api');

const samplePostSmoke: PostSmoke = {
  restTime: '30 minutes',
  steps: ['Step 1', 'Step 2'],
  notes: 'Test notes',
};

let backend: FakeBackend;

beforeEach(() => {
  backend = createFakeBackend({
    postSmoke: { current: samplePostSmoke, records: { abc123: samplePostSmoke } },
  });
  (api.getDefaultApiClient as jest.Mock).mockReturnValue(createApiClient(backend));
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('postSmokeService (deprecated shims)', () => {
  test('getCurrentPostSmoke resolves the current post-smoke on success', async () => {
    const result = await getCurrentPostSmoke();
    expect(result).toEqual(samplePostSmoke);
    expect(backend.requests).toContainEqual({
      method: 'get',
      path: 'postSmoke/current',
      body: undefined,
    });
  });

  test('getCurrentPostSmoke resolves undefined and logs on failure', async () => {
    backend.injectFault({ method: 'get', path: 'postSmoke/current', status: 500 });
    const consoleSpy = jest.spyOn(console, 'log');

    const result = await getCurrentPostSmoke();

    expect(result).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  test('setCurrentPostSmoke posts the projected payload and resolves on success', async () => {
    const fetched = { ...samplePostSmoke, _id: 'x', __v: 1 } as unknown as PostSmoke;
    await setCurrentPostSmoke(fetched);

    const posted = backend.requests.find(r => r.method === 'post')?.body as Record<string, unknown>;
    expect(Object.keys(posted).sort()).toEqual(['notes', 'restTime', 'steps']);
    expect(posted).not.toHaveProperty('_id');
    expect(posted).not.toHaveProperty('__v');
    expect(backend.store.postSmoke.current).toEqual(posted);
  });

  test('setCurrentPostSmoke resolves undefined and logs on failure', async () => {
    backend.injectFault({ method: 'post', path: 'postSmoke/current', status: 500 });
    const consoleSpy = jest.spyOn(console, 'log');

    const result = await setCurrentPostSmoke(samplePostSmoke);

    expect(result).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  test('getPostSmokeById resolves the record on success', async () => {
    const result = await getPostSmokeById('abc123');
    expect(result).toEqual(samplePostSmoke);
    expect(backend.requests).toContainEqual({
      method: 'get',
      path: 'postSmoke/abc123',
      body: undefined,
    });
  });

  test('getPostSmokeById resolves undefined and logs when the record is missing', async () => {
    const consoleSpy = jest.spyOn(console, 'log');

    const result = await getPostSmokeById('missing');

    expect(result).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  test('deletePostSmokeById removes the record and resolves on success', async () => {
    await deletePostSmokeById('abc123');
    expect(backend.store.postSmoke.records.abc123).toBeUndefined();
    expect(backend.requests).toContainEqual({
      method: 'delete',
      path: 'postSmoke/abc123',
      body: undefined,
    });
  });

  test('deletePostSmokeById resolves undefined and logs on failure', async () => {
    backend.injectFault({ method: 'delete', path: 'postSmoke/abc123', status: 500 });
    const consoleSpy = jest.spyOn(console, 'log');

    const result = await deletePostSmokeById('abc123');

    expect(result).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    // faulted delete must leave the record intact
    expect(backend.store.postSmoke.records.abc123).toEqual(samplePostSmoke);
  });
});
