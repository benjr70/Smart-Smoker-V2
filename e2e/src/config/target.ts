/**
 * Target resolution for the e2e suite.
 *
 * A "target" is where the specs point: the locally composed `hermetic` stack
 * (localhost defaults) or a `deployed` environment (every URL supplied from the
 * environment). The Playwright config consumes this so the same specs can run
 * against either target without code changes.
 *
 * Keeping the hermetic/deployed decision in one small, pure function makes it
 * unit-testable without booting the compose stack.
 */
import { resolveUrls, type E2eUrls } from './urls.ts';

export type E2eTarget = 'hermetic' | 'deployed';

export interface ResolvedTarget {
  target: E2eTarget;
  urls: E2eUrls;
}

/** Env var that must be set (per service) when targeting a deployed stack. */
const DEPLOYED_URL_ENV_VARS = [
  'E2E_FRONTEND_URL',
  'E2E_SMOKER_URL',
  'E2E_BACKEND_URL',
  'E2E_DEVICE_URL',
] as const;

export function resolveTarget(env: NodeJS.ProcessEnv = process.env): ResolvedTarget {
  const target: E2eTarget = env.E2E_TARGET === 'deployed' ? 'deployed' : 'hermetic';

  if (target === 'deployed') {
    // A deployed run must never silently fall back to localhost defaults, or a
    // test run (including its cleanup/sweep) could be aimed at the wrong host.
    const missing = DEPLOYED_URL_ENV_VARS.filter(name => !env[name]);
    if (missing.length > 0) {
      throw new Error(
        `E2E_TARGET=deployed requires every service URL to be set; missing: ${missing.join(', ')}`
      );
    }
  }

  return {
    target,
    urls: resolveUrls(env),
  };
}
