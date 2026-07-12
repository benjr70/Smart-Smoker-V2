import { test } from '@playwright/test';
import { BackendClient } from '../src/api/BackendClient';
import { FrontendApp } from '../src/pageObjects/FrontendApp';

/**
 * Secondary flow: delete a smoke from history.
 *
 * A completed smoke can be deleted from the history list, after which it is no
 * longer listed — even after the list refetches from the backend.
 */
test('delete: a smoke removed from history no longer appears in the list', async ({ page }) => {
  const name = `E2E Delete ${Date.now()}`;
  await new BackendClient().seedCompletedSmoke({ name });

  const frontend = new FrontendApp(page);
  await frontend.goto();
  await frontend.openHistory();
  await frontend.expectHistoryContains(name);

  await frontend.deleteFromHistory(name);

  await frontend.expectHistoryMissing(name);
});
