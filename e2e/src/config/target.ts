/**
 * Target resolution for the e2e suite.
 *
 * A "target" is where the specs point:
 *   - `hermetic`: the locally composed stack (localhost defaults);
 *   - `deployed`: a dev-cloud environment with no smoker app (every URL from the
 *     environment; runs only the no-temp journeys);
 *   - `virtual-smoker`: the real deployed temp-chain topology — smoker UI +
 *     device-service emulator on the virtual-smoker box, frontend + backend on
 *     dev-cloud (every URL from the environment; runs the temp-chain journey).
 *
 * The Playwright config consumes this so the same specs can run against any
 * target without code changes.
 *
 * Keeping the target decision in one small, pure function makes it
 * unit-testable without booting the compose stack.
 */
import { resolveUrls, type E2eUrls } from './urls.ts';

export type E2eTarget = 'hermetic' | 'deployed' | 'virtual-smoker';

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

function parseTarget(raw: string | undefined): E2eTarget {
  if (raw === 'deployed' || raw === 'virtual-smoker') {
    return raw;
  }
  return 'hermetic';
}

export function resolveTarget(env: NodeJS.ProcessEnv = process.env): ResolvedTarget {
  const target = parseTarget(env.E2E_TARGET);

  if (target !== 'hermetic') {
    // A remote run must never silently fall back to localhost defaults, or a
    // test run (including its cleanup/sweep) could be aimed at the wrong host.
    const missing = DEPLOYED_URL_ENV_VARS.filter(name => !env[name]);
    if (missing.length > 0) {
      throw new Error(
        `E2E_TARGET=${target} requires every service URL to be set; missing: ${missing.join(', ')}`
      );
    }
  }

  return {
    target,
    urls: resolveUrls(env),
  };
}
