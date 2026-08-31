/**
 * Endpoint-contract table.
 *
 * The single pinned source of truth for every request the deep client can emit:
 * exact HTTP method + exact legacy path string, and — for writes — the exact
 * projected body shape (DTO-whitelisted fields only, per the strict-validation
 * edge from PR #323). Its job is to prove the whole ports-&-adapters migration
 * changed no URL the backend receives and stripped every stray persisted field
 * before a save.
 *
 * Each row drives a real client operation over the in-memory fake backend and
 * asserts the recorded request(s). Because the fake backend records the same
 * path/method/body the production axios adapter would send, a passing table is a
 * behavior-preserving contract, not an implementation snapshot.
 */
import { createApiClient } from './client';
import { RecordedRequest } from 'api-transport/src';
import { createFakeBackend, FakeBackend } from './fakeBackend';
import {
  NotificationSettings,
  PostSmoke,
  PreSmoke,
  PushSubscriptionPayload,
  Smoke,
  SmokeProfile,
  rating,
} from './types';
import { WeightUnits } from '../components/common/interfaces/enums';

// A profile carrying stray persisted fields (`_id`/`__v`) that the outbound DTO
// projection must strip before the save reaches the wire.
const seededProfile = {
  _id: 'profile-mongo-id',
  __v: 3,
  chamberName: 'Main Chamber',
  probe1Name: 'Probe A',
  probe2Name: 'Probe B',
  probe3Name: 'Probe C',
  notes: 'low and slow',
  woodType: 'Hickory',
};

// A pre-smoke whose weight arrives as the UI's runtime string and which carries
// stray persisted subdocument fields the DTO projection must drop / coerce.
const seededPreSmoke = {
  _id: 'pre-mongo-id',
  __v: 1,
  name: 'Brisket',
  meatType: 'Beef',
  weight: { _id: 'weight-mongo-id', weight: '12', unit: WeightUnits.LB },
  steps: ['trim', 'season'],
  notes: 'overnight',
} as unknown as PreSmoke;

const seededPostSmoke = {
  _id: 'post-mongo-id',
  __v: 2,
  restTime: '30',
  steps: ['rest', 'slice'],
  notes: 'wrap in foil',
} as unknown as PostSmoke;

const seededRatingWithId: rating = {
  _id: 'rating-1',
  smokeFlavor: 8,
  seasoning: 7,
  tenderness: 9,
  overallTaste: 8,
  notes: 'great',
};

const seededRatingNoId: rating = {
  smokeFlavor: 5,
  seasoning: 5,
  tenderness: 5,
  overallTaste: 5,
  notes: 'ok',
};

const seededNotifications: NotificationSettings = {
  chamber: { enabled: true, low: 225, high: 275 },
  probeTarget: {
    enabled: true,
    probes: [
      {
        slot: 'probe1',
        enabled: true,
        target: 203,
        targetSource: 'user',
        leadMinutes: 15,
        name: 'Brisket Flat',
      },
    ],
  },
  smokeComplete: { enabled: true },
  headsUp: { enabled: true },
  targetPresets: { beef: 203, pork: 195, poultry: 165, wrapTemp: 165 },
};

// A browser push subscription in its wire form — the exact body the backend
// upserts on `notifications/subscribe`.
const seededSubscription: PushSubscriptionPayload = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/contract-endpoint',
  expirationTime: null,
  keys: { p256dh: 'contract-p256dh', auth: 'contract-auth' },
};

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

const fullySeededBackend = (): FakeBackend =>
  createFakeBackend({
    temps: { current: [], records: { t1: [] } },
    smokeProfile: { current: seededProfile, records: { 'prof-1': seededProfile } },
    preSmoke: {
      current: seededPreSmoke,
      records: { 'pre-1': seededPreSmoke },
    },
    postSmoke: {
      current: seededPostSmoke,
      records: { 'post-1': seededPostSmoke },
    },
    ratings: {
      current: seededRatingNoId,
      records: { r1: seededRatingWithId, 'rate-1': seededRatingWithId },
    },
    appSettings: { settings: seededNotifications },
    state: { smokeId: 'smoke-1', smoking: false },
    smoke: {
      records: { 'smoke-1': seededSmoke },
      all: [seededSmoke],
      finish: seededSmoke,
    },
    history: [],
    timeline: {
      records: {
        'smoke-1': {
          startedAt: '2025-01-01T12:00:00.000Z',
          finishedAt: '2025-01-01T18:00:00.000Z',
          durationMs: 21600000,
          peakChamber: 268,
          peakMeat: 203,
          targetTemp: 203,
        },
      },
    },
  });

interface ContractRow {
  name: string;
  run: (client: ReturnType<typeof createApiClient>) => Promise<unknown>;
  expected: RecordedRequest;
}

// The projected write bodies, pinned exactly. Only the backend DTO whitelist
// survives — stray persisted `_id`/`__v` never ride along, and the pre-smoke
// weight is coerced from the UI string to a number.
const projectedProfileBody = {
  chamberName: 'Main Chamber',
  probe1Name: 'Probe A',
  probe2Name: 'Probe B',
  probe3Name: 'Probe C',
  notes: 'low and slow',
  woodType: 'Hickory',
};

const projectedPreSmokeBody = {
  name: 'Brisket',
  meatType: 'Beef',
  weight: { unit: WeightUnits.LB, weight: 12 },
  steps: ['trim', 'season'],
  notes: 'overnight',
};

const projectedPostSmokeBody = {
  restTime: '30',
  steps: ['rest', 'slice'],
  notes: 'wrap in foil',
};

const projectedRatingBody = {
  smokeFlavor: 8,
  seasoning: 7,
  tenderness: 9,
  overallTaste: 8,
  notes: 'great',
};

const projectedRatingCreateBody = {
  smokeFlavor: 5,
  seasoning: 5,
  tenderness: 5,
  overallTaste: 5,
  notes: 'ok',
};

// The resolved probe names are stripped and every slot is filled in: the
// backend's strict DTO accepts neither a name nor a partial list.
const projectedNotificationsBody = {
  chamber: { enabled: true, low: 225, high: 275 },
  probeTarget: {
    enabled: true,
    probes: [
      { slot: 'probe1', enabled: true, target: 203, targetSource: 'user', leadMinutes: 15 },
      { slot: 'probe2', enabled: false, target: 203, targetSource: 'default', leadMinutes: null },
      { slot: 'probe3', enabled: false, target: 203, targetSource: 'default', leadMinutes: null },
    ],
  },
  smokeComplete: { enabled: true },
  headsUp: { enabled: true },
};

const rows: ContractRow[] = [
  // temps
  {
    name: 'temps.getCurrent → GET temps',
    run: c => c.temps.getCurrent(),
    expected: { method: 'get', path: 'temps', body: undefined },
  },
  {
    name: 'temps.getById → GET temps/:id',
    run: c => c.temps.getById('t1'),
    expected: { method: 'get', path: 'temps/t1', body: undefined },
  },
  {
    name: 'temps.getSeries → GET temps/:id/series (unsized, the endpoint decides)',
    run: c => c.temps.getSeries('t1'),
    expected: { method: 'get', path: 'temps/t1/series', body: undefined },
  },
  {
    name: 'temps.getSeries → GET temps/:id/series?points=N',
    run: c => c.temps.getSeries('t1', 300),
    expected: { method: 'get', path: 'temps/t1/series?points=300', body: undefined },
  },
  {
    name: 'temps.deleteById → DELETE temps/:id',
    run: c => c.temps.deleteById('t1'),
    expected: { method: 'delete', path: 'temps/t1', body: undefined },
  },
  // smokeProfile
  {
    name: 'smokeProfile.getCurrent → GET smokeProfile/current',
    run: c => c.smokeProfile.getCurrent(),
    expected: { method: 'get', path: 'smokeProfile/current', body: undefined },
  },
  {
    name: 'smokeProfile.getById → GET smokeProfile/:id',
    run: c => c.smokeProfile.getById('prof-1'),
    expected: { method: 'get', path: 'smokeProfile/prof-1', body: undefined },
  },
  {
    name: 'smokeProfile.saveCurrent → POST smokeProfile/current (DTO-projected body)',
    run: c => c.smokeProfile.saveCurrent(seededProfile as SmokeProfile),
    expected: { method: 'post', path: 'smokeProfile/current', body: projectedProfileBody },
  },
  {
    name: 'smokeProfile.deleteById → DELETE smokeProfile/:id',
    run: c => c.smokeProfile.deleteById('prof-1'),
    expected: { method: 'delete', path: 'smokeProfile/prof-1', body: undefined },
  },
  // preSmoke
  {
    name: 'preSmoke.getCurrent → GET presmoke/',
    run: c => c.preSmoke.getCurrent(),
    expected: { method: 'get', path: 'presmoke/', body: undefined },
  },
  {
    name: 'preSmoke.getById → GET presmoke/:id',
    run: c => c.preSmoke.getById('pre-1'),
    expected: { method: 'get', path: 'presmoke/pre-1', body: undefined },
  },
  {
    name: 'preSmoke.saveCurrent → POST presmoke (DTO-projected body, weight coerced)',
    run: c => c.preSmoke.saveCurrent(seededPreSmoke),
    expected: { method: 'post', path: 'presmoke', body: projectedPreSmokeBody },
  },
  {
    name: 'preSmoke.deleteById → DELETE presmoke/:id',
    run: c => c.preSmoke.deleteById('pre-1'),
    expected: { method: 'delete', path: 'presmoke/pre-1', body: undefined },
  },
  // postSmoke
  {
    name: 'postSmoke.getCurrent → GET postSmoke/current',
    run: c => c.postSmoke.getCurrent(),
    expected: { method: 'get', path: 'postSmoke/current', body: undefined },
  },
  {
    name: 'postSmoke.getById → GET postSmoke/:id',
    run: c => c.postSmoke.getById('post-1'),
    expected: { method: 'get', path: 'postSmoke/post-1', body: undefined },
  },
  {
    name: 'postSmoke.saveCurrent → POST postSmoke/current (DTO-projected body)',
    run: c => c.postSmoke.saveCurrent(seededPostSmoke),
    expected: { method: 'post', path: 'postSmoke/current', body: projectedPostSmokeBody },
  },
  {
    name: 'postSmoke.deleteById → DELETE postSmoke/:id',
    run: c => c.postSmoke.deleteById('post-1'),
    expected: { method: 'delete', path: 'postSmoke/post-1', body: undefined },
  },
  // ratings
  {
    name: 'ratings.getCurrent → GET ratings',
    run: c => c.ratings.getCurrent(),
    expected: { method: 'get', path: 'ratings', body: undefined },
  },
  {
    name: 'ratings.getById → GET ratings/:id',
    run: c => c.ratings.getById('r1'),
    expected: { method: 'get', path: 'ratings/r1', body: undefined },
  },
  {
    name: 'ratings.save (no _id) → POST ratings (create, DTO-projected body)',
    run: c => c.ratings.save(seededRatingNoId),
    expected: { method: 'post', path: 'ratings', body: projectedRatingCreateBody },
  },
  {
    name: 'ratings.save (with _id) → POST ratings/:id (update, DTO-projected body, _id stripped)',
    run: c => c.ratings.save(seededRatingWithId),
    expected: { method: 'post', path: 'ratings/rating-1', body: projectedRatingBody },
  },
  {
    name: 'ratings.deleteById → DELETE ratings/:id',
    run: c => c.ratings.deleteById('r1'),
    expected: { method: 'delete', path: 'ratings/r1', body: undefined },
  },
  // notifications
  {
    name: 'notifications.getSettings → GET appSettings',
    run: c => c.notifications.getSettings(),
    expected: { method: 'get', path: 'appSettings', body: undefined },
  },
  {
    name: 'notifications.saveSettings → POST appSettings (projected body)',
    run: c => c.notifications.saveSettings(seededNotifications),
    expected: {
      method: 'post',
      path: 'appSettings',
      body: projectedNotificationsBody,
    },
  },
  {
    name: 'notifications.saveTargetPresets → POST appSettings (presets block alone)',
    run: c =>
      c.notifications.saveTargetPresets({
        beef: 210,
        pork: 190,
        poultry: 170,
        wrapTemp: 160,
      }),
    expected: {
      method: 'post',
      path: 'appSettings',
      body: { targetPresets: { beef: 210, pork: 190, poultry: 170, wrapTemp: 160 } },
    },
  },
  {
    name: 'notifications.getPublicKey → GET notifications/publicKey',
    run: c => c.notifications.getPublicKey(),
    expected: { method: 'get', path: 'notifications/publicKey', body: undefined },
  },
  {
    name: 'notifications.registerSubscription → POST notifications/subscribe',
    run: c => c.notifications.registerSubscription(seededSubscription),
    expected: {
      method: 'post',
      path: 'notifications/subscribe',
      body: seededSubscription,
    },
  },
  {
    name: 'notifications.sendTest → POST notifications/test',
    run: c => c.notifications.sendTest(),
    expected: { method: 'post', path: 'notifications/test', body: undefined },
  },
  // auto-stop
  {
    name: 'autoStop.get → GET appSettings',
    run: c => c.autoStop.get(),
    expected: { method: 'get', path: 'appSettings', body: undefined },
  },
  {
    name: 'autoStop.save → POST appSettings (auto-stop block alone)',
    run: c => c.autoStop.save({ idleHours: 12 }),
    expected: {
      method: 'post',
      path: 'appSettings',
      body: { autoStop: { idleHours: 12 } },
    },
  },
  // serve plan
  {
    name: 'servePlan.get → GET appSettings',
    run: c => c.servePlan.get(),
    expected: { method: 'get', path: 'appSettings', body: undefined },
  },
  {
    name: 'servePlan.save → POST appSettings (serve-plan block alone)',
    run: c => c.servePlan.save({ enabled: true, driftAlert: false, driftMin: 45 }),
    expected: {
      method: 'post',
      path: 'appSettings',
      body: { servePlan: { enabled: true, driftAlert: false, driftMin: 45 } },
    },
  },
  // state
  {
    name: 'state.get → GET state',
    run: c => c.state.get(),
    expected: { method: 'get', path: 'state', body: undefined },
  },
  {
    name: 'state.toggleSmoking → PUT state/toggleSmoking',
    run: c => c.state.toggleSmoking(),
    expected: { method: 'put', path: 'state/toggleSmoking', body: undefined },
  },
  {
    name: 'state.clearSmoke → PUT state/clearSmoke',
    run: c => c.state.clearSmoke(),
    expected: { method: 'put', path: 'state/clearSmoke', body: undefined },
  },
  // smoke
  {
    name: 'smoke.getById → GET smoke/:id',
    run: c => c.smoke.getById('smoke-1'),
    expected: { method: 'get', path: 'smoke/smoke-1', body: undefined },
  },
  {
    name: 'smoke.getAll → GET smoke/all',
    run: c => c.smoke.getAll(),
    expected: { method: 'get', path: 'smoke/all', body: undefined },
  },
  {
    name: 'smoke.finish → POST smoke/finish',
    run: c => c.smoke.finish(),
    expected: { method: 'post', path: 'smoke/finish', body: undefined },
  },
  {
    // The route is a deep delete, so the client's only smoke delete is the
    // cascade; there is no shallow `deleteById` on this resource.
    name: 'smoke.deleteCascade → DELETE smoke/:id (deep delete)',
    run: c => c.smoke.deleteCascade('smoke-1'),
    expected: { method: 'delete', path: 'smoke/smoke-1', body: undefined },
  },
  // timeline
  {
    name: 'timeline.getById → GET timeline/:id',
    run: c => c.timeline.getById('smoke-1'),
    expected: { method: 'get', path: 'timeline/smoke-1', body: undefined },
  },
  {
    name: 'timeline.getCurrent → GET timeline/current',
    run: c => c.timeline.getCurrent(),
    expected: { method: 'get', path: 'timeline/current', body: undefined },
  },
  // history
  {
    name: 'history.list → GET history',
    run: c => c.history.list(),
    expected: { method: 'get', path: 'history', body: undefined },
  },
  // stats
  {
    name: 'stats.get → GET stats',
    run: c => c.stats.get(),
    expected: { method: 'get', path: 'stats', body: undefined },
  },
];

describe('endpoint-contract table — method + exact legacy path (+ projected write body)', () => {
  test.each(rows)('$name', async ({ run, expected }) => {
    const backend = fullySeededBackend();
    const client = createApiClient(backend);

    await run(client);

    expect(backend.requests).toContainEqual(expected);
  });
});

describe('endpoint-contract table — aggregate operations emit the full path set', () => {
  /**
   * DELETE `smoke/:id` is a deep delete, and there is no shallow one behind it.
   * A second, plainly-named `deleteById` sitting beside the cascade — shallow on
   * all five other resources — would read as the way to drop the parent alone
   * and would quietly take the cook's whole record with it.
   */
  test('the smoke resource offers one delete, and its name says the delete is deep', () => {
    const client = createApiClient(fullySeededBackend());

    const deleteOperations = Object.keys(client.smoke).filter(name =>
      name.toLowerCase().includes('delete')
    );

    expect(deleteOperations).toEqual(['deleteCascade']);
  });

  test('smoke.deleteCascade emits exactly one delete of the parent path', async () => {
    const backend = fullySeededBackend();
    const client = createApiClient(backend);

    await client.smoke.deleteCascade('smoke-1');

    // The cascade is the backend's: one request, at the parent path. No child
    // path is addressed from here any more.
    expect(backend.requests).toEqual([
      { method: 'delete', path: 'smoke/smoke-1', body: undefined },
    ]);
  });

  test('smoke.getReview reads the parent, its five children and the cook timeline at their exact paths', async () => {
    const backend = fullySeededBackend();
    const client = createApiClient(backend);

    await client.smoke.getReview('smoke-1');

    const expectedReads: RecordedRequest[] = [
      { method: 'get', path: 'smoke/smoke-1', body: undefined },
      { method: 'get', path: 'presmoke/pre-1', body: undefined },
      { method: 'get', path: 'smokeProfile/prof-1', body: undefined },
      { method: 'get', path: 'temps/temps-1', body: undefined },
      { method: 'get', path: 'postSmoke/post-1', body: undefined },
      { method: 'get', path: 'ratings/rate-1', body: undefined },
      { method: 'get', path: 'timeline/smoke-1', body: undefined },
    ];
    expectedReads.forEach(req => expect(backend.requests).toContainEqual(req));
    // The parent is always read first.
    expect(backend.requests[0]).toEqual({ method: 'get', path: 'smoke/smoke-1', body: undefined });
  });

  test('smoke.getSummary reads the same paths except the raw temperature log', async () => {
    const backend = fullySeededBackend();
    const client = createApiClient(backend);

    await client.smoke.getSummary('smoke-1');

    expect(backend.requests).toEqual(
      expect.arrayContaining<RecordedRequest>([
        { method: 'get', path: 'smoke/smoke-1', body: undefined },
        { method: 'get', path: 'presmoke/pre-1', body: undefined },
        { method: 'get', path: 'smokeProfile/prof-1', body: undefined },
        { method: 'get', path: 'postSmoke/post-1', body: undefined },
        { method: 'get', path: 'ratings/rate-1', body: undefined },
        { method: 'get', path: 'timeline/smoke-1', body: undefined },
      ])
    );
    expect(backend.requests.map(request => request.path)).not.toContain('temps/temps-1');
  });
});
