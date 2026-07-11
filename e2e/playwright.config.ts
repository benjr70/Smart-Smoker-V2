import { defineConfig, devices } from '@playwright/test';
import { resolveTarget } from './src/config/target';
import { buildProjectFilter } from './src/config/playwright-projects';

const { target, urls } = resolveTarget();
const project = buildProjectFilter(target);
const isCI = !!process.env.CI;

/**
 * Playwright config for the Smart Smoker V2 user-journey suite.
 *
 * The `hermetic` project runs the whole suite against the locally composed
 * stack (docker/docker-compose.e2e.yml). The `deployed` project runs only the
 * `@deployed`-tagged, no-temp journeys against env-provided URLs (dev-cloud has
 * no smoker app, so the live-temperature journeys are excluded). Which project
 * is active is decided by `E2E_TARGET` via `resolveTarget`.
 */
export default defineConfig({
  testDir: './tests',
  globalSetup: require.resolve('./src/global-setup'),
  // Journeys share one backend/mongo, so run serially to keep state clean.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: 2,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: urls.frontend,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    {
      // Named for the resolved target: `hermetic` (default, the PR gate) runs
      // the whole suite against the local compose stack; `deployed` aims the
      // `@deployed`-tagged specs at env-provided URLs via `grep`.
      name: project.name,
      grep: project.grep,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
