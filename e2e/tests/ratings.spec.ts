import { test } from '@playwright/test';
import { BackendClient } from '../src/api/BackendClient';
import { FrontendApp } from '../src/pageObjects/FrontendApp';

/**
 * Secondary flow: ratings persistence.
 *
 * A finished smoke can be re-rated from its review, and the new rating survives
 * a full page reload — proving the ratings card's change is persisted to the
 * backend, not just held in component state.
 */
test('ratings: a re-rated finished smoke keeps the new rating after reload', async ({ page }) => {
  const name = `E2E Ratings ${Date.now()}`;
  await new BackendClient().seedCompletedSmoke({
    name,
    ratings: { overallTaste: 4 },
  });

  const frontend = new FrontendApp(page);
  await frontend.goto();
  await frontend.openHistory();
  await frontend.expectHistoryContains(name);
  await frontend.openReview(name);
  await frontend.expectOverallTaste(4);

  await frontend.setOverallTaste(9);

  // Reload the whole app; the new rating must be read back from the backend.
  await frontend.reload();
  await frontend.openHistory();
  await frontend.openReview(name);
  await frontend.expectOverallTaste(9);
});
