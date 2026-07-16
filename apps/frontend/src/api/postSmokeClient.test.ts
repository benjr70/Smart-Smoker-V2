/*
 * `getById` here is this API client's CRUD method, not a Testing Library query;
 * the sync-query rule's name heuristic mis-fires on it.
 */
/* eslint-disable testing-library/no-await-sync-query */
import { PostSmoke } from './types';
import { createApiClient } from './client';
import { createFakeBackend } from './fakeBackend';
import { ApiError } from './transport';

const samplePostSmoke: PostSmoke = {
  restTime: '30 minutes',
  steps: ['Step 1', 'Step 2'],
  notes: 'Test notes',
};

describe('postSmoke client — legacy endpoint contract', () => {
  test('methods hit the exact legacy endpoint paths (current lives at /current)', async () => {
    const backend = createFakeBackend({
      postSmoke: { current: samplePostSmoke, records: { abc123: samplePostSmoke } },
    });
    const client = createApiClient(backend);

    await client.postSmoke.getCurrent();
    await client.postSmoke.getById('abc123');
    await client.postSmoke.saveCurrent(samplePostSmoke);
    await client.postSmoke.deleteById('abc123');

    expect(backend.requests.map(r => ({ method: r.method, path: r.path }))).toEqual([
      { method: 'get', path: 'postSmoke/current' },
      { method: 'get', path: 'postSmoke/abc123' },
      { method: 'post', path: 'postSmoke/current' },
      { method: 'delete', path: 'postSmoke/abc123' },
    ]);
  });
});

describe('postSmoke client — outbound projection (PR #323 strict-edge)', () => {
  test('a fetched-then-saved round trip emits only rest time, steps and notes', async () => {
    const fetched: unknown = {
      ...samplePostSmoke,
      _id: 'postsmoke-id-1',
      __v: 2,
    };
    const backend = createFakeBackend({ postSmoke: { current: fetched as PostSmoke } });
    const client = createApiClient(backend);

    const roundTrip = await client.postSmoke.getCurrent();
    await client.postSmoke.saveCurrent(roundTrip);

    const posted = backend.requests.find(r => r.method === 'post')?.body as Record<string, unknown>;
    expect(Object.keys(posted).sort()).toEqual(['notes', 'restTime', 'steps']);
    expect(posted).not.toHaveProperty('_id');
    expect(posted).not.toHaveProperty('__v');
  });

  test('a missing record rejects with the typed ApiError (never resolves undefined)', async () => {
    const backend = createFakeBackend();
    const client = createApiClient(backend);

    const error = (await client.postSmoke.getById('missing').catch(e => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    expect(error.path).toBe('postSmoke/missing');
    expect(error.method).toBe('get');
  });
});
