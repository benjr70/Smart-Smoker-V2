/**
 * Unit tests for the health preflight (issue #321, behavior 3).
 *
 * The suite's global setup preflights every service before any spec runs. When
 * a deployed target (e.g. an unreachable virtual-smoker box over the tailnet) is
 * down, the run must fail as a *connectivity* problem that names the offending
 * services — never as a misleading in-spec assertion. These tests pin that
 * contract with an injected fetch, so no network or compose stack is needed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { waitForHealthy, type HealthTarget } from './wait-for-healthy.ts';

const silent = () => {};

describe('waitForHealthy connectivity classification', () => {
  it('resolves once every target answers healthy', async () => {
    const targets: HealthTarget[] = [
      { name: 'backend', url: 'http://box/api/health' },
      { name: 'smoker', url: 'http://box:8080/' },
    ];
    const fetchImpl = (async () => ({ status: 200 })) as unknown as typeof fetch;

    await assert.doesNotReject(waitForHealthy(targets, { fetchImpl, intervalMs: 1, log: silent }));
  });

  it('throws a connectivity-classified error naming the unreachable services', async () => {
    const targets: HealthTarget[] = [
      { name: 'smoker', url: 'http://virtual-smoker:8080/' },
      { name: 'device-service', url: 'http://virtual-smoker:3003/api/health' },
    ];
    // Box is off the tailnet: every probe rejects.
    const fetchImpl = (async () => {
      throw new Error('ENOTFOUND');
    }) as unknown as typeof fetch;

    await assert.rejects(
      waitForHealthy(targets, { fetchImpl, timeoutMs: 5, intervalMs: 1, log: silent }),
      (err: Error) => {
        // Classified as a connectivity/reachability failure, distinct from a
        // Playwright expect() assertion.
        assert.match(err.message, /connectivity|unreachable|reach/i);
        // Names the specific services so the workflow log points at the box.
        assert.match(err.message, /smoker/);
        assert.match(err.message, /device-service/);
        return true;
      }
    );
  });
});
