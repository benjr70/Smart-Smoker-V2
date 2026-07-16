/*
 * `getById` here is this API client's CRUD method, not a Testing Library query;
 * the sync-query rule's name heuristic mis-fires on it.
 */
/* eslint-disable testing-library/no-await-sync-query */
import { NotificationSettings, Smoke, SmokeHistory, SmokeProfile, TempData, rating } from './types';
import { createApiClient } from './client';
import { createFakeBackend } from './fakeBackend';
import { ApiError } from './transport';
import { SmokeEventPort } from './events';

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

describe('state client — clear smoke side-effect', () => {
  test('clear performs the REST call and invokes the injected event port exactly once', async () => {
    const backend = createFakeBackend({ state: { smokeId: 's1', smoking: true } });
    const emitClear = jest.fn();
    const events: SmokeEventPort = { emitClear };
    const client = createApiClient(backend, events);

    await client.state.clearSmoke();

    expect(emitClear).toHaveBeenCalledTimes(1);
    expect(backend.requests).toContainEqual({
      method: 'put',
      path: 'state/clearSmoke',
      body: undefined,
    });
  });

  test('toggleSmoking rejects with the typed ApiError when the backend fails', async () => {
    const backend = createFakeBackend();
    backend.injectFault({ method: 'put', path: 'state/toggleSmoking', status: 500 });
    const client = createApiClient(backend);

    const error = (await client.state.toggleSmoking().catch(e => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(500);
    expect(error.method).toBe('put');
    expect(error.path).toBe('state/toggleSmoking');
  });
});

describe('state/smoke/history client — legacy endpoint contract', () => {
  test('every operation hits the exact legacy endpoint path', async () => {
    const smoke: Smoke = {
      preSmokeId: 'pre1',
      tempsId: 'temps1',
      postSmokeId: 'post1',
      smokeProfileId: 'prof1',
      ratingId: 'rate1',
      date: new Date('2025-01-01T00:00:00Z'),
      status: 0,
    };
    const backend = createFakeBackend({
      smoke: { records: { abc123: smoke }, all: [smoke], finish: smoke },
      history: [],
    });
    const client = createApiClient(backend, { emitClear: jest.fn() });

    await client.state.get();
    await client.state.toggleSmoking();
    await client.state.clearSmoke();
    await client.smoke.getById('abc123');
    await client.smoke.getAll();
    await client.smoke.finish();
    await client.history.list();

    expect(backend.requests).toEqual([
      { method: 'get', path: 'state', body: undefined },
      { method: 'put', path: 'state/toggleSmoking', body: undefined },
      { method: 'put', path: 'state/clearSmoke', body: undefined },
      { method: 'get', path: 'smoke/abc123', body: undefined },
      { method: 'get', path: 'smoke/all', body: undefined },
      { method: 'post', path: 'smoke/finish', body: undefined },
      { method: 'get', path: 'history', body: undefined },
    ]);
  });
});

describe('history client — list read', () => {
  const rows: SmokeHistory[] = [
    {
      name: 'Test Brisket',
      meatType: 'Beef',
      weight: '12',
      weightUnit: 'lbs',
      woodType: 'Hickory',
      date: '2025-01-01',
      smokeId: 'smoke-id-1',
      overAllRating: '8',
    },
  ];

  test('resolves the history rows on success', async () => {
    const backend = createFakeBackend({ history: rows });
    const client = createApiClient(backend);

    await expect(client.history.list()).resolves.toEqual(rows);
  });

  test('rejects with the typed ApiError on failure', async () => {
    const backend = createFakeBackend({ history: rows });
    backend.injectFault({ method: 'get', path: 'history', status: 503 });
    const client = createApiClient(backend);

    const error = (await client.history.list().catch(e => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(503);
  });
});

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

const sampleRating: rating = {
  smokeFlavor: 8,
  seasoning: 7,
  tenderness: 9,
  overallTaste: 8,
  notes: 'Delicious!',
};

describe('ratings client — legacy endpoint contract', () => {
  test('getCurrent returns the current rating from the collection path', async () => {
    const backend = createFakeBackend({ ratings: { current: sampleRating } });
    const client = createApiClient(backend);

    const result = await client.ratings.getCurrent();

    expect(result).toEqual(sampleRating);
    expect(backend.requests).toContainEqual({ method: 'get', path: 'ratings', body: undefined });
  });

  test('getById fetches a stored rating from the id-scoped path', async () => {
    const backend = createFakeBackend({ ratings: { records: { r1: sampleRating } } });
    const client = createApiClient(backend);

    const result = await client.ratings.getById('r1');

    expect(result).toEqual(sampleRating);
    expect(backend.requests).toContainEqual({ method: 'get', path: 'ratings/r1', body: undefined });
  });

  test('save without an id creates on the collection path with only whitelisted fields', async () => {
    const backend = createFakeBackend();
    const client = createApiClient(backend);

    // Input carries persisted fields that the strict validation edge rejects.
    const incoming = { ...sampleRating, _id: undefined, __v: 3 } as rating;
    await client.ratings.save(incoming);

    expect(backend.requests).toContainEqual({
      method: 'post',
      path: 'ratings',
      body: {
        smokeFlavor: 8,
        seasoning: 7,
        tenderness: 9,
        overallTaste: 8,
        notes: 'Delicious!',
      },
    });
    const body = backend.requests.find(r => r.method === 'post')?.body as Record<string, unknown>;
    expect(body).not.toHaveProperty('_id');
    expect(body).not.toHaveProperty('__v');
  });

  test('save with an id updates the id-scoped path with only whitelisted fields', async () => {
    const backend = createFakeBackend();
    const client = createApiClient(backend);

    const incoming = { ...sampleRating, _id: 'r9', __v: 0 } as rating;
    await client.ratings.save(incoming);

    expect(backend.requests).toContainEqual({
      method: 'post',
      path: 'ratings/r9',
      body: {
        smokeFlavor: 8,
        seasoning: 7,
        tenderness: 9,
        overallTaste: 8,
        notes: 'Delicious!',
      },
    });
    const body = backend.requests.find(r => r.method === 'post')?.body as Record<string, unknown>;
    expect(body).not.toHaveProperty('_id');
    expect(body).not.toHaveProperty('__v');
  });

  test('deleteById removes a stored rating and leaves it intact on a faulted delete', async () => {
    const backend = createFakeBackend({ ratings: { records: { r1: sampleRating } } });
    const client = createApiClient(backend);

    await client.ratings.deleteById('r1');
    expect(backend.store.ratings.records.r1).toBeUndefined();
    expect(backend.requests).toContainEqual({
      method: 'delete',
      path: 'ratings/r1',
      body: undefined,
    });

    const backend2 = createFakeBackend({ ratings: { records: { r2: sampleRating } } });
    const client2 = createApiClient(backend2);
    backend2.injectFault({ method: 'delete', path: 'ratings/r2', status: 500 });
    const error = (await client2.ratings.deleteById('r2').catch(e => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(backend2.store.ratings.records.r2).toEqual(sampleRating);
  });
});

const editableRule: NotificationSettings = {
  type: false,
  message: 'Meat done',
  probe1: 'Chamber',
  op: '>',
  probe2: 'Probe 1',
  offset: 5,
  temperature: 165,
};

describe('notifications client — legacy endpoint contract', () => {
  test('getSettings returns the plain settings array although the wire nests it', async () => {
    const backend = createFakeBackend({ notifications: { settings: [editableRule] } });
    const client = createApiClient(backend);

    const result = await client.notifications.getSettings();

    expect(result).toEqual([editableRule]);
    expect(backend.requests).toContainEqual({
      method: 'get',
      path: 'notifications/settings',
      body: undefined,
    });
  });

  test('saveSettings wraps the projected rules in the legacy envelope, stripping _id/__v', async () => {
    const backend = createFakeBackend();
    const client = createApiClient(backend);

    const fetched = {
      settings: [{ ...editableRule, _id: 'rule-1', __v: 0 }],
    };
    await client.notifications.saveSettings(fetched);

    expect(backend.requests).toContainEqual({
      method: 'post',
      path: 'notifications/settings',
      body: { settings: [editableRule] },
    });
    const sentRule = (
      backend.requests.find(r => r.method === 'post')?.body as {
        settings: Record<string, unknown>[];
      }
    ).settings[0];
    expect(sentRule).not.toHaveProperty('_id');
    expect(sentRule).not.toHaveProperty('__v');
  });

  test('saveSettings preserves lastNotificationSent only when present', async () => {
    const backend = createFakeBackend();
    const client = createApiClient(backend);

    const sent = '2026-07-10T00:00:00.000Z';
    await client.notifications.saveSettings({
      settings: [{ ...editableRule, _id: 'rule-1', lastNotificationSent: sent }],
    });

    const sentRule = (
      backend.requests.find(r => r.method === 'post')?.body as {
        settings: Record<string, unknown>[];
      }
    ).settings[0];
    expect(sentRule.lastNotificationSent).toBe(sent);
    expect(sentRule).not.toHaveProperty('_id');
  });

  test('saveSettings sends an empty settings array when given no settings', async () => {
    const backend = createFakeBackend();
    const client = createApiClient(backend);

    await client.notifications.saveSettings({});

    expect(backend.requests).toContainEqual({
      method: 'post',
      path: 'notifications/settings',
      body: { settings: [] },
    });
  });
});
