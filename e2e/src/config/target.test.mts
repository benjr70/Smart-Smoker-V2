/**
 * Unit tests for e2e target resolution (issue #319, behavior 4).
 *
 * Runs under `node --test` with native type-stripping — no compose stack, no
 * network. `resolveTarget` maps environment input to a hermetic-vs-deployed
 * target and its base URLs; these tests pin the three cases called out in the
 * acceptance criteria: hermetic defaults, env-var overrides, and deployed
 * target selection.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTarget } from './target.ts';

const DEPLOYED_ENV = {
  E2E_TARGET: 'deployed',
  E2E_FRONTEND_URL: 'https://smoke.example.com',
  E2E_SMOKER_URL: 'https://smoker.example.com',
  E2E_BACKEND_URL: 'https://api.example.com',
  E2E_DEVICE_URL: 'https://device.example.com',
} satisfies NodeJS.ProcessEnv;

/**
 * The virtual-smoker target aims the temp-chain journey at the real deployed
 * topology: the smoker UI + device-service emulator live on the virtual-smoker
 * box, while the frontend + backend are the dev-cloud stack the box's smoker
 * image is built to write to.
 */
const VIRTUAL_SMOKER_ENV = {
  E2E_TARGET: 'virtual-smoker',
  E2E_FRONTEND_URL: 'https://dev-cloud.example.com',
  E2E_SMOKER_URL: 'http://virtual-smoker.example.com:8080',
  E2E_BACKEND_URL: 'https://dev-cloud.example.com:8443',
  E2E_DEVICE_URL: 'http://virtual-smoker.example.com:3003',
} satisfies NodeJS.ProcessEnv;

describe('resolveTarget', () => {
  it('defaults to the hermetic target with localhost URLs when env is empty', () => {
    const resolved = resolveTarget({});

    assert.equal(resolved.target, 'hermetic');
    assert.equal(resolved.urls.frontend, 'http://localhost:3000');
    assert.equal(resolved.urls.smoker, 'http://localhost:8080');
    assert.equal(resolved.urls.backend, 'http://localhost:3001');
    assert.equal(resolved.urls.device, 'http://localhost:3003');
  });

  it('honours per-service env overrides while staying on the hermetic target', () => {
    const resolved = resolveTarget({
      E2E_FRONTEND_URL: 'http://127.0.0.1:4000/',
      E2E_BACKEND_URL: 'http://127.0.0.1:4001',
    });

    assert.equal(resolved.target, 'hermetic');
    // overridden (trailing slash trimmed)
    assert.equal(resolved.urls.frontend, 'http://127.0.0.1:4000');
    assert.equal(resolved.urls.backend, 'http://127.0.0.1:4001');
    // untouched services still fall back to the hermetic defaults
    assert.equal(resolved.urls.smoker, 'http://localhost:8080');
    assert.equal(resolved.urls.device, 'http://localhost:3003');
  });

  it('selects the deployed target and uses the supplied URLs', () => {
    const resolved = resolveTarget(DEPLOYED_ENV);

    assert.equal(resolved.target, 'deployed');
    assert.equal(resolved.urls.frontend, 'https://smoke.example.com');
    assert.equal(resolved.urls.smoker, 'https://smoker.example.com');
    assert.equal(resolved.urls.backend, 'https://api.example.com');
    assert.equal(resolved.urls.device, 'https://device.example.com');
  });

  it('refuses a deployed target that is missing a service URL (never falls back to localhost)', () => {
    const { E2E_BACKEND_URL: _omitted, ...missingBackend } = DEPLOYED_ENV;

    assert.throws(() => resolveTarget(missingBackend), /E2E_BACKEND_URL/);
  });

  it('selects the virtual-smoker target and uses the supplied box + dev-cloud URLs', () => {
    const resolved = resolveTarget(VIRTUAL_SMOKER_ENV);

    assert.equal(resolved.target, 'virtual-smoker');
    // Frontend + backend are the dev-cloud stack.
    assert.equal(resolved.urls.frontend, 'https://dev-cloud.example.com');
    assert.equal(resolved.urls.backend, 'https://dev-cloud.example.com:8443');
    // Smoker UI + device-service emulator live on the box.
    assert.equal(resolved.urls.smoker, 'http://virtual-smoker.example.com:8080');
    assert.equal(resolved.urls.device, 'http://virtual-smoker.example.com:3003');
  });

  it('refuses a virtual-smoker target that is missing a service URL (never falls back to localhost)', () => {
    const { E2E_SMOKER_URL: _omitted, ...missingSmoker } = VIRTUAL_SMOKER_ENV;

    assert.throws(() => resolveTarget(missingSmoker), /E2E_SMOKER_URL/);
  });
});
