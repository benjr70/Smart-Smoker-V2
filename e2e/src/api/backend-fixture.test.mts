/**
 * Unit tests for the backend API fixture (issue #319, behaviors 2 & 3).
 *
 * The fixture seeds entities over the backend REST API and owns their teardown:
 *   - `cleanup()` deletes exactly the entities the current run created;
 *   - `sweep()` deletes only `smoke-test-*` leftovers from prior failed runs.
 *
 * The HTTP boundary is faked (the only mock — a system boundary), so these run
 * without booting the compose stack. The fake records every request so we can
 * assert precisely what the fixture would delete against a real backend.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { BackendFixture } from './backend-fixture.ts';
import type { HttpTransport } from './http-transport.ts';
import { TEST_ENTITY_PREFIX, isTestEntityName } from './test-entity.ts';

interface PostCall {
  path: string;
  body: Record<string, unknown>;
}

/** In-memory HTTP double that records requests and serves canned GET data. */
class FakeTransport implements HttpTransport {
  readonly posts: PostCall[] = [];
  readonly puts: PostCall[] = [];
  readonly deletes: string[] = [];
  getResponses: Record<string, unknown> = {};
  private seq = 0;

  async post<T>(path: string, body: unknown): Promise<T> {
    const record = body as Record<string, unknown>;
    this.posts.push({ path, body: record });
    return { _id: `id-${++this.seq}`, name: record.name } as T;
  }

  async put<T>(path: string, body: unknown = {}): Promise<T> {
    this.puts.push({ path, body: body as Record<string, unknown> });
    return { _id: `id-${++this.seq}` } as T;
  }

  async get<T>(path: string): Promise<T> {
    return (this.getResponses[path] ?? []) as T;
  }

  async delete(path: string): Promise<void> {
    this.deletes.push(path);
  }
}

let http: FakeTransport;
let fixture: BackendFixture;

beforeEach(() => {
  http = new FakeTransport();
  fixture = new BackendFixture(http);
});

describe('BackendFixture.createPreSmoke', () => {
  it('POSTs a pre-smoke whose name carries the smoke-test- prefix', async () => {
    await fixture.createPreSmoke();

    assert.equal(http.posts.length, 1);
    assert.equal(http.posts[0].path, '/api/presmoke');
    assert.equal(isTestEntityName(http.posts[0].body.name), true);
  });
});

describe('BackendFixture.seedCompletedSmoke', () => {
  it('seeds a prefixed completed smoke through the real lifecycle order', async () => {
    // The pre-smoke POST wires up state.smokeId asynchronously; the fixture
    // blocks on it before the current-smoke writes, so make it available.
    http.getResponses['/api/state'] = { smokeId: 'smoke-1' };

    const seeded = await fixture.seedCompletedSmoke({ label: 'brisket' });

    assert.equal(isTestEntityName(seeded.name), true, 'name must carry the smoke-test- prefix');
    assert.deepEqual(
      http.posts.map(p => p.path),
      [
        '/api/presmoke',
        '/api/smokeProfile/current',
        '/api/postSmoke/current',
        '/api/ratings',
        '/api/smoke/finish',
      ],
      'must POST through the real lifecycle order'
    );
    // Leaves no active smoke behind so the next seed opens a fresh lifecycle.
    assert.deepEqual(
      http.puts.map(p => p.path),
      ['/api/state/clearSmoke']
    );
  });

  it('carries the caller-supplied meat/wood/rest values on the seeded record', async () => {
    http.getResponses['/api/state'] = { smokeId: 'smoke-1' };

    const seeded = await fixture.seedCompletedSmoke({
      meatType: 'Pork Shoulder',
      weightLb: 8,
      woodType: 'Cherry',
      restTime: '01:15',
    });

    assert.equal(seeded.meatType, 'Pork Shoulder');
    assert.equal(seeded.weightLb, 8);
    assert.equal(seeded.woodType, 'Cherry');
    assert.equal(seeded.restTime, '01:15');
    assert.ok(seeded.smokeId, 'must expose the finished smoke id for cleanup');
  });

  it('cleanup() cascade-deletes the whole smoke so no smoke-test-* residue remains', async () => {
    http.getResponses['/api/state'] = { smokeId: 'smoke-1' };
    const seeded = await fixture.seedCompletedSmoke();
    // GET /api/smoke/:id yields the linked sub-entities the frontend deletes.
    http.getResponses[`/api/smoke/${seeded.smokeId}`] = {
      _id: seeded.smokeId,
      preSmokeId: 'pre-1',
      smokeProfileId: 'prof-1',
      tempsId: 'temp-1',
      postSmokeId: 'post-1',
      ratingId: 'rate-1',
    };

    await fixture.cleanup();

    assert.deepEqual(http.deletes, [
      '/api/presmoke/pre-1',
      '/api/smokeProfile/prof-1',
      '/api/temps/temp-1',
      '/api/postSmoke/post-1',
      '/api/ratings/rate-1',
      `/api/smoke/${seeded.smokeId}`,
    ]);
  });
});

describe('BackendFixture.seedNotificationRule', () => {
  it('seeds a prefixed notification message through the settings endpoint', async () => {
    http.getResponses['/api/notifications/settings'] = { settings: [] };

    const message = await fixture.seedNotificationRule();

    assert.equal(isTestEntityName(message), true, 'seeded message must carry the prefix');
    const seedPost = http.posts.find(p => p.path === '/api/notifications/settings');
    assert.ok(seedPost, 'must POST the settings');
    const settings = seedPost!.body.settings as Array<{ message: string }>;
    assert.equal(settings[0].message, message);
  });

  it('cleanup() restores the notification settings captured before seeding', async () => {
    // Settings are global singleton config, not a prefixed entity, so deployed
    // safety comes from restoring whatever was there before the run touched it.
    const prior = [
      { type: false, message: 'Real rule', probe1: 'Chamber', op: '>', probe2: 'Probe 1' },
    ];
    http.getResponses['/api/notifications/settings'] = { settings: prior };

    await fixture.seedNotificationRule();
    await fixture.cleanup();

    const restore = http.posts.filter(p => p.path === '/api/notifications/settings').at(-1);
    assert.deepEqual(
      restore?.body,
      { settings: prior },
      'cleanup must put the prior settings back'
    );
  });
});

describe('BackendFixture.cleanup', () => {
  it('deletes exactly the entities this run created — and nothing else', async () => {
    const a = await fixture.createPreSmoke();
    const b = await fixture.createPreSmoke();

    await fixture.cleanup();

    assert.deepEqual(
      http.deletes.sort(),
      [`/api/presmoke/${a.id}`, `/api/presmoke/${b.id}`].sort()
    );
  });

  it('is idempotent: a second cleanup deletes nothing', async () => {
    await fixture.createPreSmoke();
    await fixture.cleanup();
    const afterFirst = http.deletes.length;

    await fixture.cleanup();

    assert.equal(http.deletes.length, afterFirst);
  });

  it('does not delete anything when the run created nothing', async () => {
    await fixture.cleanup();

    assert.deepEqual(http.deletes, []);
  });
});

describe('BackendFixture.sweep', () => {
  it('deletes only prefixed leftovers and never touches real records', async () => {
    http.getResponses['/api/presmoke/all'] = [
      { _id: 'p1', name: `${TEST_ENTITY_PREFIX}old-brisket` },
      { _id: 'r1', name: 'Real Brisket' }, // real data — must survive
      { _id: 'p2', name: `${TEST_ENTITY_PREFIX}old-ribs` },
      { _id: 'r2', name: 'smoke-test' }, // lookalike, one char short — must survive
      { _id: 'r3', name: '' }, // empty — must survive
      { _id: 'r4' }, // no name — must survive
    ];

    await fixture.sweep();

    assert.deepEqual(http.deletes.sort(), ['/api/presmoke/p1', '/api/presmoke/p2'].sort());
  });

  it('deletes nothing when there are no prefixed leftovers', async () => {
    http.getResponses['/api/presmoke/all'] = [
      { _id: 'r1', name: 'Sunday Ribs' },
      { _id: 'r2', name: 'Monday Pork' },
    ];

    await fixture.sweep();

    assert.deepEqual(http.deletes, []);
  });

  it('strips only smoke-test-* notification rules a crashed run left, keeping real ones', async () => {
    http.getResponses['/api/presmoke/all'] = [];
    http.getResponses['/api/notifications/settings'] = {
      settings: [
        {
          type: false,
          message: 'Real chamber rule',
          probe1: 'Chamber',
          op: '>',
          probe2: 'Probe 1',
        },
        {
          type: false,
          message: `${TEST_ENTITY_PREFIX}leftover`,
          probe1: 'Chamber',
          op: '>',
          probe2: 'Probe 1',
        },
      ],
    };

    await fixture.sweep();

    const reset = http.posts.filter(p => p.path === '/api/notifications/settings').at(-1);
    assert.deepEqual(reset?.body, {
      settings: [
        {
          type: false,
          message: 'Real chamber rule',
          probe1: 'Chamber',
          op: '>',
          probe2: 'Probe 1',
        },
      ],
    });
  });

  it('does not rewrite notification settings when no rule is prefixed', async () => {
    http.getResponses['/api/presmoke/all'] = [];
    http.getResponses['/api/notifications/settings'] = {
      settings: [
        { type: false, message: 'Real rule', probe1: 'Chamber', op: '>', probe2: 'Probe 1' },
      ],
    };

    await fixture.sweep();

    const posts = http.posts.filter(p => p.path === '/api/notifications/settings');
    assert.equal(posts.length, 0, 'must not touch settings that hold only real rules');
  });
});
