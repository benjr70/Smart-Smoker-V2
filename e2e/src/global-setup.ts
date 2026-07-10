/**
 * Playwright global setup: block the run until the composed stack is healthy.
 * The compose file owns container start-ordering via healthchecks; this owns
 * the "don't start testing until the app actually answers" gate.
 */
import { defaultHealthTargets, waitForHealthy } from './helpers/wait-for-healthy';

export default async function globalSetup(): Promise<void> {
  await waitForHealthy(defaultHealthTargets());
}
