/**
 * Unit tests for the FetchTransport edge (issue #320 CI fix).
 *
 * The seed path POSTs to a handful of backend endpoints and ignores most of the
 * responses. One of them — the ratings save-current update branch — answers a
 * 2xx with an empty body, which made `post` throw "Unexpected end of JSON input"
 * on `res.json()`. These tests pin the empty-body tolerance (mirroring `put`)
 * without booting the compose stack: the only fake is global `fetch`, the
 * system boundary the transport talks through.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { FetchTransport } from './http-transport.ts';

const realFetch = globalThis.fetch;

interface FakeOpts {
  ok?: boolean;
  status?: number;
  body?: string;
}

function fakeResponse({ ok = true, status = 201, body = '' }: FakeOpts): Response {
  return {
    ok,
    status,
    async json() {
      if (body === '') {
        throw new SyntaxError('Unexpected end of JSON input');
      }
      return JSON.parse(body);
    },
    async text() {
      return body;
    },
  } as unknown as Response;
}

let nextResponse: Response;

beforeEach(() => {
  nextResponse = fakeResponse({});
  globalThis.fetch = (async () => nextResponse) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('FetchTransport.post', () => {
  it('tolerates an empty 2xx body instead of throwing on JSON.parse', async () => {
    nextResponse = fakeResponse({ ok: true, status: 201, body: '' });
    const http = new FetchTransport('http://backend');

    const result = await http.post('/api/ratings', { overallTaste: 9 });

    assert.deepEqual(result, {});
  });

  it('parses a non-empty JSON body', async () => {
    nextResponse = fakeResponse({ ok: true, status: 201, body: '{"_id":"abc"}' });
    const http = new FetchTransport('http://backend');

    const result = await http.post<{ _id: string }>('/api/presmoke', {});

    assert.equal(result._id, 'abc');
  });

  it('throws with the status and text on a non-2xx response', async () => {
    nextResponse = fakeResponse({ ok: false, status: 400, body: 'bad payload' });
    const http = new FetchTransport('http://backend');

    await assert.rejects(http.post('/api/presmoke', {}), /400.*bad payload/);
  });
});
