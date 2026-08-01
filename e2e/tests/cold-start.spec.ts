import { expect, test } from '@playwright/test';
import { FrontendApp } from '../src/pageObjects/FrontendApp';

/**
 * The cold start: open the app, touch nothing, walk away.
 *
 * Found by hand against dev-cloud. With no smoke in progress the wizard shows
 * the Pre-Smoke step holding its defaults, and leaving that step used to POST
 * them, because the step saved on unmount unconditionally. The defaults carry
 * no weight, which the pre-smoke DTO rejected, so the first thing a user saw
 * after launching the app and tapping any other tab was the error snackbar
 * "Could not save pre-smoke details." — on a screen they had not typed into.
 *
 * Two things are held here, because either alone can pass while the bug lives:
 * the save must not be *issued* (relaxing the DTO alone would silence the
 * snackbar while quietly creating an empty pre-smoke, and a smoke session with
 * it, on every launch), and no error may reach the user.
 *
 * Deliberately untagged, so it runs only in the `hermetic` project: it asserts
 * the absence of a write, which a deployed stack shared with other traffic
 * cannot promise. It writes nothing, so it needs no fixture and no cleanup —
 * and that is the whole point of it.
 */
test('cold start: an untouched pre-smoke step saves nothing and raises no error', async ({
  page,
}) => {
  const frontend = new FrontendApp(page);

  await frontend.goto();
  const savesOnArrival = frontend.countPreSmokeSaves();

  // Leave the step the way a user does — by tapping another one — without
  // having typed a single character into it.
  await frontend.openSmokeStep();

  expect(frontend.countPreSmokeSaves()).toBe(savesOnArrival);
  await frontend.expectNoErrorSnackbar();
});
