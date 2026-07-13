/**
 * Unit tests for health-wait — the bounded readiness poll `up` blocks on.
 * fetch + clock are injected so no docker or real time is needed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { healthTargets, waitForHealthy, type HealthTarget } from './health-wait.ts';
import { computeStackConfig } from './stack-config.ts';

describe('healthTargets', () => {
  it('probes /api/health on backend + device and / on the web apps', () => {
    const config = computeStackConfig(328);
    const targets = healthTargets(config);
    const byName = new Map(targets.map(t => [t.name, t.url]));
    assert.equal(byName.get('backend'), `http://localhost:${config.ports.backend}/api/health`);
    assert.equal(
      byName.get('device-service'),
      `http://localhost:${config.ports.device}/api/health`
    );
    assert.equal(byName.get('frontend'), `http://localhost:${config.ports.frontend}/`);
    assert.equal(byName.get('smoker'), `http://localhost:${config.ports.smoker}/`);
  });
});

describe('waitForHealthy', () => {
  const targets: HealthTarget[] = [
    { name: 'a', url: 'http://localhost:1/' },
    { name: 'b', url: 'http://localhost:2/' },
  ];

  it('resolves once every target answers with an accepted status', async () => {
    const fetchImpl = (async () => ({ status: 200 })) as unknown as typeof fetch;
    await waitForHealthy(targets, {
      fetchImpl,
      timeoutMs: 1000,
      intervalMs: 1,
      log: () => undefined,
    });
  });

  it('keeps polling until a slow target comes up', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return { status: calls > 3 ? 200 : 500 };
    }) as unknown as typeof fetch;
    await waitForHealthy([targets[0]], {
      fetchImpl,
      timeoutMs: 1000,
      intervalMs: 1,
      log: () => undefined,
    });
    assert.ok(calls >= 4);
  });

  it('rejects with the still-pending targets after the timeout', async () => {
    const fetchImpl = (async () => {
      throw new Error('connection refused');
    }) as unknown as typeof fetch;
    await assert.rejects(
      () =>
        waitForHealthy(targets, { fetchImpl, timeoutMs: 20, intervalMs: 5, log: () => undefined }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /a|b/);
        return true;
      }
    );
  });
});
