import { test } from '@playwright/test';
import { BackendFixture } from '../src/api/backend-fixture';
import { FrontendApp } from '../src/pageObjects/FrontendApp';

/**
 * Secondary flow: delete a smoke from history. `@deployed`-safe — no live temps,
 * seeded through the fixture. The journey itself deletes the smoke; the fixture
 * cleanup is a best-effort safety net if the UI delete never lands.
 *
 * A completed smoke can be deleted from the history list, after which it is no
 * longer listed — even after the list refetches from the backend.
 */
test(
  'delete: a smoke removed from history no longer appears in the list',
  { tag: '@deployed' },
  async ({ page }) => {
    const fixture = new BackendFixture();
    const seeded = await fixture.seedCompletedSmoke({ label: 'delete' });

    const frontend = new FrontendApp(page);
    try {
      await frontend.goto();
      await frontend.openHistory();
      await frontend.expectHistoryContains(seeded.name);

      await frontend.deleteFromHistory(seeded.name);

      await frontend.expectHistoryMissing(seeded.name);
    } finally {
      await fixture.cleanup();
    }
  }
);
