import { test } from '@playwright/test';
import { BackendFixture } from '../src/api/backend-fixture';
import { FrontendApp } from '../src/pageObjects/FrontendApp';

/**
 * Secondary flow: ratings persistence. `@deployed`-safe — no live temps, all
 * state seeded and reclaimed through the fixture (prefixed name + cleanup).
 *
 * A finished smoke can be re-rated from its review, and the new rating survives
 * a full page reload — proving the ratings card's change is persisted to the
 * backend, not just held in component state.
 */
test(
  'ratings: a re-rated finished smoke keeps the new rating after reload',
  { tag: '@deployed' },
  async ({ page }) => {
    const fixture = new BackendFixture();
    const seeded = await fixture.seedCompletedSmoke({
      label: 'ratings',
      ratings: { overallTaste: 4 },
    });

    const frontend = new FrontendApp(page);
    try {
      await frontend.goto();
      await frontend.openHistory();
      await frontend.expectHistoryContains(seeded.name);
      await frontend.openReview(seeded.name);
      await frontend.expectOverallTaste(4);

      await frontend.setOverallTaste(9);

      // Reload the whole app; the new rating must be read back from the backend.
      await frontend.reload();
      await frontend.openHistory();
      await frontend.openReview(seeded.name);
      await frontend.expectOverallTaste(9);
    } finally {
      await fixture.cleanup();
    }
  }
);
