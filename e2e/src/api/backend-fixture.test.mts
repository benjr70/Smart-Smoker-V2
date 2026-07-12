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
  readonly deletes: string[] = [];
  getResponses: Record<string, unknown> = {};
  private seq = 0;

  async post<T>(path: string, body: unknown): Promise<T> {
    const record = body as Record<string, unknown>;
    this.posts.push({ path, body: record });
    return { _id: `id-${++this.seq}`, name: record.name } as T;
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
});
