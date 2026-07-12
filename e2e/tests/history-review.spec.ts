import { test } from '@playwright/test';
import { BackendClient } from '../src/api/BackendClient';
import { FrontendApp } from '../src/pageObjects/FrontendApp';

/**
 * Secondary flow: history + review cards.
 *
 * A completed smoke seeded through the REST API the frontend uses shows up in
 * history and, once opened, its review cards render the pre-smoke, smoke-profile
 * and post-smoke values it was finished with. Seeding via the API (rather than
 * the live pipeline the tracer-bullet lifecycle spec drives) keeps this spec
 * focused on the review surfaces.
 */
test('history: a completed smoke opens and its review cards show the saved data', async ({
  page,
}) => {
  const name = `E2E Review ${Date.now()}`;
  const seeded = await new BackendClient().seedCompletedSmoke({
    name,
    meatType: 'Pork Shoulder',
    weightLb: 8,
    woodType: 'Cherry',
    restTime: '01:15',
  });

  const frontend = new FrontendApp(page);
  await frontend.goto();
  await frontend.openHistory();
  await frontend.expectHistoryContains(name);

  await frontend.openReview(name);
  await frontend.expectReviewShows({
    name,
    meatType: seeded.meatType,
    weight: String(seeded.weightLb),
    woodType: seeded.woodType,
    restTime: seeded.restTime,
  });
});
