import { expect, test } from '@playwright/test';
import { BackendClient } from '../src/api/BackendClient';
import { FrontendApp } from '../src/pageObjects/FrontendApp';
import { SmokerApp } from '../src/pageObjects/SmokerApp';

/**
 * The full temperature-chain journey against the hermetically composed stack.
 *
 *   emulator temps -> device-service ws -> smoker page (relay) -> backend ws
 *     -> frontend chart
 *
 * The smoker only relays while its home screen is open and connected, so this
 * spec keeps the smoker page live in its own browser context while a second
 * context drives and observes the frontend. It goes beyond the tracer bullet by
 * asserting persistence: the accumulated series is stored in the backend and
 * survives a full frontend reload.
 *
 * The pre-smoke is seeded through the API the frontend itself uses so the spec
 * stays centred on the temperature pipeline rather than wizard data entry.
 */
test('temp-chain: emulator temps reach smoker + frontend chart and persist across reload', async ({
  browser,
}) => {
  const smokeName = `E2E Temp Chain ${Date.now()}`;
  const backend = new BackendClient();

  // 1. Seed the pre-smoke; the backend creates the smoke + current state.
  await backend.createPreSmoke({ name: smokeName });

  const frontendContext = await browser.newContext();
  const smokerContext = await browser.newContext();
  const frontend = new FrontendApp(await frontendContext.newPage());
  const smoker = new SmokerApp(await smokerContext.newPage());

  try {
    // 2. Open the frontend on the live Smoke step.
    await frontend.goto();
    await frontend.expectPreSmokeLoaded(smokeName);
    await frontend.openSmokeStep();

    // 3. Start the smoke from the smoker touchscreen and confirm the relay
    //    surface is present and connected.
    await smoker.goto();
    await smoker.startSmoke();
    await smoker.expectConnected();

    // 4. Behaviour 1 + 3: emulator temps land on the smoker readout and keep
    //    changing as the emulator ramps.
    await smoker.waitForLiveTemps();
    await smoker.expectReadoutChanging();

    // 5. Behaviour 1 + 2: the same temps flow through to the frontend chart,
    //    whose datapoint count grows across the observation window.
    await frontend.waitForGrowingChart();

    // 6. Persistence at the storage layer: records accumulate in the backend
    //    for the active smoke (this is what a reload will rebuild from). The
    //    backend throttles its persist path, so the first write lands a few
    //    seconds after smoke start — poll across several throttle windows rather
    //    than reading once and racing it.
    const persistedBefore = await backend.waitForPersistedTemps();
    expect(persistedBefore).toBeGreaterThan(0);

    // 7. Behaviour 2 (persistence): after a full frontend reload the chart still
    //    shows the accumulated series, rebuilt from the persisted records.
    const chartSizeBefore = await frontend.chartDataSize();
    await frontend.reloadToSmokeStep();
    await frontend.expectChartRetainsSeries(chartSizeBefore);

    // The stored series survived the reload (and typically kept growing).
    const persistedAfter = await backend.getCurrentTempCount();
    expect(persistedAfter).toBeGreaterThanOrEqual(persistedBefore);
  } finally {
    await frontendContext.close();
    await smokerContext.close();
  }
});
