/**
 * Playwright global setup: block the run until the composed stack is healthy,
 * then sweep any `smoke-test-*` leftovers a prior crashed run may have left in
 * the backend so each suite starts from clean, test-owned state.
 */
import { BackendFixture } from './api/backend-fixture';
import { sweepPlantedCooks } from './helpers/hermetic-store';
import { defaultHealthTargets, waitForHealthy } from './helpers/wait-for-healthy';

export default async function globalSetup(): Promise<void> {
  await waitForHealthy(defaultHealthTargets());
  // The cooks a repair spec plants straight into the store, reclaimed by the
  // day they are dated to — the readings under them carry no name the prefix
  // net could recognise. Taken out before the fixture's own sweep, so a cook a
  // killed run left behind cannot be read by any journey of this one.
  sweepPlantedCooks();
  await new BackendFixture().sweep();
}
