import { defineConfig, devices } from '@playwright/test';
import { resolveUrls } from './src/config/urls';

const urls = resolveUrls();
const isCI = !!process.env.CI;

/**
 * Playwright config for the Smart Smoker V2 user-journey suite.
 *
 * The `hermetic` project runs against the locally composed stack
 * (docker/docker-compose.e2e.yml). Later slices add a `deployed` project that
 * points the same specs at env-provided URLs.
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
      name: 'hermetic',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
