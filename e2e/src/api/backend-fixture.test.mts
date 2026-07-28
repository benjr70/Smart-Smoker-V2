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
  /**
   * Canned GET responses that advance one step per call and then stay on the
   * last one — for the fixture's polling waits, where the point of the test is
   * that the answer changes between looks.
   */
  getSequences: Record<string, unknown[]> = {};
  /**
   * Transport failures to inject per path: how many consecutive GETs throw
   * before the canned response is served again (`Infinity` = never recovers).
   */
  failGetTimes: Record<string, number> = {};
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
    const failuresLeft = this.failGetTimes[path] ?? 0;
    if (failuresLeft > 0) {
      this.failGetTimes[path] = failuresLeft - 1;
      throw new Error(`GET ${path} failed (503): backend hiccup`);
    }
    const sequence = this.getSequences[path];
    if (sequence?.length) {
      return (sequence.length > 1 ? sequence.shift() : sequence[0]) as T;
    }
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

describe('BackendFixture.adoptCurrentSmoke', () => {
  /** Wire the fake so it answers as a backend holding a UI-created current smoke. */
  const givenUiCreatedCurrentSmoke = (name = `${TEST_ENTITY_PREFIX}full-smoke`) => {
    http.getResponses['/api/state'] = { smokeId: 'smoke-7' };
    http.getResponses['/api/smoke/smoke-7'] = { _id: 'smoke-7', preSmokeId: 'pre-7' };
    http.getResponses['/api/presmoke/pre-7'] = { _id: 'pre-7', name };
    return name;
  };

  it('resolves the ids of the smoke the UI created', async () => {
    const name = givenUiCreatedCurrentSmoke();

    const adopted = await fixture.adoptCurrentSmoke();

    assert.deepEqual(adopted, { smokeId: 'smoke-7', preSmokeId: 'pre-7', name });
  });

  it('registers them so cleanup deletes exactly the UI-created records', async () => {
    givenUiCreatedCurrentSmoke();
    await fixture.adoptCurrentSmoke();
    // By teardown the journey has also produced the linked sub-entities.
    http.getResponses['/api/smoke/smoke-7'] = {
      _id: 'smoke-7',
      preSmokeId: 'pre-7',
      smokeProfileId: 'prof-7',
      tempsId: 'temps-7',
    };

    await fixture.cleanup();

    assert.deepEqual(http.deletes, [
      '/api/presmoke/pre-7',
      '/api/smokeProfile/prof-7',
      '/api/temps/temps-7',
      '/api/smoke/smoke-7',
    ]);
  });

  it('clears the current smoke on cleanup so the next journey starts fresh', async () => {
    // The adopted smoke is still *current*; deleting it without clearing the
    // state would leave every later POST /api/presmoke 404ing on a stale ref.
    givenUiCreatedCurrentSmoke();
    await fixture.adoptCurrentSmoke();

    await fixture.cleanup();

    assert.deepEqual(
      http.puts.map(p => p.path),
      ['/api/state/clearSmoke']
    );
  });

  it('refuses to adopt a current smoke that is not a smoke-test- entity', async () => {
    // Safety net: the fixture may only ever delete prefixed records, so a real
    // in-progress cook can never be adopted into the delete list.
    givenUiCreatedCurrentSmoke('Sunday Brisket');

    await assert.rejects(() => fixture.adoptCurrentSmoke(), /smoke-test-/);

    await fixture.cleanup();
    assert.deepEqual(http.deletes, [], 'a refused adopt must track nothing');
    assert.deepEqual(http.puts, [], 'a real cook must not have its state cleared either');
  });

  it('rides out a transient lookup blip rather than giving up on the run', async () => {
    const name = givenUiCreatedCurrentSmoke();
    http.failGetTimes['/api/smoke/smoke-7'] = 1;
    http.failGetTimes['/api/presmoke/pre-7'] = 1;

    const adopted = await fixture.adoptCurrentSmoke();

    assert.deepEqual(adopted, { smokeId: 'smoke-7', preSmokeId: 'pre-7', name });
  });

  it('reports a failed lookup as a transport failure, not as the prefix refusal', async () => {
    // Misreporting sends whoever reads the CI failure hunting a naming bug.
    givenUiCreatedCurrentSmoke();
    http.failGetTimes['/api/presmoke/pre-7'] = Infinity;

    await assert.rejects(
      () => fixture.adoptCurrentSmoke({ lookupTimeoutMs: 0 }),
      (error: Error) => {
        assert.match(error.message, /GET \/api\/presmoke\/pre-7 failed/);
        assert.doesNotMatch(
          error.message,
          /does not carry the/,
          'a transport failure must not masquerade as the prefix refusal'
        );
        return true;
      }
    );
  });

  it('clears the current smoke on cleanup when a lookup failed, so later specs are not poisoned', async () => {
    // Nothing may be deleted without the prefix proof the lookup never yielded,
    // but leaving the smoke *current* would make every later spec's pre-smoke
    // save update this smoke instead of opening its own.
    givenUiCreatedCurrentSmoke();
    http.failGetTimes['/api/smoke/smoke-7'] = Infinity;
    await assert.rejects(() => fixture.adoptCurrentSmoke({ lookupTimeoutMs: 0 }));

    await fixture.cleanup();

    assert.deepEqual(http.deletes, [], 'an unverified smoke must not be deleted');
    assert.deepEqual(
      http.puts.map(p => p.path),
      ['/api/state/clearSmoke'],
      'the unverified smoke must not be left current'
    );
  });

  it('fails clearly when the current smoke links no pre-smoke to check', async () => {
    http.getResponses['/api/state'] = { smokeId: 'smoke-7' };
    http.getResponses['/api/smoke/smoke-7'] = { _id: 'smoke-7' };

    await assert.rejects(
      () => fixture.adoptCurrentSmoke({ lookupTimeoutMs: 0 }),
      /links no pre-smoke/
    );

    await fixture.cleanup();
    assert.deepEqual(http.deletes, []);
  });

  it('fails with a clear error and tracks nothing when there is no current smoke', async () => {
    await assert.rejects(() => fixture.adoptCurrentSmoke({ timeoutMs: 0 }), /no current smoke/i);

    await fixture.cleanup();
    assert.deepEqual(http.deletes, []);
    assert.deepEqual(http.puts, []);
  });
});

describe('BackendFixture.waitForStoredTemps', () => {
  const reading = { ChamberTemp: 210, MeatTemp: 150, Meat2Temp: 0, Meat3Temp: 0, date: '' };

  it('answers straight away once the backend already holds enough of the cook', async () => {
    http.getResponses['/api/temps'] = [reading, reading];

    assert.equal(await fixture.waitForStoredTemps(2), 2);
  });

  it('keeps polling until enough of the cook has been stored', async () => {
    // The backend stores roughly one reading per eleven relayed frames, so the
    // first look can find a cook that is live on screen but barely written.
    http.getSequences['/api/temps'] = [[], [reading], [reading, reading]];

    assert.equal(await fixture.waitForStoredTemps(2, 5_000), 2);
  });

  it('fails naming what was stored when the cook never reaches the backend', async () => {
    http.getResponses['/api/temps'] = [reading];

    await assert.rejects(() => fixture.waitForStoredTemps(2, 0), /stored 1 of the 2/);
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

  it('heals a dangling current smoke whose pre-smoke was deleted', async () => {
    // A prior crashed run's cleanup deleted the smoke-test-* pre-smoke while it
    // was still current: POST /api/presmoke now 404s until the state is cleared.
    http.getResponses['/api/state'] = { smokeId: 'smoke-9' };
    http.getResponses['/api/smoke/smoke-9'] = {
      _id: 'smoke-9',
      preSmokeId: 'pre-gone', // no canned response — reads as deleted
      tempsId: 'temps-1',
    };

    await fixture.sweep();

    assert.ok(http.deletes.includes('/api/smoke/smoke-9'), 'orphaned smoke must be deleted');
    assert.ok(http.deletes.includes('/api/temps/temps-1'), 'orphan sub-entities must cascade');
    assert.deepEqual(
      http.puts.map(p => p.path),
      ['/api/state/clearSmoke'],
      'state must be cleared so the next pre-smoke save starts fresh'
    );
  });

  it('never touches a live current smoke whose pre-smoke still exists', async () => {
    http.getResponses['/api/state'] = { smokeId: 'smoke-9' };
    http.getResponses['/api/smoke/smoke-9'] = { _id: 'smoke-9', preSmokeId: 'pre-live' };
    http.getResponses['/api/presmoke/pre-live'] = { _id: 'pre-live', name: 'Real Brisket' };

    await fixture.sweep();

    assert.deepEqual(http.deletes, []);
    assert.deepEqual(http.puts, []);
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
