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

/**
 * The 404 the deployed backend answers a pre-smoke save with while the current
 * smoke references a pre-smoke document that no longer exists — the exact
 * poison a crashed run leaves behind (issue #438).
 */
const STALE_REFERENCE_404 =
  'POST /api/presmoke failed (404): {"statusCode":404,"error":"NOT_FOUND",' +
  '"message":"PreSmoke 6a6e724286717d230c98162a not found","path":"/api/presmoke"}';

/**
 * The 404 `GET /api/presmoke/:id` answers with for a document that is really
 * gone (the backend's `getByIdOrThrow`) — the only answer that proves a current
 * smoke is orphaned rather than merely unreadable.
 */
const missing404 = (path: string) =>
  `GET ${path} failed (404): {"statusCode":404,"error":"NOT_FOUND",` +
  `"message":"PreSmoke not found","path":"${path}"}`;

/** In-memory HTTP double that records requests and serves canned GET data. */
class FakeTransport implements HttpTransport {
  readonly posts: PostCall[] = [];
  readonly puts: PostCall[] = [];
  readonly deletes: string[] = [];
  /**
   * Every request in order, as `METHOD path`. The per-verb logs above cannot
   * show that a heal happened *between* a failed save and its retry.
   */
  readonly calls: string[] = [];
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
  /**
   * What an injected GET failure throws, per path. Defaults to a 5xx blip,
   * because that is the failure most tests want; a test that is reproducing a
   * document which is genuinely *gone* has to say so with a 404, since the two
   * are exactly what the heal must tell apart.
   */
  getFailures: Record<string, string> = {};
  /**
   * The same, for POSTs: how many consecutive POSTs to a path throw before the
   * request is recorded normally (`Infinity` = never recovers). Each failure
   * throws the next of `postFailures`, so a test says which failure it is
   * reproducing — and can make a retry fail differently from the save it
   * retried, which is what the "healing did not fix it" case turns on.
   */
  failPostTimes: Record<string, number> = {};
  /**
   * The errors injected POST failures throw, advancing one step per failure and
   * then staying on the last — so a test can make a retry fail *differently*
   * from the save it retried.
   */
  postFailures: string[] = [STALE_REFERENCE_404];
  private seq = 0;

  async post<T>(path: string, body: unknown): Promise<T> {
    this.calls.push(`POST ${path}`);
    const failuresLeft = this.failPostTimes[path] ?? 0;
    if (failuresLeft > 0) {
      this.failPostTimes[path] = failuresLeft - 1;
      throw new Error(
        this.postFailures.length > 1 ? this.postFailures.shift()! : this.postFailures[0]
      );
    }
    const record = body as Record<string, unknown>;
    this.posts.push({ path, body: record });
    const doc = { _id: `id-${++this.seq}`, name: record.name };
    if (path === '/api/presmoke') {
      // Mirror the backend: saving a pre-smoke opens a smoke and makes it the
      // current one — which is why a healed state does not stay empty.
      this.getResponses['/api/state'] = { smokeId: `smoke-of-${doc._id}`, smoking: true };
    }
    return doc as T;
  }

  async put<T>(path: string, body: unknown = {}): Promise<T> {
    this.calls.push(`PUT ${path}`);
    this.puts.push({ path, body: body as Record<string, unknown> });
    if (path === '/api/state/clearSmoke') {
      // Mirror the backend: clearing the current smoke is what makes the state
      // stop pointing at the smoke whose pre-smoke was deleted.
      this.getResponses['/api/state'] = { smokeId: '', smoking: false };
    }
    return { _id: `id-${++this.seq}` } as T;
  }

  async get<T>(path: string): Promise<T> {
    this.calls.push(`GET ${path}`);
    const failuresLeft = this.failGetTimes[path] ?? 0;
    if (failuresLeft > 0) {
      this.failGetTimes[path] = failuresLeft - 1;
      throw new Error(this.getFailures[path] ?? `GET ${path} failed (503): backend hiccup`);
    }
    const sequence = this.getSequences[path];
    if (sequence?.length) {
      return (sequence.length > 1 ? sequence.shift() : sequence[0]) as T;
    }
    return (this.getResponses[path] ?? []) as T;
  }

  async delete(path: string): Promise<void> {
    this.calls.push(`DELETE ${path}`);
    this.deletes.push(path);
  }
}

let http: FakeTransport;
let fixture: BackendFixture;

beforeEach(() => {
  http = new FakeTransport();
  fixture = new BackendFixture(http);
});

/**
 * Wire the fake as a backend a crashed run poisoned: the state still holds an
 * in-progress smoke, but the pre-smoke that smoke links was deleted, so every
 * `POST /api/presmoke` 404s on the stale reference until the state is cleared.
 * `failPostTimes` says how many saves 404 before the backend accepts one again.
 */
const givenPoisonedCurrentSmoke = (failedSaves = 1) => {
  http.getResponses['/api/state'] = { smokeId: 'smoke-crashed', smoking: true };
  http.getResponses['/api/smoke/smoke-crashed'] = {
    _id: 'smoke-crashed',
    preSmokeId: 'pre-gone',
    tempsId: 'temps-crashed',
  };
  // The crashed run deleted that pre-smoke, so reading it fails the way the
  // backend fails a document that is really gone: 404, not a transport blip.
  http.failGetTimes['/api/presmoke/pre-gone'] = Infinity;
  http.getFailures['/api/presmoke/pre-gone'] = missing404('/api/presmoke/pre-gone');
  http.failPostTimes['/api/presmoke'] = failedSaves;
};

/** Wire the fake as a backend running somebody's real, intact cook. */
const givenLiveCurrentSmoke = () => {
  http.getResponses['/api/state'] = { smokeId: 'smoke-live', smoking: true };
  http.getResponses['/api/smoke/smoke-live'] = { _id: 'smoke-live', preSmokeId: 'pre-live' };
  http.getResponses['/api/presmoke/pre-live'] = { _id: 'pre-live', name: 'Sunday Brisket' };
};

describe('BackendFixture.createPreSmoke', () => {
  it('POSTs a pre-smoke whose name carries the smoke-test- prefix', async () => {
    await fixture.createPreSmoke();

    assert.equal(http.posts.length, 1);
    assert.equal(http.posts[0].path, '/api/presmoke');
    assert.equal(isTestEntityName(http.posts[0].body.name), true);
  });

  it('heals the current smoke a crashed run left dangling, then saves', async () => {
    // Without this, every spec of every later run dies here: the state points
    // at a smoke whose pre-smoke was deleted, and the save 404s on it forever.
    givenPoisonedCurrentSmoke();

    const seeded = await fixture.createPreSmoke();

    assert.ok(seeded.id, 'the save must succeed once the poison is cleared');
    assert.deepEqual(
      http.calls.filter(call => call.endsWith('/api/presmoke') || call.endsWith('/clearSmoke')),
      ['POST /api/presmoke', 'PUT /api/state/clearSmoke', 'POST /api/presmoke'],
      'the heal must happen between the failed save and its one retry'
    );
    assert.ok(
      http.deletes.includes('/api/smoke/smoke-crashed'),
      'the orphaned smoke must be reclaimed, not just unlinked'
    );
  });

  it('lets a 404 from any other cause fail the run rather than healing over it', async () => {
    // The heal deletes a smoke and clears the state. Doing that on the strength
    // of a 404 it cannot account for would destroy evidence of a real bug — the
    // failure this whole fix exists to stop masking.
    givenPoisonedCurrentSmoke(Infinity);
    http.postFailures = [
      'POST /api/presmoke failed (404): {"statusCode":404,"error":"NOT_FOUND",' +
        '"message":"Smoke not found","path":"/api/presmoke"}',
    ];

    await assert.rejects(() => fixture.createPreSmoke(), /Smoke not found/);

    assert.deepEqual(
      http.calls.filter(call => call.endsWith('/api/presmoke')),
      ['POST /api/presmoke'],
      'an unexplained failure must not be retried'
    );
    assert.deepEqual(http.puts, [], "and must not clear anyone else's current smoke");
  });

  it('surfaces the original failure, once, when healing does not fix the save', async () => {
    // The heal is a hypothesis. When it turns out to be wrong the run must fail
    // on the failure it actually started with — not on the retry's echo of it,
    // and not by healing and retrying round and round.
    givenPoisonedCurrentSmoke(Infinity);
    http.postFailures = [STALE_REFERENCE_404, 'POST /api/presmoke failed (503): backend down'];

    await assert.rejects(() => fixture.createPreSmoke(), /PreSmoke 6a6e724286717d230c98162a not/);

    assert.deepEqual(
      http.calls.filter(call => call.endsWith('/api/presmoke') || call.endsWith('/clearSmoke')),
      ['POST /api/presmoke', 'PUT /api/state/clearSmoke', 'POST /api/presmoke'],
      'exactly one heal and one retry, then give up'
    );
  });

  it('never destroys a real in-progress smoke it merely could not read', async () => {
    // Same live cook, but the read that would have vouched for it blips. An
    // unreadable pre-smoke is not a deleted one, so the save must fail on its
    // own 404 rather than clearing the way by deleting somebody's cook.
    givenLiveCurrentSmoke();
    http.failGetTimes['/api/presmoke/pre-live'] = Infinity;
    http.failPostTimes['/api/presmoke'] = Infinity;

    await assert.rejects(() => fixture.createPreSmoke(), /PreSmoke 6a6e724286717d230c98162a not/);

    assert.deepEqual(http.deletes, [], "a live cook's records must survive a blip");
    assert.deepEqual(http.puts, [], 'and it must stay the current smoke');
  });

  it('never destroys a real in-progress smoke to make its own save work', async () => {
    // The stale-reference 404 can also be answered while somebody's cook is
    // genuinely running. Its pre-smoke still exists, so there is nothing to
    // heal and nothing of theirs may be deleted.
    givenLiveCurrentSmoke();
    http.failPostTimes['/api/presmoke'] = Infinity;

    await assert.rejects(() => fixture.createPreSmoke(), /PreSmoke 6a6e724286717d230c98162a not/);

    assert.deepEqual(http.deletes, [], "a live cook's records must survive");
    assert.deepEqual(http.puts, [], 'and it must stay the current smoke');
  });
});

describe('BackendFixture.clearDanglingCurrentSmoke', () => {
  it('leaves a live current smoke alone and reports that it healed nothing', async () => {
    givenLiveCurrentSmoke();

    assert.equal(await fixture.clearDanglingCurrentSmoke(), false);

    assert.deepEqual(http.deletes, []);
    assert.deepEqual(await http.get('/api/state'), { smokeId: 'smoke-live', smoking: true });
  });

  it('refuses to heal on a pre-smoke read that only blipped', async () => {
    // The deployed projects share dev-cloud over a flaky tailnet link, so a
    // 502/timeout on this read is ordinary — and it is *not* evidence that the
    // document is gone. Reading it as such would cascade-delete somebody's live
    // cook, which no prefix check on this path would catch.
    givenLiveCurrentSmoke();
    http.failGetTimes['/api/presmoke/pre-live'] = Infinity;

    assert.equal(await fixture.clearDanglingCurrentSmoke(), false);

    assert.deepEqual(http.deletes, [], 'an unreadable pre-smoke proves nothing');
    assert.deepEqual(http.puts, [], 'and its smoke must stay current');
  });

  it('is a harmless no-op when there is no current smoke at all', async () => {
    http.getResponses['/api/state'] = { smokeId: '', smoking: false };

    assert.equal(await fixture.clearDanglingCurrentSmoke(), false);

    assert.deepEqual(http.deletes, []);
    assert.deepEqual(http.puts, []);
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
      // The cook is a run of readings down one route; collapsed to a single
      // entry here so this stays an assertion about the lifecycle order rather
      // than about how many readings a seeded cook happens to carry.
      http.posts
        .map(p => p.path)
        .filter((path, at, paths) => path !== '/api/temps' || paths[at - 1] !== '/api/temps'),
      [
        '/api/presmoke',
        '/api/smokeProfile/current',
        '/api/temps',
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

  it('stores a cook on the seeded smoke, so its review has a chart to draw', async () => {
    http.getResponses['/api/state'] = { smokeId: 'smoke-1' };

    await fixture.seedCompletedSmoke();

    const readings = http.posts.filter(p => p.path === '/api/temps');
    assert.ok(readings.length > 1, 'a cook is a series, not a single reading');
    // Readings go over the wire as strings, because that is what the backend's
    // temps DTO accepts and what it stores; a seed that posted numbers would be
    // rejected, and a review chart drawn from a fiction proves nothing.
    readings.forEach(reading =>
      assert.equal(
        typeof reading.body.ChamberTemp,
        'string',
        'temperatures are strings on the wire'
      )
    );
    // Each reading is posted before the smoke is finished — a finished smoke is
    // no longer current, and the temps route only ever writes to the current one.
    assert.ok(
      http.calls.indexOf('POST /api/temps') < http.calls.indexOf('POST /api/smoke/finish'),
      'the cook must be recorded while the smoke is still the current one'
    );
  });

  it('heals the current smoke a crashed run left dangling, then seeds', async () => {
    // This is the fixture-setup path most specs open with, so the poison a
    // crashed worker leaves has to be survivable here above all — there is no
    // intervening cleanup() to heal it mid-run.
    givenPoisonedCurrentSmoke();

    const seeded = await fixture.seedCompletedSmoke();

    assert.ok(seeded.smokeId, 'the seed must complete once the poison is cleared');
    assert.deepEqual(
      http.calls.filter(call => call.endsWith('/api/presmoke') || call.endsWith('/clearSmoke')),
      [
        'POST /api/presmoke',
        'PUT /api/state/clearSmoke',
        'POST /api/presmoke',
        // ...and the seed's own clear, once the finished smoke is archived.
        'PUT /api/state/clearSmoke',
      ],
      'the heal must happen between the failed save and its one retry'
    );
    assert.ok(
      http.deletes.includes('/api/smoke/smoke-crashed'),
      'the orphaned smoke must be reclaimed, not just unlinked'
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

  it('writes the caller-supplied prep and wrap-up steps, so two seeded cooks can differ', async () => {
    // The comparison journey is the caller that needs this: a step diff between
    // two cooks that both logged the fixture's empty step is a diff of nothing.
    http.getResponses['/api/state'] = { smokeId: 'smoke-1' };

    await fixture.seedCompletedSmoke({
      steps: ['Trim the fat cap', 'Dry brine overnight'],
      postSmokeSteps: ['Rest in a dry cooler'],
    });

    const preSmoke = http.posts.find(p => p.path === '/api/presmoke');
    assert.deepEqual(preSmoke?.body.steps, ['Trim the fat cap', 'Dry brine overnight']);
    const postSmoke = http.posts.find(p => p.path === '/api/postSmoke/current');
    assert.deepEqual(postSmoke?.body.steps, ['Rest in a dry cooler']);
  });

  it('stamps the cook log while the smoke is still the current one', async () => {
    http.getResponses['/api/state'] = { smokeId: 'smoke-1' };

    await fixture.seedCompletedSmoke({ stamps: ['wood', 'wrap'] });

    assert.deepEqual(
      http.posts.filter(p => p.path === '/api/cook-events').map(p => p.body),
      [{ stampKey: 'wood' }, { stampKey: 'wrap' }],
      'a stamp is a tap: the key is the whole body the backend accepts'
    );
    // The cook-events route logs against the *current* smoke, so a stamp posted
    // after the finish would be recorded against nothing (409) or against
    // whatever cook is set up next.
    assert.ok(
      http.calls.lastIndexOf('POST /api/cook-events') <
        http.calls.indexOf('POST /api/smoke/finish'),
      'stamps must be recorded before the smoke is archived'
    );
    // ...and after the cook, so each stamp snapshots a pit that has reported.
    assert.ok(
      http.calls.indexOf('POST /api/cook-events') > http.calls.lastIndexOf('POST /api/temps'),
      'stamps must be recorded once the cook has readings to snapshot'
    );
  });

  it('leaves the cook log alone for a seed that asked for no stamps', async () => {
    http.getResponses['/api/state'] = { smokeId: 'smoke-1' };

    await fixture.seedCompletedSmoke();

    assert.deepEqual(
      http.posts.filter(p => p.path === '/api/cook-events'),
      [],
      'an unstamped cook must stay unstamped'
    );
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

  it('deletes the post-smoke and rating the journey linked after the adopt', async () => {
    // Adopt happens early, when the journey has only its pre-smoke — but cleanup
    // re-reads the smoke at teardown, so the children linked later are reclaimed
    // too. That is what leaves nothing behind once a journey has run to the end
    // and archived its smoke: finishing marks the *same* document Complete
    // rather than creating a new one, so the adopted id is still the right one.
    // (`status` is carried here because it is what teardown really sees; the
    // cleanup path never reads it.)
    givenUiCreatedCurrentSmoke();
    await fixture.adoptCurrentSmoke();
    http.getResponses['/api/smoke/smoke-7'] = {
      _id: 'smoke-7',
      status: 'Complete',
      preSmokeId: 'pre-7',
      smokeProfileId: 'prof-7',
      tempsId: 'temps-7',
      postSmokeId: 'post-7',
      ratingId: 'rate-7',
    };

    await fixture.cleanup();

    assert.deepEqual(http.deletes, [
      '/api/presmoke/pre-7',
      '/api/smokeProfile/prof-7',
      '/api/temps/temps-7',
      '/api/postSmoke/post-7',
      '/api/ratings/rate-7',
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

  it('leaves a live current smoke alone when its pre-smoke read blips at teardown', async () => {
    // Teardown runs after every spec on the shared deployed backend, where a
    // real cook can be current and the tailnet link is flaky. Healing on a blip
    // here would cascade-delete that cook — with no prefix check anywhere on
    // the path to stop it — for a run that never touched it.
    givenLiveCurrentSmoke();
    http.failGetTimes['/api/presmoke/pre-live'] = Infinity;

    await fixture.cleanup();

    assert.deepEqual(http.deletes, [], 'a run must not delete a cook it cannot even read');
    assert.deepEqual(
      await http.get('/api/state'),
      { smokeId: 'smoke-live', smoking: true },
      'and must leave the live cook current'
    );
  });

  it('heals a dangling current smoke on the way out, not just on the way in', async () => {
    // A suite that finishes must not hand the poison to the next one: the sweep
    // that heals runs at suite *start*, which is far too late for the run that
    // has already failed on it.
    givenPoisonedCurrentSmoke(0);

    await fixture.cleanup();

    assert.deepEqual(
      await http.get('/api/state'),
      { smokeId: '', smoking: false },
      'the run must leave no smoke current behind it'
    );
    assert.ok(
      http.deletes.includes('/api/smoke/smoke-crashed'),
      'the orphaned smoke must be reclaimed too'
    );
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
