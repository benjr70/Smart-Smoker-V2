import { expect, test } from '@playwright/test';
import { BackendClient } from '../src/api/BackendClient';
import { FrontendApp } from '../src/pageObjects/FrontendApp';
import { SmokerApp } from '../src/pageObjects/SmokerApp';

/**
 * The tracer-bullet journey: the single most important product path, end to end
 * against the hermetically composed stack.
 *
 *   pre-smoke created (seeded via the backend API the frontend uses)
 *     -> smoke started from the smoker UI
 *       -> synthetic temps flow emulator -> device-service -> smoker -> backend
 *          -> frontend, and the frontend chart accumulates data
 *         -> post-smoke completed (frontend)
 *           -> the finished smoke appears in history under its pre-smoke name
 *
 * The smoker and the frontend run in separate browser contexts because the
 * smoker only relays temperatures while its page is open and connected.
 *
 * The pre-smoke is created through `POST /api/presmoke` rather than the wizard
 * UI so the tracer bullet stays centred on the live temperature pipeline and
 * the interactive lifecycle steps; UI-driven pre-smoke entry is exercised by
 * the secondary-flow specs in a later slice.
 */
test('lifecycle: pre-smoke -> smoke -> live chart -> post-smoke -> history', async ({
  browser,
}) => {
  const smokeName = `E2E Brisket ${Date.now()}`;
  const restTime = '00:30';

  // 1. Create the pre-smoke; the backend sets up the current smoke + state.
  await new BackendClient().createPreSmoke({ name: smokeName });

  const frontendContext = await browser.newContext();
  const smokerContext = await browser.newContext();
  const frontend = new FrontendApp(await frontendContext.newPage());
  const smoker = new SmokerApp(await smokerContext.newPage());

  try {
    // 2. Open the frontend on the live Smoke step.
    await frontend.goto();
    await frontend.expectPreSmokeLoaded(smokeName);
    await frontend.openSmokeStep();

    // 3. Start the smoke from the smoker touchscreen UI.
    await smoker.goto();
    await smoker.startSmoke();

    // 4. Emulator temps must flow to the smoker readout and grow the frontend
    //    chart (device-service -> smoker relay -> backend -> frontend).
    await smoker.waitForLiveTemps();
    await frontend.waitForGrowingChart();

    // 5. Complete the post-smoke, which archives the smoke.
    await frontend.completePostSmoke(restTime);

    // 6. The finished smoke is visible in history under its pre-smoke name.
    await frontend.openHistory();
    await frontend.expectHistoryContains(smokeName);
  } finally {
    await frontendContext.close();
    await smokerContext.close();
  }

  expect(smokeName).toContain('E2E Brisket');
});
