import { test } from '@playwright/test';
import { BackendFixture } from '../src/api/backend-fixture';
import { FrontendApp } from '../src/pageObjects/FrontendApp';

/**
 * Secondary flow: history + review cards. `@deployed`-safe — no live temps, all
 * state seeded and reclaimed through the fixture (prefixed name + cleanup).
 *
 * A completed smoke seeded through the REST API the frontend uses shows up in
 * history and, once opened, its review cards render the pre-smoke, smoke-profile
 * and post-smoke values it was finished with. Seeding via the API (rather than
 * the live pipeline the tracer-bullet lifecycle spec drives) keeps this spec
 * focused on the review surfaces.
 */
test(
  'history: a completed smoke opens and its review cards show the saved data',
  { tag: '@deployed' },
  async ({ page }) => {
    const fixture = new BackendFixture();
    const seeded = await fixture.seedCompletedSmoke({
      label: 'review',
      meatType: 'Pork Shoulder',
      weightLb: 8,
      woodType: 'Cherry',
      restTime: '01:15',
    });

    const frontend = new FrontendApp(page);
    try {
      await frontend.goto();
      await frontend.openHistory();
      await frontend.expectHistoryContains(seeded.name);

      await frontend.openReview(seeded.name);
      await frontend.expectReviewShows({
        name: seeded.name,
        meatType: seeded.meatType,
        weight: String(seeded.weightLb),
        woodType: seeded.woodType,
        restTime: seeded.restTime,
      });
    } finally {
      await fixture.cleanup();
    }
  }
);
