import { deletePostSmokeById } from './postSmokeService';
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
