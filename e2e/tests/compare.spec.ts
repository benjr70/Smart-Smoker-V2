import { test } from '@playwright/test';
import { BackendFixture } from '../src/api/backend-fixture';
import { FrontendApp } from '../src/pageObjects/FrontendApp';

/**
 * The comparison journey (issue #621): two cooks logged, held against each
 * other, and every part of the answer read off the screen.
 *
 * Compare is the one screen that says nothing about a cook on its own — every
 * claim it makes is a claim about a *pair*. So this journey seeds its own pair
 * rather than opening one that happens to exist: two complete cooks, each with
 * a recorded run of temperatures and a stamp on its log, deliberately alike in
 * some things and unalike in others. The same wood on both, so the facts table
 * has an identical value to grey; different meats, so it has a difference to
 * shout; a prep step both cooks did and one each did alone, so the step diff
 * has all three of its groups to draw; and four ratings apart on taste, so the
 * ratings rows have a margin to report.
 *
 * The way in is asserted before the comparison itself, because the entry is a
 * claim of its own: there is nothing to compare a lone cook with, so the
 * history list offers no comparison until a second cook exists. That is checked
 * against a one-cook archive first, then again once the second lands — a
 * button that is simply always there would pass every assertion below it while
 * offering an empty comparison to anybody who had logged one cook.
 *
 * Deliberately untagged, so it runs only in the `hermetic` project: it asserts
 * what the *whole archive* holds, which is only ever true of a stack this suite
 * owns outright. The deployed projects run against a shared dev-cloud carrying
 * real cooks — and dev-cloud holds none with a series to draw anyway, which is
 * why the pair is seeded rather than assumed.
 */

/** The wood both cooks burned — the fact the table must grey as identical. */
const SHARED_WOOD = 'Post Oak';

/** The prep step both cooks did — the diff's `SAME IN BOTH` group. */
const SHARED_STEP = 'Trim the fat cap';

test('compare: two logged cooks open side by side and the comparison reads them both', async ({
  page,
}) => {
  const fixture = new BackendFixture();
  const frontend = new FrontendApp(page);

  try {
    // 1. The first cook: brisket over post oak, one thing done to it that the
    //    other cook will also have done, and one that only it did.
    const first = await fixture.seedCompletedSmoke({
      label: 'compare-first',
      meatType: 'Brisket',
      weightLb: 12,
      woodType: SHARED_WOOD,
      restTime: '01:00',
      steps: [SHARED_STEP, 'Dry brine overnight'],
      postSmokeSteps: ['Rest in a dry cooler', 'Slice across the grain'],
      stamps: ['wood'],
      ratings: { smokeFlavor: 6, seasoning: 6, tenderness: 6, overallTaste: 5 },
    });

    // 2. One cook is not a comparison, and the list says so by not offering one.
    //    The rule is the list's, not this journey's records', so the archive is
    //    named: the claim only holds while the cook seeded above is the only one
    //    on the screen.
    await frontend.goto();
    await frontend.openHistory();
    await frontend.expectHistoryContains(first.name);
    await frontend.expectCompareNotOffered([first.name]);

    // 3. The second cook: a different meat over the same wood, sharing one prep
    //    step with the first and doing one of its own, and rated four points
    //    higher on taste.
    const second = await fixture.seedCompletedSmoke({
      label: 'compare-second',
      meatType: 'Pork Shoulder',
      weightLb: 8,
      woodType: SHARED_WOOD,
      restTime: '02:00',
      steps: [SHARED_STEP, 'Inject the butt'],
      postSmokeSteps: ['Rest in a dry cooler', 'Pull while hot'],
      stamps: ['wrap'],
      ratings: { smokeFlavor: 8, seasoning: 7, tenderness: 9, overallTaste: 9 },
    });

    // 4. With a second cook on record the list offers the comparison. Reloaded
    //    rather than re-rendered, so what is on screen is what the backend
    //    holds — the list reads the archive when it mounts.
    await frontend.reload();
    await frontend.openHistory();
    await frontend.expectHistoryContains(second.name);
    await frontend.expectCompareOffered();

    // 5. Into the comparison, on the two cooks at the top of the list.
    await frontend.openCompare();
    await frontend.expectCompareSlots({ a: second.name, b: first.name });

    // 6. Both cooks on one plot, each drawn from its own stored readings: the
    //    chart is the only surface that shows what the two runs actually did.
    await frontend.expectCompareChartDrawsBothCooks();

    // 7. What was stamped during each cook, on that cook's own rail under the
    //    plot — the cook log carried onto the comparison rather than left on
    //    the live screen it was tapped from.
    await frontend.expectCompareStamps({ a: 'Wrapped', b: 'Added Wood' });

    // 8. The facts table earns its place by getting out of the way: the wood
    //    both cooks burned is greyed as shared, while the meats they were are
    //    not — the difference in treatment *is* the feature.
    await frontend.expectCompareGreysSharedFact('Wood', 'Meat');

    // 9. The method, as a diff rather than as two lists: the step both cooks
    //    did collapses into the shared group, and each cook's own step stands
    //    in its own.
    await frontend.expectCompareStepDiff('pre', {
      both: SHARED_STEP,
      onlyA: 'Inject the butt',
      onlyB: 'Dry brine overnight',
    });

    // 10. And the outcome, axis by axis: the taste scores are four apart, and
    //     the row says so with the arrow pointing at the cook that won it.
    await frontend.expectCompareRatingDelta('Overall taste', '4.0');
  } finally {
    await fixture.cleanup();
  }
});
