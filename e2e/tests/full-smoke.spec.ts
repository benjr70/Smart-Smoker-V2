import { test } from '@playwright/test';
import { BackendFixture } from '../src/api/backend-fixture';
import { testEntityName } from '../src/api/test-entity';
import { FrontendApp } from '../src/pageObjects/FrontendApp';

/**
 * The full-smoke journey (PRD #393) — every field entered the way a pitmaster
 * enters it, proven to persist. This first slice is the tracer bullet through
 * the mechanic the whole journey leans on:
 *
 *   name typed into the wizard
 *     -> step away (the wizard saves on unmount)
 *       -> full page reload (nothing survives in memory)
 *         -> back on the pre-smoke step, the name is read back from the backend
 *
 * Deliberately untagged, so it runs only in the `hermetic` project (which runs
 * every spec) and never against a deployed stack: unlike the secondary flows,
 * this journey creates its records through the UI rather than the fixture.
 *
 * Because the UI creates the pre-smoke, there is no id to record at creation
 * time — so once the save has landed the fixture *adopts* the current smoke,
 * resolving its ids through the API so `cleanup()` deletes exactly what this run
 * made, pass or fail. The `smoke-test-` prefix on the name keeps a crashed run's
 * residue reclaimable by the suite's prefix sweep.
 *
 * The existing lifecycle spec stays as-is: it remains the lean deploy probe.
 */
test('full smoke: a pre-smoke named in the wizard survives a full reload', async ({ page }) => {
  const smokeName = testEntityName('full-smoke');
  const fixture = new BackendFixture();
  const frontend = new FrontendApp(page);

  try {
    // 1. Create the pre-smoke the way a user does: type it into the wizard. This
    //    slice asserts the name; the weight comes along because the backend
    //    refuses a pre-smoke without a numeric weight, so a name-only form would
    //    never persist at all. The remaining fields arrive in later slices.
    await frontend.goto();
    await frontend.openPreSmokeStep();
    await frontend.fillPreSmoke({ name: smokeName, weightLb: 12 });

    // 2. Stepping away unmounts the step, which is what commits the save.
    await frontend.leavePreSmokeStep();

    // 3. The UI (not the fixture) created the records, so hand them to the
    //    fixture now that they exist — cleanup can then delete exactly them.
    await fixture.adoptCurrentSmoke();

    // 4. Reload the whole app so nothing but the backend can supply the value.
    await frontend.reload();
    await frontend.openPreSmokeStep();
    await frontend.expectPreSmokeLoaded(smokeName);
  } finally {
    await fixture.cleanup();
  }
});
