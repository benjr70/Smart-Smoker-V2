/*
 * `getById` here is this API client's CRUD method, not a Testing Library query;
 * the sync-query rule's name heuristic mis-fires on it.
 */
/* eslint-disable testing-library/no-await-sync-query */
import { WeightUnits } from '../components/common/interfaces/enums';
import { PreSmoke } from './types';
import { createApiClient } from './client';
import { createFakeBackend } from './fakeBackend';
import { ApiError } from './transport';

const samplePreSmoke: PreSmoke = {
  name: 'Test Brisket',
  meatType: 'Beef',
  weight: { weight: 12, unit: WeightUnits.LB },
  steps: ['Season meat', 'Let rest'],
  notes: 'Test notes',
};

describe('preSmoke client — legacy endpoint contract', () => {
  test('methods hit the exact legacy endpoint paths (including trailing-slash quirks)', async () => {
    const backend = createFakeBackend({
      preSmoke: { current: samplePreSmoke, records: { abc123: samplePreSmoke } },
    });
    const client = createApiClient(backend);

    await client.preSmoke.getCurrent();
    await client.preSmoke.getById('abc123');
    await client.preSmoke.saveCurrent(samplePreSmoke);
    await client.preSmoke.deleteById('abc123');

    expect(backend.requests.map(r => ({ method: r.method, path: r.path }))).toEqual([
      { method: 'get', path: 'presmoke/' },
      { method: 'get', path: 'presmoke/abc123' },
      { method: 'post', path: 'presmoke' },
      { method: 'delete', path: 'presmoke/abc123' },
    ]);
  });
});

describe('preSmoke client — outbound projection (PR #323 strict-edge)', () => {
  test('a fetched-then-saved round trip emits only whitelisted fields with a numeric weight', async () => {
    // The seeded current document carries persisted mongo fields the strict
    // backend would reject, plus a string weight coming from the UI text input.
    const fetched: unknown = {
      name: 'Test Brisket',
      meatType: 'Beef',
      weight: { unit: WeightUnits.LB, weight: '12', _id: 'weight-id-1' },
      steps: ['Season meat'],
      notes: 'Test notes',
      _id: 'presmoke-id-1',
      __v: 3,
    };
    const backend = createFakeBackend({ preSmoke: { current: fetched as PreSmoke } });
    const client = createApiClient(backend);

    const roundTrip = await client.preSmoke.getCurrent();
    await client.preSmoke.saveCurrent(roundTrip);

    const posted = backend.requests.find(r => r.method === 'post')?.body as Record<string, unknown>;
    expect(Object.keys(posted).sort()).toEqual(['meatType', 'name', 'notes', 'steps', 'weight']);
    expect(posted).not.toHaveProperty('_id');
    expect(posted).not.toHaveProperty('__v');
    const weight = posted.weight as Record<string, unknown>;
    expect(weight).not.toHaveProperty('_id');
    expect(weight.weight).toBe(12);
    expect(typeof weight.weight).toBe('number');
  });

  test('empty and non-numeric weights become undefined (never NaN)', async () => {
    const backend = createFakeBackend();
    const client = createApiClient(backend);

    await client.preSmoke.saveCurrent({
      weight: { unit: WeightUnits.LB, weight: '' as unknown as number },
      steps: [],
    });
    await client.preSmoke.saveCurrent({
      weight: { unit: WeightUnits.LB, weight: 'abc' as unknown as number },
      steps: [],
    });

    const bodies = backend.requests.map(
      r => (r.body as { weight: { weight: unknown } }).weight.weight
    );
    expect(bodies).toEqual([undefined, undefined]);
    expect(bodies.some(Number.isNaN)).toBe(false);
  });

  test('a missing record rejects with the typed ApiError (never resolves undefined)', async () => {
    const backend = createFakeBackend();
    const client = createApiClient(backend);

    const error = (await client.preSmoke.getById('missing').catch(e => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    expect(error.path).toBe('presmoke/missing');
    expect(error.method).toBe('get');
  });
});
