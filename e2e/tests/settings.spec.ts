import { test } from '@playwright/test';
import { BackendFixture } from '../src/api/backend-fixture';
import { FrontendApp } from '../src/pageObjects/FrontendApp';

/**
 * Secondary flow: settings persistence. `@deployed`-safe — notification settings
 * are global config, so the fixture snapshots them before seeding a prefixed
 * baseline rule and restores the snapshot on cleanup.
 *
 * A notification setting changed in Settings survives a full page reload. The
 * settings card persists on unmount, so the change is committed by leaving the
 * tab and the reload then reads it back from the backend. This asserts
 * persistence only — no push-notification delivery is exercised.
 */
test(
  'settings: a changed notification setting persists across reload',
  { tag: '@deployed' },
  async ({ page }) => {
    const fixture = new BackendFixture();
    const seeded = await fixture.seedNotificationRule({ label: 'seeded' });
    const changed = `${seeded}-changed`;

    const frontend = new FrontendApp(page);
    try {
      await frontend.goto();

      await frontend.openSettings();
      await frontend.expectNotificationMessage(seeded);

      await frontend.setNotificationMessage(changed);
      await frontend.expectNotificationMessage(changed);
      // Leaving Settings unmounts the card, which is what persists the change.
      await frontend.leaveSettings();

      await frontend.reload();
      await frontend.openSettings();
      await frontend.expectNotificationMessage(changed);
    } finally {
      await fixture.cleanup();
    }
  }
);
