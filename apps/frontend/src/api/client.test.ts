/*
 * `getById` here is this API client's CRUD method, not a Testing Library query;
 * the sync-query rule's name heuristic mis-fires on it.
 */
/* eslint-disable testing-library/no-await-sync-query */
import {
  NotificationSettings,
  PreSmoke,
  Smoke,
  SmokeHistory,
  SmokeProfile,
  TempData,
  rating,
} from './types';
import { createApiClient } from './client';
import { NO_CURRENT_TIMELINE, createFakeBackend } from './fakeBackend';
import { ApiError } from 'api-transport/src';
// The product's own statement of "nothing chosen yet", asserted against rather
// than restated here: the API layer keeps its own wire copy, and these two
// drifting apart is exactly what would make a fresh installation disagree with
// itself about what colour it starts in.
import { DEFAULT_APPEARANCE_PREFERENCE } from 'theme/src';
import { PushNotConfiguredError } from './errors';
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

/**
 * The temps collection stores every temperature as a string, so this is the
 * boundary where a stored cook stops being wire and starts being the numbers
 * the type promises. Nothing downstream coerces: the chart asks whether a
 * reading is a finite number, and `"225"` is not one, so a series that arrived
 * uncoerced is drawn as no line at all.
 */
describe('temps client — readings the backend stored as strings', () => {
  const storedTemps = [
    {
      ChamberTemp: '225',
      MeatTemp: '145',
      Meat2Temp: '0',
      Meat3Temp: '0',
      date: new Date('2025-01-01T12:00:00Z'),
    },
  ];

  test('the current series reads back as numbers', async () => {
    const client = createApiClient(createFakeBackend({ temps: { current: storedTemps } }));

    const [reading] = await client.temps.getCurrent();

    expect(reading).toMatchObject({
      ChamberTemp: 225,
      MeatTemp: 145,
      Meat2Temp: 0,
      Meat3Temp: 0,
    });
  });

  test('a stored series read by id reads back as numbers', async () => {
    const client = createApiClient(
      createFakeBackend({ temps: { records: { abc123: storedTemps } } })
    );

    const [reading] = await client.temps.getById('abc123');

    expect(reading).toMatchObject({ ChamberTemp: 225, MeatTemp: 145 });
  });

  test('the date the reading was taken at rides through untouched', async () => {
    const client = createApiClient(createFakeBackend({ temps: { current: storedTemps } }));

    const [reading] = await client.temps.getCurrent();

    expect(new Date(reading.date).toISOString()).toBe('2025-01-01T12:00:00.000Z');
  });

  test('a reading that is no number at all reads back as unreported', async () => {
    const client = createApiClient(
      createFakeBackend({
        temps: {
          current: [
            {
              ChamberTemp: 'n/a',
              MeatTemp: '',
              Meat2Temp: '145',
              Meat3Temp: '0',
              date: new Date('2025-01-01T12:00:00Z'),
            },
          ],
        },
      })
    );

    const [reading] = await client.temps.getCurrent();

    // Zero is what the hardware sends for a probe that is not plugged in, and
    // what the chart draws as a gap. Handing the string on instead would put a
    // temperature on the plot that nothing ever measured.
    expect(reading).toMatchObject({ ChamberTemp: 0, MeatTemp: 0, Meat2Temp: 145, Meat3Temp: 0 });
  });
});

/**
 * A cook is a sequence, and everything that reads one — the chart above all —
 * reads it as one. The backend answers in the order its index holds the rows,
 * which is newest-first, so this boundary is also where a series stops being
 * rows and starts being a cook that runs forwards.
 */
describe('temps client — a series that arrives newest-first', () => {
  const reading = (chamber: string, meat: string, taken: string) => ({
    ChamberTemp: chamber,
    MeatTemp: meat,
    Meat2Temp: '0',
    Meat3Temp: '0',
    date: new Date(taken),
  });

  const newestFirst = [
    reading('235', '203', '2025-01-01T15:00:00Z'),
    reading('240', '155', '2025-01-01T13:30:00Z'),
    reading('225', '145', '2025-01-01T12:00:00Z'),
  ];

  const moments = (temps: { date: Date | string }[]): string[] =>
    temps.map(temp => new Date(temp.date).toISOString());

  test('the current series reads back in the order it was recorded', async () => {
    const client = createApiClient(createFakeBackend({ temps: { current: newestFirst } }));

    expect(moments(await client.temps.getCurrent())).toEqual([
      '2025-01-01T12:00:00.000Z',
      '2025-01-01T13:30:00.000Z',
      '2025-01-01T15:00:00.000Z',
    ]);
  });

  test('a stored series read by id reads back in the order it was recorded', async () => {
    const client = createApiClient(
      createFakeBackend({ temps: { records: { abc123: newestFirst } } })
    );

    expect(moments(await client.temps.getById('abc123'))).toEqual([
      '2025-01-01T12:00:00.000Z',
      '2025-01-01T13:30:00.000Z',
      '2025-01-01T15:00:00.000Z',
    ]);
  });

  test('the cook the review carries runs forwards', async () => {
    const backend = seedFullSmoke();
    backend.store.temps.records['temps-1'] = newestFirst;

    const review = await createApiClient(backend).smoke.getReview('smoke-1');

    expect(moments(review.temps)).toEqual([
      '2025-01-01T12:00:00.000Z',
      '2025-01-01T13:30:00.000Z',
      '2025-01-01T15:00:00.000Z',
    ]);
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

  // `GET state` on a fresh or reset database and `PUT state/toggleSmoking` with
  // no current smoke both answer with an EMPTY body. This app opts its transport
  // into mapping that to `null` (see createProductionApiClient), so "no state"
  // reads as `null` here rather than as the raw `''` axios hands back.
  test('a state read with no state document resolves null, never an empty string', async () => {
    const backend = createFakeBackend({ state: null });
    const client = createApiClient(backend);

    await expect(client.state.get()).resolves.toBeNull();
  });

  test('toggling with no current smoke resolves null, never an empty string', async () => {
    const backend = createFakeBackend({ state: null });
    const client = createApiClient(backend);

    await expect(client.state.toggleSmoking()).resolves.toBeNull();
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
      durationMs: 6 * 60 * 60 * 1000,
      notes: [],
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

/** A target nobody has typed in: the shipped default, which seeding may replace. */
const untouched = { targetSource: 'default' } as const;

const savedSettings: NotificationSettings = {
  chamber: { enabled: true, low: 225, high: 275 },
  probeTarget: {
    enabled: true,
    probes: [
      { slot: 'probe1', enabled: true, target: 203, ...untouched, name: 'Brisket Flat' },
      { slot: 'probe2', enabled: false, target: 203, ...untouched, name: 'Probe 2' },
      { slot: 'probe3', enabled: false, target: 203, ...untouched, name: 'Probe 3' },
    ],
  },
  smokeComplete: { enabled: true },
  targetPresets: { beef: 203, pork: 195, poultry: 165 },
};

/**
 * The same document as the backend's strict DTO accepts it: no resolved names,
 * and no presets — the Default target temps card saves its own block, so an
 * alert save never carries one browser's presets over another's edit.
 */
const savedSettingsBody = {
  chamber: { enabled: true, low: 225, high: 275 },
  probeTarget: {
    enabled: true,
    probes: [
      { slot: 'probe1', enabled: true, target: 203, ...untouched },
      { slot: 'probe2', enabled: false, target: 203, ...untouched },
      { slot: 'probe3', enabled: false, target: 203, ...untouched },
    ],
  },
  smokeComplete: { enabled: true },
};

describe('notifications client — settings', () => {
  test('getSettings returns the stored notification settings document', async () => {
    // Seeded as it is actually stored — by slot, without names — since the
    // names are resolved from the cook on the way out.
    const backend = createFakeBackend({
      appSettings: { settings: savedSettingsBody },
      smokeProfile: { current: { probe1Name: 'Brisket Flat' } },
    });
    const client = createApiClient(backend);

    const result = await client.notifications.getSettings();

    expect(result).toEqual(savedSettings);
    expect(backend.requests).toContainEqual({
      method: 'get',
      path: 'appSettings',
      body: undefined,
    });
  });

  test('getSettings resolves undefined (not a throw) when the wire body is empty', async () => {
    // A backend that has never had settings saved serializes the read as a 200
    // with an empty body, which the transport normalizes to `null`. That must
    // reach the caller as "nothing yet" so it keeps its defaults, not as a throw.
    const emptyBodyTransport = {
      get: async () => null as never,
      post: async () => undefined as never,
      put: async () => undefined as never,
      delete: async () => undefined as never,
    };
    const client = createApiClient(emptyBodyTransport);

    await expect(client.notifications.getSettings()).resolves.toBeUndefined();
  });

  // The resolved probe names ride along on the read but are not the user's to
  // set: the backend's strict validation edge rejects a save that carries them,
  // exactly as it rejects the persisted _id/__v a fetched document carries.
  test('saveSettings sends the settings, stripping the resolved names and the persisted _id/__v it was read with', async () => {
    const backend = createFakeBackend();
    const client = createApiClient(backend);

    await client.notifications.saveSettings({
      ...savedSettings,
      _id: 'settings-1',
      __v: 0,
    });

    expect(backend.requests).toContainEqual({
      method: 'post',
      path: 'appSettings',
      body: savedSettingsBody,
    });
  });

  test('saveSettings fills in defaults for a partially-specified document', async () => {
    // The backend validates strictly, so a half-filled chamber block would 400
    // and the settings page's save-on-unmount would fail silently.
    const backend = createFakeBackend();
    const client = createApiClient(backend);

    await client.notifications.saveSettings({ chamber: { enabled: true } });

    expect(backend.requests).toContainEqual({
      method: 'post',
      path: 'appSettings',
      body: {
        chamber: { enabled: true, low: 225, high: 275 },
        probeTarget: {
          enabled: false,
          probes: [
            { slot: 'probe1', enabled: false, target: 203, ...untouched },
            { slot: 'probe2', enabled: false, target: 203, ...untouched },
            { slot: 'probe3', enabled: false, target: 203, ...untouched },
          ],
        },
        smokeComplete: { enabled: false },
      },
    });
  });

  // A document saved before a slot existed (or with one dropped) must still
  // render a row per probe and save a full list, or a probe would quietly
  // disappear from the page it is configured on.
  test('saveSettings fills in every probe slot the document is missing', async () => {
    const backend = createFakeBackend();
    const client = createApiClient(backend);

    await client.notifications.saveSettings({
      chamber: { enabled: false, low: 225, high: 275 },
      probeTarget: {
        enabled: true,
        probes: [{ slot: 'probe2', enabled: true, target: 195, ...untouched, name: 'Pork Butt' }],
      },
    });

    expect(backend.requests).toContainEqual({
      method: 'post',
      path: 'appSettings',
      body: {
        chamber: { enabled: false, low: 225, high: 275 },
        probeTarget: {
          enabled: true,
          probes: [
            { slot: 'probe1', enabled: false, target: 203, ...untouched },
            { slot: 'probe2', enabled: true, target: 195, ...untouched },
            { slot: 'probe3', enabled: false, target: 203, ...untouched },
          ],
        },
        smokeComplete: { enabled: false },
      },
    });
  });

  test('round-trips settings saved by the client back through a read', async () => {
    const backend = createFakeBackend();
    const client = createApiClient(backend);

    await client.notifications.saveSettings({
      chamber: { enabled: true, low: 200, high: 300 },
      probeTarget: {
        enabled: true,
        probes: [
          { slot: 'probe1', enabled: true, target: 203, ...untouched, name: 'Brisket Flat' },
        ],
      },
    });

    await expect(client.notifications.getSettings()).resolves.toEqual({
      chamber: { enabled: true, low: 200, high: 300 },
      probeTarget: {
        enabled: true,
        probes: [
          { slot: 'probe1', enabled: true, target: 203, ...untouched, name: 'Probe 1' },
          { slot: 'probe2', enabled: false, target: 203, ...untouched, name: 'Probe 2' },
          { slot: 'probe3', enabled: false, target: 203, ...untouched, name: 'Probe 3' },
        ],
      },
      smokeComplete: { enabled: false },
      targetPresets: { beef: 203, pork: 195, poultry: 165 },
    });
  });

  // A stored document holding a subset of the slots must still name each row
  // after its own slot: falling back by row position would label a lone probe2
  // "Probe 1" and silently disagree with the deployed backend.
  test('getSettings names an unnamed row after its slot, not its position in the list', async () => {
    const backend = createFakeBackend({
      appSettings: {
        settings: {
          chamber: { enabled: false, low: 225, high: 275 },
          probeTarget: {
            enabled: true,
            probes: [{ slot: 'probe2', enabled: true, target: 195, ...untouched }],
          },
        },
      },
    });
    const client = createApiClient(backend);

    const result = await client.notifications.getSettings();

    expect(result?.probeTarget.probes.map(probe => probe.name)).toEqual([
      'Probe 1',
      'Probe 2',
      'Probe 3',
    ]);
  });

  /**
   * Per-probe targets shipped a release before seeding did, so a stored row can
   * carry a temperature somebody typed with nothing recording that they did.
   * The page has to read those rows as theirs, or the next cook would seed a
   * category's temperature over a number the user chose.
   */
  describe('targets stored before they carried a provenance', () => {
    const storedRow = (target: number) => ({
      appSettings: {
        settings: {
          chamber: { enabled: false, low: 225, high: 275 },
          probeTarget: { enabled: true, probes: [{ slot: 'probe1', enabled: true, target }] },
        },
      },
    });

    test('reads a target that is not the shipped default as the user’s own', async () => {
      const client = createApiClient(createFakeBackend(storedRow(145)));

      const result = await client.notifications.getSettings();

      expect(result?.probeTarget.probes[0]).toMatchObject({ target: 145, targetSource: 'user' });
    });

    // A row left on the shipped 203°F is indistinguishable from one nobody ever
    // opened, so it stays seedable and an upgraded deployment still gets presets.
    test('reads a target still on the shipped default as untouched', async () => {
      const client = createApiClient(createFakeBackend(storedRow(203)));

      const result = await client.notifications.getSettings();

      expect(result?.probeTarget.probes[0]).toMatchObject({ target: 203, targetSource: 'default' });
    });
  });

  // Names are the backend's to resolve from the active cook, so the read has to
  // carry them through rather than leave the page showing slot identifiers.
  test('getSettings keeps the probe names the backend resolved for the current cook', async () => {
    const backend = createFakeBackend({
      appSettings: { settings: savedSettingsBody },
      smokeProfile: { current: { probe1Name: 'Brisket Flat', probe2Name: 'Pork Butt' } },
    });
    const client = createApiClient(backend);

    const result = await client.notifications.getSettings();

    expect(result?.probeTarget.probes.map(probe => probe.name)).toEqual([
      'Brisket Flat',
      'Pork Butt',
      'Probe 3',
    ]);
  });
});

describe('notifications client — default target temps', () => {
  test('getSettings carries the stored default target temps', async () => {
    const backend = createFakeBackend({
      appSettings: {
        settings: { ...savedSettingsBody, targetPresets: { beef: 210, pork: 190, poultry: 170 } },
      },
    });
    const client = createApiClient(backend);

    const result = await client.notifications.getSettings();

    expect(result?.targetPresets).toEqual({ beef: 210, pork: 190, poultry: 170 });
  });

  // A deployment that has never opened the card — and one older than the card
  // itself — still has to render three temperatures rather than blank fields.
  test('getSettings falls back to the shipped defaults when none are stored', async () => {
    const backend = createFakeBackend({ appSettings: { settings: savedSettingsBody } });
    const client = createApiClient(backend);

    const result = await client.notifications.getSettings();

    expect(result?.targetPresets).toEqual({ beef: 203, pork: 195, poultry: 165 });
  });

  test('saveTargetPresets sends the presets block on its own', async () => {
    const backend = createFakeBackend();
    const client = createApiClient(backend);

    await client.notifications.saveTargetPresets({ beef: 210, pork: 190, poultry: 170 });

    expect(backend.requests).toContainEqual({
      method: 'post',
      path: 'appSettings',
      body: { targetPresets: { beef: 210, pork: 190, poultry: 170 } },
    });
  });

  /**
   * The presets card and the alerts card are two writers of one document, both
   * on screen at once. Either one sending the other's block would undo an edit
   * the user made in it moments earlier.
   */
  test('saving the alerts leaves edited presets exactly as they were', async () => {
    const backend = createFakeBackend();
    const client = createApiClient(backend);
    await client.notifications.saveTargetPresets({ beef: 210, pork: 190, poultry: 170 });

    await client.notifications.saveSettings({ chamber: { enabled: true, low: 200, high: 300 } });

    await expect(client.notifications.getSettings()).resolves.toMatchObject({
      chamber: { enabled: true, low: 200, high: 300 },
      targetPresets: { beef: 210, pork: 190, poultry: 170 },
    });
  });

  test('edited presets are read back after the save', async () => {
    const backend = createFakeBackend();
    const client = createApiClient(backend);

    await client.notifications.saveTargetPresets({ beef: 210, pork: 190, poultry: 170 });

    await expect(client.notifications.getSettings()).resolves.toMatchObject({
      targetPresets: { beef: 210, pork: 190, poultry: 170 },
    });
  });
});

describe('appearance client — the installation-wide preference', () => {
  test('reads the preference the installation has stored', async () => {
    const backend = createFakeBackend({
      appSettings: { settings: { appearance: { mode: 'dark', resolvedMode: 'dark' } } },
    });
    const client = createApiClient(backend);

    await expect(client.appearance.get()).resolves.toEqual({
      mode: 'dark',
      resolvedMode: 'dark',
    });
  });

  /**
   * An installation nobody has chosen an appearance on answers with the
   * documented default rather than with an error or an absence — the same value
   * the resolver and the backend start from, so a fresh installation cannot
   * disagree with itself about what "nothing chosen" looks like.
   */
  test('reads the default the whole product shares when nothing has been chosen', async () => {
    const client = createApiClient(createFakeBackend());

    await expect(client.appearance.get()).resolves.toEqual(DEFAULT_APPEARANCE_PREFERENCE);
  });

  /**
   * A frontend can outrun the backend it talks to: a deployment still serving
   * the document as it was before the appearance block existed answers without
   * one. That is the same "nothing chosen here" and reaches the caller as a
   * preference it can render, not as an absence it has to interpret.
   */
  test('reads the default from a document served without an appearance block', async () => {
    const olderBackend = {
      get: async () => ({ chamber: { enabled: true, low: 200, high: 300 } }) as never,
      post: async () => undefined as never,
      put: async () => undefined as never,
      delete: async () => undefined as never,
    };
    const client = createApiClient(olderBackend);

    await expect(client.appearance.get()).resolves.toEqual(DEFAULT_APPEARANCE_PREFERENCE);
  });

  /**
   * Sending the alert block back on every repaint would make a colour choice a
   * save of settings the operator may be editing in another tab.
   */
  test('writes the preference alone, leaving the alert settings alone', async () => {
    const backend = createFakeBackend({
      appSettings: { settings: { chamber: { enabled: true, low: 200, high: 300 } } },
    });
    const client = createApiClient(backend);

    await client.appearance.save({ mode: 'light', resolvedMode: 'light' });

    expect(backend.requests).toContainEqual({
      method: 'post',
      path: 'appSettings',
      body: { appearance: { mode: 'light', resolvedMode: 'light' } },
    });
    await expect(client.notifications.getSettings()).resolves.toMatchObject({
      chamber: { enabled: true, low: 200, high: 300 },
    });
  });

  test('round-trips a preference it wrote back through a read', async () => {
    const backend = createFakeBackend();
    const client = createApiClient(backend);

    await client.appearance.save({ mode: 'system', resolvedMode: 'dark' });

    await expect(client.appearance.get()).resolves.toEqual({
      mode: 'system',
      resolvedMode: 'dark',
    });
  });
});

const browserSubscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/browser-endpoint',
  expirationTime: null,
  keys: { p256dh: 'browser-p256dh', auth: 'browser-auth' },
};

describe('notifications client — push delivery', () => {
  test('getPublicKey reads the VAPID key the backend serves at runtime', async () => {
    const backend = createFakeBackend({ notifications: { publicKey: 'BRuntimeKey' } });
    const client = createApiClient(backend);

    await expect(client.notifications.getPublicKey()).resolves.toBe('BRuntimeKey');
    expect(backend.requests).toContainEqual({
      method: 'get',
      path: 'notifications/publicKey',
      body: undefined,
    });
  });

  test('getPublicKey rejects when the deployment has no key configured', async () => {
    const backend = createFakeBackend({ notifications: { publicKey: null } });
    const client = createApiClient(backend);

    await expect(client.notifications.getPublicKey()).rejects.toThrow(
      /not configured|no push key/i
    );
  });

  // An operator misconfiguration and a transient network failure need different
  // answers, so the "no key on the server" rejection carries its own type
  // rather than only a message a caller would have to string-match.
  test('getPublicKey rejects with a typed not-configured error', async () => {
    const backend = createFakeBackend({ notifications: { publicKey: null } });
    const client = createApiClient(backend);

    await expect(client.notifications.getPublicKey()).rejects.toBeInstanceOf(
      PushNotConfiguredError
    );
  });

  test('registerSubscription stores the browser subscription on the backend', async () => {
    const backend = createFakeBackend();
    const client = createApiClient(backend);

    await client.notifications.registerSubscription(browserSubscription);

    expect(backend.store.notifications.subscriptions).toEqual([browserSubscription]);
    expect(backend.requests).toContainEqual({
      method: 'post',
      path: 'notifications/subscribe',
      body: browserSubscription,
    });
  });

  test('registering the same endpoint twice replaces it rather than failing', async () => {
    const backend = createFakeBackend();
    const client = createApiClient(backend);

    await client.notifications.registerSubscription(browserSubscription);
    const rotated = {
      ...browserSubscription,
      keys: { p256dh: 'rotated-p256dh', auth: 'rotated-auth' },
    };

    await expect(client.notifications.registerSubscription(rotated)).resolves.not.toThrow();
    expect(backend.store.notifications.subscriptions).toEqual([rotated]);
  });

  test('sendTest asks the backend to dispatch to every stored subscription', async () => {
    const backend = createFakeBackend();
    const client = createApiClient(backend);
    await client.notifications.registerSubscription(browserSubscription);

    const result = await client.notifications.sendTest();

    expect(result).toEqual({ sent: 1 });
    expect(backend.store.notifications.testSends).toBe(1);
  });

  // The backend answers 200 even when every send was rejected by the push
  // service, so the delivered count is the only thing that distinguishes "it
  // arrived" from "it reached nobody" — the client must hand it back.
  test('sendTest reports zero delivered when the push service rejects every send', async () => {
    const backend = createFakeBackend({ notifications: { deliveryFails: true } });
    const client = createApiClient(backend);
    await client.notifications.registerSubscription(browserSubscription);

    await expect(client.notifications.sendTest()).resolves.toEqual({ sent: 0 });
  });
});

// A smoke whose five child ids each point at a seeded child record, so the
// cascade delete and review aggregate resolve every piece from the store.
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
    preSmoke: {
      records: { 'pre-1': { name: 'Brisket', meatType: 'Beef', weight: {}, steps: [] } },
    },
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
    temps: { records: { 'temps-1': sampleTemps } },
    postSmoke: { records: { 'post-1': { restTime: '30', steps: [], notes: 'rested' } } },
    ratings: {
      records: {
        'rate-1': { smokeFlavor: 5, seasoning: 4, tenderness: 5, overallTaste: 5, notes: 'great' },
      },
    },
  });

describe('smoke client — ordered cascade delete', () => {
  test('a fully seeded smoke removes all five children and then the parent', async () => {
    const backend = seedFullSmoke();
    const client = createApiClient(backend);

    await client.smoke.deleteCascade('smoke-1');

    expect(backend.store.preSmoke.records['pre-1']).toBeUndefined();
    expect(backend.store.smokeProfile.records['prof-1']).toBeUndefined();
    expect(backend.store.temps.records['temps-1']).toBeUndefined();
    expect(backend.store.postSmoke.records['post-1']).toBeUndefined();
    expect(backend.store.ratings.records['rate-1']).toBeUndefined();
    expect(backend.store.smoke.records['smoke-1']).toBeUndefined();
  });

  test('an injected child-delete failure leaves the parent present and rejects with the typed error', async () => {
    const backend = seedFullSmoke();
    const client = createApiClient(backend);
    backend.injectFault({ method: 'delete', path: 'temps/temps-1', status: 500 });

    const error = (await client.smoke.deleteCascade('smoke-1').catch(e => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(500);
    // Parent must survive so the operation is retryable with no orphans.
    expect(backend.store.smoke.records['smoke-1']).toEqual(seededSmoke);
    // The parent delete must never have been issued.
    expect(backend.requests).not.toContainEqual({
      method: 'delete',
      path: 'smoke/smoke-1',
      body: undefined,
    });
  });

  test('a nonexistent smoke rejects and issues zero delete calls', async () => {
    const backend = seedFullSmoke();
    const client = createApiClient(backend);

    const error = (await client.smoke.deleteCascade('missing').catch(e => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    // Not a single delete was issued.
    expect(backend.requests.filter(r => r.method === 'delete')).toHaveLength(0);
    // Every seeded record is untouched.
    expect(backend.store.smoke.records['smoke-1']).toEqual(seededSmoke);
    expect(backend.store.preSmoke.records['pre-1']).toBeDefined();
    expect(backend.store.temps.records['temps-1']).toBeDefined();
    expect(backend.store.ratings.records['rate-1']).toBeDefined();
  });
});

describe('smoke client — review aggregate', () => {
  test('composes the parent plus all five child pieces for a seeded smoke', async () => {
    const backend = seedFullSmoke();
    const client = createApiClient(backend);

    const review = await client.smoke.getReview('smoke-1');

    expect(review.smoke).toEqual(seededSmoke);
    expect(review.preSmoke.name).toBe('Brisket');
    expect(review.smokeProfile.chamberName).toBe('Main');
    expect(review.temps).toEqual(sampleTemps);
    expect(review.postSmoke.restTime).toBe('30');
    expect(review.rating.overallTaste).toBe(5);
  });

  test('a missing optional piece yields its typed default instead of failing the whole call', async () => {
    // Seed everything except the temperature series.
    const backend = seedFullSmoke();
    backend.injectFault({ method: 'get', path: 'temps/temps-1', status: 404 });
    const client = createApiClient(backend);

    const review = await client.smoke.getReview('smoke-1');

    // The other four pieces still resolve from the store.
    expect(review.preSmoke.name).toBe('Brisket');
    expect(review.rating.overallTaste).toBe(5);
    // The absent temps piece is the typed default (an empty series), not a throw.
    expect(review.temps).toEqual([]);
  });

  test('a parent whose every child is absent still composes with all typed defaults', async () => {
    // Seed only the parent, pointing at child ids that have no records.
    const backend = createFakeBackend({ smoke: { records: { 'smoke-1': seededSmoke } } });
    const client = createApiClient(backend);

    const review = await client.smoke.getReview('smoke-1');

    expect(review.smoke).toEqual(seededSmoke);
    expect(review.preSmoke).toEqual({ weight: {}, steps: [] });
    expect(review.smokeProfile).toEqual({
      chamberName: '',
      probe1Name: '',
      probe2Name: '',
      probe3Name: '',
      notes: '',
      woodType: '',
    });
    expect(review.temps).toEqual([]);
    expect(review.postSmoke).toEqual({ restTime: '', steps: [] });
    expect(review.rating).toEqual({
      smokeFlavor: 0,
      seasoning: 0,
      tenderness: 0,
      overallTaste: 0,
      notes: '',
    });
  });

  test('a missing parent rejects with the typed ApiError', async () => {
    const backend = createFakeBackend();
    const client = createApiClient(backend);

    const error = (await client.smoke.getReview('missing').catch(e => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
  });

  test('the cook it carries reads back as numbers, however it was stored', async () => {
    const backend = seedFullSmoke();
    backend.store.temps.records['temps-1'] = [
      {
        ChamberTemp: '225',
        MeatTemp: '145',
        Meat2Temp: '0',
        Meat3Temp: '0',
        date: new Date('2025-01-01T12:00:00Z'),
      },
    ];
    const client = createApiClient(backend);

    const review = await client.smoke.getReview('smoke-1');

    // This is the series the review card charts, so string readings reaching it
    // are a blank chart on a smoke that was recorded perfectly well.
    expect(review.temps[0]).toMatchObject({ ChamberTemp: 225, MeatTemp: 145 });
  });
});

describe('timeline client — the cook clock', () => {
  test('reads a stored timeline with its stamps as dates, not wire strings', async () => {
    const backend = createFakeBackend({
      timeline: {
        records: {
          'smoke-1': {
            startedAt: '2025-01-01T12:00:00.000Z',
            finishedAt: '2025-01-01T18:30:00.000Z',
            durationMs: 23400000,
            peakChamber: 268,
            peakMeat: 203,
            targetTemp: 203,
          },
        },
      },
    });
    const client = createApiClient(backend);

    const timeline = await client.timeline.getById('smoke-1');

    // The elapsed clock subtracts from this, so a string here is `NaN` on screen.
    expect(timeline.startedAt).toEqual(new Date('2025-01-01T12:00:00.000Z'));
    expect(timeline.finishedAt).toEqual(new Date('2025-01-01T18:30:00.000Z'));
    expect(timeline.durationMs).toBe(23400000);
    expect(timeline.peakChamber).toBe(268);
  });

  test('a cook whose timing nothing recorded reads as absent, not as zero', async () => {
    const backend = createFakeBackend({
      timeline: {
        records: {
          'smoke-1': {
            startedAt: null,
            finishedAt: null,
            durationMs: null,
            peakChamber: null,
            peakMeat: null,
            targetTemp: null,
          },
        },
      },
    });

    const timeline = await createApiClient(backend).timeline.getById('smoke-1');

    expect(timeline).toEqual({
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      peakChamber: null,
      peakMeat: null,
      targetTemp: null,
    });
  });

  // Each fake backend is its own world. A test that reaches into the store and
  // starts the running cook must not be editing the empty cook every later test
  // in the run begins from — that is an order-dependent failure, and the kind
  // nobody reads a diff to find.
  test('an unseeded running cook is a copy of the empty one, not the empty one itself', () => {
    const backend = createFakeBackend();

    backend.store.timeline.current.startedAt = '2025-01-01T12:00:00.000Z';

    expect(NO_CURRENT_TIMELINE.startedAt).toBeNull();
    expect(createFakeBackend().store.timeline.current.startedAt).toBeNull();
  });

  test('with no session set up, the current cook is timed and estimated as nothing', async () => {
    const backend = createFakeBackend({ state: { smokeId: '', smoking: false } });

    const timeline = await createApiClient(backend).timeline.getCurrent();

    // Not an absent read: there is always a current cook to ask about, it is
    // simply empty — and every field of it reads as the absence the screens
    // render as an em-dash.
    expect(timeline?.startedAt).toBeNull();
    expect(timeline?.estimate.state).toBeNull();
  });

  test('the current cook is read from the running-cook route, estimate and all', async () => {
    const backend = createFakeBackend({
      state: { smokeId: 'smoke-1', smoking: true },
      timeline: {
        current: {
          startedAt: '2025-01-01T12:00:00.000Z',
          finishedAt: null,
          durationMs: null,
          peakChamber: 240,
          peakMeat: 150,
          targetTemp: null,
          estimate: {
            state: 'ok',
            eta: '2025-01-01T18:00:00.000Z',
            hoursRemaining: 2.5,
            ratePerHour: 8.2,
            progressPercent: 62,
            startTemp: 45,
            targetTemp: 203,
          },
        },
      },
    });

    const timeline = await createApiClient(backend).timeline.getCurrent();

    expect(timeline?.startedAt).toEqual(new Date('2025-01-01T12:00:00.000Z'));
    // The card counts down to this moment, so a string here is arithmetic on
    // text — the same failure the stamps are converted for.
    expect(timeline?.estimate.eta).toEqual(new Date('2025-01-01T18:00:00.000Z'));
    expect(timeline?.estimate).toMatchObject({
      state: 'ok',
      hoursRemaining: 2.5,
      ratePerHour: 8.2,
      progressPercent: 62,
      startTemp: 45,
      targetTemp: 203,
    });
  });

  /**
   * A browser holds whatever bundle it last loaded, and a cloud backend can be
   * a deployment behind it. The route this client asks for did not always
   * exist: an older backend takes "current" for a smoke id and rejects it (400),
   * or has nothing at that address (404). Neither is a reason to fail the smoke
   * screen — there is simply no estimate to show yet.
   */
  test('a backend too old to know the running-cook route is answered as no cook', async () => {
    const backend = createFakeBackend({ state: { smokeId: 'smoke-1', smoking: true } });
    backend.injectFault({ method: 'get', path: 'timeline/current', status: 400 });

    expect(await createApiClient(backend).timeline.getCurrent()).toBeNull();
  });

  // An outage is not a missing feature: the screens tell the user when the cook
  // clock cannot be read, and they can only do that if the read still fails.
  test('an unreachable backend still fails the running-cook read', async () => {
    const backend = createFakeBackend({ state: { smokeId: 'smoke-1', smoking: true } });
    backend.injectFault({ method: 'get', path: 'timeline/current', status: 500 });

    await expect(createApiClient(backend).timeline.getCurrent()).rejects.toBeInstanceOf(ApiError);
  });

  test('a running cook with no probe being watched has an estimate of nothing', async () => {
    const backend = createFakeBackend({
      state: { smokeId: 'smoke-1', smoking: true },
      timeline: {
        current: {
          startedAt: '2025-01-01T12:00:00.000Z',
          finishedAt: null,
          durationMs: null,
          peakChamber: 240,
          peakMeat: 150,
          targetTemp: null,
          estimate: {
            state: null,
            eta: null,
            hoursRemaining: null,
            ratePerHour: null,
            progressPercent: null,
            startTemp: null,
            targetTemp: null,
          },
        },
      },
    });

    const timeline = await createApiClient(backend).timeline.getCurrent();

    expect(timeline?.estimate).toEqual({
      state: null,
      eta: null,
      hoursRemaining: null,
      ratePerHour: null,
      progressPercent: null,
      startTemp: null,
      targetTemp: null,
    });
  });
});

describe('stats client — archive read', () => {
  test('resolves statistics derived from the fixtures the backend holds', async () => {
    const backend = createFakeBackend({
      smoke: {
        all: [
          {
            preSmokeId: 'pre-1',
            smokeProfileId: 'prof-1',
            postSmokeId: 'post-1',
            ratingId: 'rate-1',
            tempsId: 'temps-1',
            date: new Date('2026-04-20T12:00:00Z'),
            status: 1,
            _id: 'smoke-1',
          } as Smoke,
        ],
      },
      preSmoke: {
        records: {
          'pre-1': {
            name: 'Sunday brisket',
            meatType: 'Brisket',
            weight: { weight: 12, unit: 'LB' },
            steps: [],
            notes: '',
          } as unknown as PreSmoke,
        },
      },
      smokeProfile: { records: { 'prof-1': { woodType: 'Hickory' } } },
      postSmoke: {
        records: { 'post-1': { restTime: '01:30', steps: [], notes: '' } },
      },
      ratings: {
        records: {
          'rate-1': {
            smokeFlavor: 8,
            seasoning: 7,
            tenderness: 9,
            overallTaste: 8,
            notes: '',
          },
        },
      },
      timeline: {
        records: {
          'smoke-1': {
            startedAt: '2026-04-20T06:00:00.000Z',
            finishedAt: '2026-04-20T14:00:00.000Z',
            durationMs: 8 * 60 * 60 * 1000,
            peakChamber: 265,
            peakMeat: 203,
            targetTemp: 203,
          },
        },
      },
    });

    const stats = await createApiClient(backend).stats.get();

    expect(stats.totalSessions).toBe(1);
    expect(stats.totalPounds).toBe(12);
    expect(stats.totalCookMs).toBe(8 * 60 * 60 * 1000);
    expect(stats.totalRestMs).toBe(90 * 60 * 1000);
    expect(stats.averageRating).toBe(8);
    expect(stats.byMeat).toEqual([{ meatType: 'Brisket', sessions: 1, pounds: 12 }]);
    expect(stats.byWood).toEqual([{ woodType: 'Hickory', sessions: 1 }]);
    expect(backend.requests).toContainEqual({ method: 'get', path: 'stats', body: undefined });
  });

  test('a cook nobody weighed leaves the weight unrecorded and the rest at zero', async () => {
    const backend = createFakeBackend({
      smoke: {
        all: [
          {
            preSmokeId: 'pre-1',
            postSmokeId: 'post-1',
            date: new Date('2026-04-20T12:00:00Z'),
            status: 1,
            _id: 'smoke-1',
          } as Smoke,
        ],
      },
      preSmoke: {
        records: {
          'pre-1': { meatType: 'Brisket', steps: [], notes: '' } as unknown as PreSmoke,
        },
      },
      postSmoke: { records: { 'post-1': { restTime: '', steps: [], notes: '' } } },
    });

    const stats = await createApiClient(backend).stats.get();

    expect(stats.totalSessions).toBe(1);
    expect(stats.totalPounds).toBeNull();
    expect(stats.approximateServings).toBeNull();
    expect(stats.totalRestMs).toBe(0);
  });

  test('an archive with nothing completed in it reads as no sessions at all', async () => {
    const stats = await createApiClient(createFakeBackend()).stats.get();

    expect(stats.totalSessions).toBe(0);
    expect(stats.totalPounds).toBeNull();
    expect(stats.byMeat).toEqual([]);
  });

  test('rejects with the typed ApiError on failure', async () => {
    const backend = createFakeBackend();
    backend.injectFault({ method: 'get', path: 'stats', status: 503 });

    const error = (await createApiClient(backend)
      .stats.get()
      .catch(e => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(503);
  });
});
