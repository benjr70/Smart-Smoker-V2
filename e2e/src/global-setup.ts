/**
 * Playwright global setup: block the run until the composed stack is healthy,
 * then sweep any `smoke-test-*` leftovers a prior crashed run may have left in
 * the backend so each suite starts from clean, test-owned state.
 */
import { BackendFixture } from './api/backend-fixture';
import { defaultHealthTargets, waitForHealthy } from './helpers/wait-for-healthy';

export default async function globalSetup(): Promise<void> {
  await waitForHealthy(defaultHealthTargets());
  await new BackendFixture().sweep();
}
