/**
 * Behavior tests for the deprecated `deleteSmoke` shim, driven through the real
 * deep client over an in-memory fake backend. They assert the store end-state
 * (which records survive), not call spies — replacing the old test that encoded
 * the orphan bug (parent deleted in a `finally`, so it vanished even when child
 * deletes failed) as expected behavior.
 */
import { createApiClient, createFakeBackend } from '../api';
import { Smoke } from '../api/types';
import { deleteSmoke } from './deleteSmokeService';

const seededSmoke: Smoke = {
  _id: 'smoke-1',
  preSmokeId: 'pre-1',
  smokeProfileId: 'prof-1',
  tempsId: 'temps-1',
  postSmokeId: 'post-1',
  ratingId: 'rate-1',
  date: new Date('2025-01-01T00:00:00Z'),
  status: 2,
};

const seedFullSmoke = () =>
  createFakeBackend({
    smoke: { records: { 'smoke-1': seededSmoke } },
    preSmoke: { records: { 'pre-1': { name: 'Brisket', weight: {}, steps: [] } } },
    smokeProfile: {
      records: {
        'prof-1': {
          chamberName: 'Main',
          probe1Name: 'A',
          probe2Name: 'B',
          probe3Name: 'C',
          notes: '',
          woodType: 'Oak',
        },
      },
    },
    temps: { records: { 'temps-1': [] } },
    postSmoke: { records: { 'post-1': { restTime: '30', steps: [] } } },
    ratings: {
      records: {
        'rate-1': { smokeFlavor: 5, seasoning: 4, tenderness: 5, overallTaste: 5, notes: '' },
      },
    },
  });

describe('deleteSmoke shim', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('removes all five children and the parent from a fully seeded smoke', async () => {
    const backend = seedFullSmoke();
    const client = createApiClient(backend);

    await deleteSmoke('smoke-1', client);

    expect(backend.store.preSmoke.records['pre-1']).toBeUndefined();
    expect(backend.store.smokeProfile.records['prof-1']).toBeUndefined();
    expect(backend.store.temps.records['temps-1']).toBeUndefined();
    expect(backend.store.postSmoke.records['post-1']).toBeUndefined();
    expect(backend.store.ratings.records['rate-1']).toBeUndefined();
    expect(backend.store.smoke.records['smoke-1']).toBeUndefined();
  });

  test('a child-delete failure leaves the parent intact (no orphan) and does not throw', async () => {
    const backend = seedFullSmoke();
    const client = createApiClient(backend);
    backend.injectFault({ method: 'delete', path: 'temps/temps-1', status: 500 });

    await expect(deleteSmoke('smoke-1', client)).resolves.toBeUndefined();

    // Parent survives so the user can retry; no orphaned child records.
    expect(backend.store.smoke.records['smoke-1']).toEqual(seededSmoke);
  });

  test('a nonexistent smoke leaves the store untouched and does not throw', async () => {
    const backend = seedFullSmoke();
    const client = createApiClient(backend);

    await expect(deleteSmoke('missing', client)).resolves.toBeUndefined();

    expect(backend.requests.filter(r => r.method === 'delete')).toHaveLength(0);
    expect(backend.store.smoke.records['smoke-1']).toEqual(seededSmoke);
    expect(backend.store.preSmoke.records['pre-1']).toBeDefined();
  });
});
