import { test } from '@playwright/test';
import { BackendFixture } from '../src/api/backend-fixture';
import { FrontendApp } from '../src/pageObjects/FrontendApp';

/**
 * Secondary flow: settings persistence. `@deployed`-safe — notification
 * settings are global config, so the fixture snapshots the chamber range that
 * existed before this run and restores it on cleanup.
 *
 * A chamber Temperature Alert range changed in Settings survives a full page
 * reload. The settings card persists on unmount, so the change is committed by
 * leaving the tab and the reload then reads it back from the backend. This
 * asserts persistence only — no alert evaluation or push delivery is exercised.
 */
test(
  'settings: a changed chamber alert range persists across reload',
  { tag: '@deployed' },
  async ({ page }) => {
    const fixture = new BackendFixture();
    const seeded = await fixture.seedChamberAlert({ low: 210, high: 260 });
    const changed = { low: seeded.low - 5, high: seeded.high + 5 };

    const frontend = new FrontendApp(page);
    try {
      await frontend.goto();

      await frontend.openSettings();
      await frontend.expectChamberRange(seeded);

      await frontend.setChamberRange(changed);
      await frontend.expectChamberRange(changed);
      // Leaving Settings unmounts the card, which is what persists the change.
      await frontend.leaveSettings();

      await frontend.reload();
      await frontend.openSettings();
      await frontend.expectChamberRange(changed);
    } finally {
      await fixture.cleanup();
    }
  }
);
