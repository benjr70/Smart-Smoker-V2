import { expect, test } from '@playwright/test';
import { BackendFixture } from '../src/api/backend-fixture';
import { testEntityName } from '../src/api/test-entity';
import { FrontendApp, PreSmokeFields } from '../src/pageObjects/FrontendApp';
import { VoiceFill } from '../src/pageObjects/VoiceFill';

/**
 * Voice Fill, end to end, on the scripted models (issue #711).
 *
 * The real flow through the real app — button, sheet, review list, fill, toast,
 * Undo, and the settings card the models are picked on — with a scripted speech
 * model, a scripted extractor and a downloader that fetches nothing standing in
 * behind the same ports the real adapters sit behind. So the whole of it is
 * held in CI with no model downloaded and no microphone.
 *
 * The scripted Ramble is the one the app carries (`SCRIPTED_RAMBLE`): on the
 * pre-smoke screen it names a brisket, a weight and two prep steps; on the
 * smoke screen a probe name, the wood, a probe target, a serve time, a rest, a
 * stamp and a note — one of each kind of thing that screen writes.
 *
 * Untagged, so only the hermetic project runs it: the scripted models are
 * allowed by the env file the hermetic stack's bundle is built from, and by no
 * published image (see `ci/voice-fill-switch.test.mts`). A deployed build has
 * no Voice Fill for these journeys to find.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** How long a write the app sends without waiting on it may take to be stored. */
const BACKEND_WRITE_TIMEOUT_MS = 15_000;

/**
 * The pre-smoke screen writes nothing until it is left, so what a fill and its
 * Undo did is read off the form: three rows are proposed, one is unticked, and
 * the two that are filled go back to what was typed.
 */

test('voice fill: a Ramble on the pre-smoke screen fills the ticked rows, and Undo takes them back', async ({
  page,
}) => {
  const fixture = new BackendFixture();
  const typed: PreSmokeFields = {
    name: testEntityName('voice-fill'),
    meatType: 'Pork Butt',
    weight: 10,
    weightUnit: 'LB',
    steps: ['Score the skin'],
    notes: 'Picked up at the butcher',
  };

  const frontend = new FrontendApp(page);
  const voiceFill = new VoiceFill(page);
  try {
    await frontend.goto({ scriptedVoiceFill: true });
    await frontend.fillPreSmoke(typed);

    await voiceFill.ramble();
    await voiceFill.expectReview(['meatType', 'weight', 'steps']);

    await voiceFill.untick('weight');
    const flashed = await voiceFill.recordFlashes();
    await voiceFill.fill(2);
    // The fields that were written flash, and the one left alone does not.
    await expect.poll(flashed).toEqual(['meatType', 'steps']);
    await frontend.expectPreSmokeShows({
      ...typed,
      meatType: 'Brisket',
      steps: ['Score the skin', 'Trimmed the fat cap', 'Mustard binder'],
    });

    await voiceFill.undo();
    await voiceFill.expectNothingFlashing();
    await frontend.expectPreSmokeShows(typed);

    await frontend.leavePreSmokeStep();
    await fixture.adoptCurrentSmoke();
  } finally {
    await fixture.cleanup();
  }
});

/**
 * The smoke screen's probe target and Serve Plan are written the moment they
 * are filled — to the settings and to the cook, not to a form — so they are
 * read back from the backend: once after the fill, and again after Undo.
 */
test('voice fill: a Ramble on the smoke screen writes a probe target and the Serve Plan to the backend, and Undo writes them back', async ({
  page,
}) => {
  const fixture = new BackendFixture();
  const { name } = await fixture.createPreSmoke({ label: 'voice-fill-smoke' });
  // The watch list is global settings rather than part of the cook, so it is
  // put back on cleanup; the plan lives on the cook and goes with it.
  await fixture.keepProbeTargets();
  const targetBefore = await fixture.probeTarget('probe1');
  const planBefore = { serveAt: new Date(Date.now() + 8 * HOUR_MS), restMinutes: 30 };
  await fixture.seedServePlan(planBefore);

  const frontend = new FrontendApp(page);
  const voiceFill = new VoiceFill(page);
  try {
    await frontend.goto({ scriptedVoiceFill: true });
    await frontend.expectPreSmokeLoaded(name);
    await frontend.openSmokeStep();
    // A stamp is only logged against a cook that is running.
    await frontend.startSmoking();
    await frontend.expectServePlanRest('30m');

    // The Ramble says "in four hours", which is counted from when it is spoken.
    const spokenFrom = Date.now();
    await voiceFill.ramble();
    await voiceFill.expectReview([
      'probe1Name',
      'woodType',
      'probe1Target',
      'serveAt',
      'restMinutes',
      'stamps',
      'notes',
    ]);
    const spokenBy = Date.now();
    const flashed = await voiceFill.recordFlashes();
    await voiceFill.fill(7);
    // Each field flashes where this screen reads it: a probe's target on the
    // estimate card, and both halves of the Serve Plan on its card.
    await expect
      .poll(flashed)
      .toEqual(['notes', 'probe1Name', 'probeTargets', 'servePlan', 'stamps', 'woodType']);

    // The toast is up before any of these writes has been answered — the fill
    // sends them and does not wait — so the backend is asked until it has them,
    // as it is after Undo.
    await expect
      .poll(() => fixture.probeTarget('probe1'))
      .toEqual({ target: 203, enabled: true, targetSource: 'user' });
    // The plan's two halves are two writes, so it is read until both are in.
    await expect(async () => {
      const planned = await fixture.servePlan();
      expect(planned.restMinutes).toBe(45);
      expect(planned.serveAt?.getTime()).toBeGreaterThanOrEqual(
        spokenFrom + 4 * HOUR_MS - MINUTE_MS
      );
      expect(planned.serveAt?.getTime()).toBeLessThanOrEqual(spokenBy + 4 * HOUR_MS + MINUTE_MS);
    }).toPass({ timeout: BACKEND_WRITE_TIMEOUT_MS });
    await frontend.expectServePlanRest('45m');
    await frontend.expectCookLogEntry('Wrapped');

    await voiceFill.undo();
    await voiceFill.expectNothingFlashing();

    await expect.poll(() => fixture.probeTarget('probe1')).toEqual(targetBefore);
    await expect.poll(() => fixture.servePlan()).toEqual(planBefore);
    await frontend.expectServePlanRest('30m');
    await frontend.expectCookLogEmpty();

    await frontend.stopSmoking();
  } finally {
    await fixture.cleanup();
  }
});

/**
 * The Model library is the phone's own — kept in the browser, not the backend —
 * so this journey seeds nothing and leaves nothing behind.
 *
 * The grey pill is the other face of the same library: it stands in for the
 * Voice fill button on a screen for as long as the picked pair is not on the
 * phone, so it is followed here — through the first download, and back again
 * once a picked model has been removed.
 */
test('voice fill: Settings shows the card, a picked model downloads to Ready, and Remove takes it off the phone, with the grey pill standing in for the button meanwhile', async ({
  page,
}) => {
  const frontend = new FrontendApp(page);
  const voiceFill = new VoiceFill(page);

  // A first opening of the app starts the default pair downloading by itself,
  // and until it is on the phone the screen has the pill where its button goes.
  const pillSaid = await voiceFill.recordPill();
  await frontend.goto({ scriptedVoiceFill: true });
  await voiceFill.expectButton();
  expect((await pillSaid()).some(message => /^Model downloading \d+%$/.test(message))).toBe(true);

  await frontend.openSettings();
  await voiceFill.expectSettingsCard();
  await voiceFill.expectPickedModel('speech', 'Scripted speech');
  await voiceFill.expectModelStatus('speech', /^Ready to use · 158 MB on phone$/);
  await voiceFill.expectModelStatus('extractor', /^Ready to use · 1\.9 GB on phone$/);

  const statusesSaid = await voiceFill.recordModelStatus('speech');
  await voiceFill.pickModel('speech', 'Scripted speech B');
  await voiceFill.expectModelStatus('speech', /^Ready to use · 64 MB on phone$/);
  // The line walks there: it says it is downloading before it says it is ready.
  const said = await statusesSaid();
  expect(said.at(-1)).toBe('Ready to use · 64 MB on phone');
  expect(said.some(status => /^Downloading \d+% · .+ of 64 MB$/.test(status))).toBe(true);

  await voiceFill.removeModel('Scripted speech B');
  await voiceFill.expectModelStatus('speech', /^Not downloaded · 64 MB$/);

  // The picked speech model is off the phone again, so a screen is back to the
  // pill — which says where that is put right, and takes a tap there.
  await frontend.leaveSettings();
  await voiceFill.expectPill('Download a voice model in Settings');
  await voiceFill.openSettingsFromPill();
  await voiceFill.expectModelStatus('speech', /^Not downloaded · 64 MB$/);
});
