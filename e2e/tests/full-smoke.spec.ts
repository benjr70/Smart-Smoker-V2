import { test } from '@playwright/test';
import { BackendFixture } from '../src/api/backend-fixture';
import { testEntityName } from '../src/api/test-entity';
import { FrontendApp } from '../src/pageObjects/FrontendApp';
import { SmokerApp } from '../src/pageObjects/SmokerApp';

/**
 * The full-smoke journey (PRD #393) — every field entered the way a pitmaster
 * enters it, proven to persist. It is built on the mechanic the whole journey
 * leans on:
 *
 *   fields typed into the wizard
 *     -> step away (the wizard saves on unmount)
 *       -> full page reload (nothing survives in memory)
 *         -> back on the step, every value is read back from the backend
 *
 * The same proof is applied step by step: first to the pre-smoke step, then to
 * the smoke step, whose names, wood type and notes ride the smoke-profile
 * resource.
 *
 * With the paperwork done the cook actually starts, from where a pitmaster
 * starts it: the smoker's touchscreen, driven in its own browser context
 * because the smoker only relays temperatures while its page is open. What
 * follows is the live half of the journey — the emulator's synthetic
 * temperatures have to travel device-service -> smoker -> backend -> frontend
 * and land on every surface that shows them: the smoker's own readout, all four
 * of the frontend's (chamber and three probes), and the chart.
 *
 * The cook then ends the way cooks actually end and resume: stopped from the
 * touchscreen, and started again. Stopping is held to all three of its
 * meanings — the control flips, the recording halts (the chart holds still
 * while the open smoker goes on relaying frames), and the stopped state is the
 * backend's, proven by throwing the page's memory away in a reload. Restarting
 * is held to the product's pause-not-reset rule: the chart keeps the cook it
 * was already holding and adds to it.
 *
 * Every value is deliberately non-default, so no assertion can pass on an
 * untouched form: a meat type absent from the suggestion list, a weight in OZ
 * rather than the default LB, a prep list grown to three rows and then cut to
 * two, multiline notes, a chamber and three probes all renamed off their "Probe
 * N" defaults, and a wood the suggestion list does not offer.
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
test('full smoke: hand-entered fields survive a reload, then the cook goes live', async ({
  page,
  browser,
}) => {
  const smokeName = testEntityName('full-smoke');
  const fixture = new BackendFixture();
  const frontend = new FrontendApp(page);
  // The smoker is a separate device in real life, so it gets its own context:
  // its relay lives or dies with its page, independently of the frontend's.
  const smokerContext = await browser.newContext();
  const smoker = new SmokerApp(await smokerContext.newPage());

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

  // Every probe labelled with what it is actually measuring, and a wood blend
  // the suggestion list never offers.
  const smokeStep = {
    chamberName: 'Offset Barrel',
    probe1Name: 'Point',
    probe2Name: 'Flat',
    probe3Name: 'Ambient',
    woodType: 'Post Oak and Cherry split',
    notes: 'Stall expected around 165F\nSpritzing hourly',
  } as const;

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

    // 6. On to the smoke step: name the chamber and every probe, and record the
    //    wood and the running log.
    await frontend.openSmokeStep();
    await frontend.fillSmokeStep(smokeStep);

    // 7. The same proof as the pre-smoke step: leaving commits the profile, and
    //    only the backend can supply the values a reload reads back.
    await frontend.leaveSmokeStep();
    await frontend.reload();
    await frontend.openSmokeStep();
    await frontend.expectSmokeStepShows(smokeStep);

    // 8. The cook begins where a pitmaster begins it: the smoker touchscreen.
    //    The frontend stays parked on the Smoke step, so it is watching live.
    await smoker.goto();
    await smoker.startSmoke();

    // 9. Every surface that shows temperatures must go live: the smoker's own
    //    readout, all four frontend readouts, and the chart. The chart is the
    //    one that also proves the *start* took: readouts show whatever the open
    //    smoker relays, smoking or not, but the chart only plots a running
    //    smoke — so it fails if the touchscreen never actually started the cook.
    await smoker.waitForLiveTemps();
    await frontend.waitForLiveReadouts();
    await frontend.waitForGrowingChart();

    // 10. A cook is live on screen long before any of it is *stored*: the smoker
    //     relays twice a second, the backend keeps every eleventh frame. The
    //     stop is proven by reading the cook back from the backend, so let it
    //     write enough of one to draw with (a line needs two points).
    await fixture.waitForStoredTemps(2);

    // 11. The pitmaster stops the cook from the same touchscreen they started it
    //     from, and the control flips back to offering a start.
    await smoker.stopSmoke();

    // 12. Stopping has to stop the *recording*, not just the label: the smoker
    //     page stays open and keeps relaying temperatures either way, so the
    //     proof is the frontend's chart holding still while those frames keep
    //     arriving.
    await frontend.expectChartStopsGrowing();

    // 13. Stopped has to be the backend's truth rather than the open page's
    //     memory of a click, so throw that memory away: reload the whole app and
    //     come back to the step, which can now only show what it was told.
    await frontend.reload();
    await frontend.openSmokeStep();
    await frontend.expectSmokeStopped();

    // 14. Stopping is a pause, not a reset: the freshly loaded chart is drawing
    //     the cook the backend stored before the stop, and that is the baseline
    //     the restart has to build on.
    const cookSoFar = await frontend.waitForStoredCookOnChart();

    // 15. Back on again from the touchscreen — a pitmaster's stop is routinely
    //     temporary. The same chart must keep every reading it was holding and
    //     start adding to them again, rather than beginning a second cook.
    await smoker.startSmoke();
    await frontend.expectChartResumesGrowing(cookSoFar);
  } finally {
    // Close the smoker before cleanup: its relay keeps writing temperatures to
    // the very smoke the fixture is about to delete.
    await smokerContext.close();
    await fixture.cleanup();
  }
});
