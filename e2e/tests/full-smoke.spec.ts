import { test } from '@playwright/test';
import { BackendFixture } from '../src/api/backend-fixture';
import { testEntityName } from '../src/api/test-entity';
import { FrontendApp } from '../src/pageObjects/FrontendApp';

/**
 * The full-smoke journey (PRD #393) — every field entered the way a pitmaster
 * enters it, proven to persist. It is built on the mechanic the whole journey
 * leans on:
 *
 *   fields typed into the wizard
 *     -> step away (the wizard saves on unmount)
 *       -> full page reload (nothing survives in memory)
 *         -> back on the pre-smoke step, every value is read back from the backend
 *
 * Every value is deliberately non-default, so no assertion can pass on an
 * untouched form: a meat type absent from the suggestion list, a weight in OZ
 * rather than the default LB, a prep list grown to three rows and then cut to
 * two, and multiline notes.
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
test('full smoke: every pre-smoke field entered in the wizard survives a full reload', async ({
  page,
}) => {
  const smokeName = testEntityName('full-smoke');
  const fixture = new BackendFixture();
  const frontend = new FrontendApp(page);

  // A cut the wizard never suggests, weighed in ounces rather than the default
  // pounds, with notes spanning two lines.
  const preSmoke = {
    name: smokeName,
    meatType: 'Wagyu Chuck Roll',
    weight: 26,
    weightUnit: 'OZ',
    notes: 'Picked up at the butcher\nFat cap on, deckle trimmed',
  } as const;
  const preppedSteps = ['Trim the fat cap', 'Dry brine overnight', 'Rub two hours ahead'];

  try {
    // 1. Create the pre-smoke the way a user does: type it into the wizard.
    //    Three prep steps means the single starting row plus two added ones.
    await frontend.goto();
    await frontend.openPreSmokeStep();
    await frontend.fillPreSmoke({ ...preSmoke, steps: preppedSteps });

    // 2. Prep plans change: drop the middle step. The first and last must stay,
    //    in that order — proving removal takes the intended row and no other.
    await frontend.removePreSmokeStep(1);
    const survivingSteps = [preppedSteps[0], preppedSteps[2]];

    // 3. Stepping away unmounts the step, which is what commits the save.
    await frontend.leavePreSmokeStep();

    // 4. The UI (not the fixture) created the records, so hand them to the
    //    fixture now that they exist — cleanup can then delete exactly them.
    await fixture.adoptCurrentSmoke();

    // 5. Reload the whole app so nothing but the backend can supply the values.
    await frontend.reload();
    await frontend.openPreSmokeStep();
    await frontend.expectPreSmokeShows({ ...preSmoke, steps: survivingSteps });
  } finally {
    await fixture.cleanup();
  }
});
