/**
 * Playwright project selection for a resolved e2e target.
 *
 * A "target" (see `target.ts`) decides where the specs point and, now, which
 * specs run:
 *   - `hermetic` runs the whole suite against the local compose stack;
 *   - `deployed` runs only the `@deployed`-tagged, no-temp journeys against an
 *     env-provided stack (dev-cloud has no smoker app, so the live-temperature
 *     journeys are excluded).
 *
 * Keeping the name + grep decision in one small, pure function makes the
 * "deployed runs exactly the tagged specs" guarantee unit-testable without
 * booting Playwright.
 */
import type { E2eTarget } from './target.ts';

/** Tag stamped on specs that are safe to run against a deployed stack. */
export const DEPLOYED_TAG = '@deployed';

export interface ProjectFilter {
  /** Project name, mirrors the resolved target. */
  name: E2eTarget;
  /** When set, Playwright runs only specs whose title/tags match. */
  grep?: RegExp;
}

export function buildProjectFilter(target: E2eTarget): ProjectFilter {
  if (target === 'deployed') {
    return { name: 'deployed', grep: new RegExp(DEPLOYED_TAG) };
  }
  return { name: 'hermetic' };
}
