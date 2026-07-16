/*
 * `getById` here is this API client's CRUD method, not a Testing Library query;
 * the sync-query rule's name heuristic mis-fires on it.
 */
/* eslint-disable testing-library/no-await-sync-query */
import { SmokeProfile, TempData } from './types';
import { createApiClient } from './client';
import { createFakeBackend } from './fakeBackend';
import { ApiError } from './transport';

const sampleTemps: TempData[] = [
  {
    ChamberTemp: 225,
    MeatTemp: 145,
    Meat2Temp: 150,
    Meat3Temp: 155,
    date: new Date('2025-01-01T12:00:00Z'),
  },
  {
    ChamberTemp: 230,
    MeatTemp: 150,
    Meat2Temp: 152,
    Meat3Temp: 158,
    date: new Date('2025-01-01T12:05:00Z'),
  },
];

describe('temps client — legacy endpoint contract', () => {
  test('methods hit the exact legacy endpoint paths', async () => {
    const backend = createFakeBackend({
      temps: { current: sampleTemps, records: { abc123: sampleTemps } },
    });
    const client = createApiClient(backend);

    await client.temps.getCurrent();
    await client.temps.getById('abc123');
    await client.temps.deleteById('abc123');

    expect(backend.requests).toEqual([
      { method: 'get', path: 'temps', body: undefined },
      { method: 'get', path: 'temps/abc123', body: undefined },
      { method: 'delete', path: 'temps/abc123', body: undefined },
    ]);
  });

  test('a failing route rejects with the typed ApiError carrying status/path/method', async () => {
    const backend = createFakeBackend({ temps: { current: sampleTemps } });
    const client = createApiClient(backend);

    // No record seeded for this id -> fake backend returns 404.
    await expect(client.temps.getById('missing')).rejects.toBeInstanceOf(ApiError);

    const error = (await client.temps.getById('missing').catch(e => e)) as ApiError;
    expect(error.status).toBe(404);
    expect(error.path).toBe('temps/missing');
    expect(error.method).toBe('get');
  });

  test('fault injection returns the configured status and leaves the store untouched', async () => {
    const backend = createFakeBackend({ temps: { records: { abc123: sampleTemps } } });
    const client = createApiClient(backend);

    backend.injectFault({ method: 'delete', path: 'temps/abc123', status: 500 });

    const error = (await client.temps.deleteById('abc123').catch(e => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(500);
    expect(error.method).toBe('delete');

    // The record must survive the faulted delete.
    expect(backend.store.temps.records.abc123).toEqual(sampleTemps);
  });
});

const sampleProfile: SmokeProfile = {
  chamberName: 'Main Chamber',
  probe1Name: 'Meat Probe',
  probe2Name: 'Chamber Probe',
  probe3Name: 'Water Pan',
  notes: 'Test smoke',
  woodType: 'Hickory',
};

describe('smokeProfile client — legacy endpoint contract', () => {
  test('methods hit the exact legacy endpoint paths', async () => {
    const backend = createFakeBackend({
      smokeProfile: { current: sampleProfile, records: { abc123: sampleProfile } },
    });
    const client = createApiClient(backend);

    await client.smokeProfile.getCurrent();
    await client.smokeProfile.getById('abc123');
    await client.smokeProfile.saveCurrent(sampleProfile);
    await client.smokeProfile.deleteById('abc123');

    expect(backend.requests).toEqual([
      { method: 'get', path: 'smokeProfile/current', body: undefined },
      { method: 'get', path: 'smokeProfile/abc123', body: undefined },
      { method: 'post', path: 'smokeProfile/current', body: sampleProfile },
      { method: 'delete', path: 'smokeProfile/abc123', body: undefined },
    ]);
  });
});

describe('smokeProfile client — read-path normalization', () => {
  const profileMissingOptionals = {
    chamberName: 'Main Chamber',
    probe1Name: 'Meat Probe',
    probe2Name: 'Chamber Probe',
    probe3Name: 'Water Pan',
    // notes and woodType absent on the wire
  };

  test('getCurrent defaults absent notes/woodType to empty strings', async () => {
    const backend = createFakeBackend({
      smokeProfile: { current: profileMissingOptionals },
    });
    const client = createApiClient(backend);

    const result = await client.smokeProfile.getCurrent();

    expect(result.notes).toBe('');
    expect(result.woodType).toBe('');
  });

  test('getById defaults absent notes/woodType to empty strings', async () => {
    const backend = createFakeBackend({
      smokeProfile: { records: { abc123: profileMissingOptionals } },
    });
    const client = createApiClient(backend);

    const result = await client.smokeProfile.getById('abc123');

    expect(result.notes).toBe('');
    expect(result.woodType).toBe('');
  });
});

describe('smokeProfile client — outbound DTO projection (PR #323 strict edge)', () => {
  test('a fetched-then-saved profile emits only the six whitelisted fields', async () => {
    // Backend hands back a persisted profile carrying Mongo _id/__v.
    const persisted = {
      ...sampleProfile,
      _id: 'profile-id-1',
      __v: 5,
    };
    const backend = createFakeBackend({ smokeProfile: { current: persisted } });
    const client = createApiClient(backend);

    // Round trip: read the profile (picking up _id/__v), then save it back.
    const fetched = await client.smokeProfile.getCurrent();
    await client.smokeProfile.saveCurrent(fetched);

    const post = backend.requests.find(r => r.method === 'post');
    expect(post?.body).toEqual({
      chamberName: 'Main Chamber',
      probe1Name: 'Meat Probe',
      probe2Name: 'Chamber Probe',
      probe3Name: 'Water Pan',
      notes: 'Test smoke',
      woodType: 'Hickory',
    });
    // The strict-validation edge from PR #323: stray persisted fields are gone.
    expect(post?.body).not.toHaveProperty('_id');
    expect(post?.body).not.toHaveProperty('__v');
  });
});
