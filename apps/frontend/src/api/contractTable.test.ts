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
import { createFakeBackend, FakeBackend, RecordedRequest } from './fakeBackend';
import { NotificationSettings, PostSmoke, PreSmoke, Smoke, SmokeProfile, rating } from './types';
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

const seededNotifications: NotificationSettings[] = [
  {
    type: true,
    message: 'chamber hot',
    probe1: 'ChamberTemp',
    op: '>',
    probe2: undefined,
    offset: undefined,
    temperature: 275,
  },
];

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
    notifications: { settings: seededNotifications },
    state: { smokeId: 'smoke-1', smoking: false },
    smoke: {
      records: { 'smoke-1': seededSmoke },
      all: [seededSmoke],
      finish: seededSmoke,
    },
    history: [],
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

const projectedNotificationsBody = {
  settings: [
    {
      type: true,
      message: 'chamber hot',
      probe1: 'ChamberTemp',
      op: '>',
      probe2: undefined,
      offset: undefined,
      temperature: 275,
    },
  ],
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
    name: 'notifications.getSettings → GET notifications/settings',
    run: c => c.notifications.getSettings(),
    expected: { method: 'get', path: 'notifications/settings', body: undefined },
  },
  {
    name: 'notifications.saveSettings → POST notifications/settings (projected, enveloped body)',
    run: c => c.notifications.saveSettings({ settings: seededNotifications }),
    expected: {
      method: 'post',
      path: 'notifications/settings',
      body: projectedNotificationsBody,
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
    name: 'smoke.deleteById → DELETE smoke/:id',
    run: c => c.smoke.deleteById('smoke-1'),
    expected: { method: 'delete', path: 'smoke/smoke-1', body: undefined },
  },
  // history
  {
    name: 'history.list → GET history',
    run: c => c.history.list(),
    expected: { method: 'get', path: 'history', body: undefined },
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

describe('endpoint-contract table — aggregate operations emit the full ordered path set', () => {
  test('smoke.deleteCascade emits the parent read, five child deletes, then the parent delete last', async () => {
    const backend = fullySeededBackend();
    const client = createApiClient(backend);

    await client.smoke.deleteCascade('smoke-1');

    // Parent is read first so a missing parent throws before any delete.
    expect(backend.requests[0]).toEqual({ method: 'get', path: 'smoke/smoke-1', body: undefined });
    // All five children are deleted at their exact legacy paths.
    const childDeletes: RecordedRequest[] = [
      { method: 'delete', path: 'presmoke/pre-1', body: undefined },
      { method: 'delete', path: 'smokeProfile/prof-1', body: undefined },
      { method: 'delete', path: 'temps/temps-1', body: undefined },
      { method: 'delete', path: 'postSmoke/post-1', body: undefined },
      { method: 'delete', path: 'ratings/rate-1', body: undefined },
    ];
    childDeletes.forEach(req => expect(backend.requests).toContainEqual(req));
    // Parent delete is emitted last so a partial cascade never orphans children.
    expect(backend.requests[backend.requests.length - 1]).toEqual({
      method: 'delete',
      path: 'smoke/smoke-1',
      body: undefined,
    });
  });

  test('smoke.getReview reads the parent then all five children at their exact legacy paths', async () => {
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
    ];
    expectedReads.forEach(req => expect(backend.requests).toContainEqual(req));
    // The parent is always read first.
    expect(backend.requests[0]).toEqual({ method: 'get', path: 'smoke/smoke-1', body: undefined });
  });
});
