import { test } from '@playwright/test';
import { BackendClient } from '../src/api/BackendClient';
import { FrontendApp } from '../src/pageObjects/FrontendApp';

/**
 * Secondary flow: settings persistence.
 *
 * A notification setting changed in Settings survives a full page reload. A
 * baseline rule is seeded first so the card has a field to edit; the settings
 * card persists on unmount, so the change is committed by leaving the tab and
 * the reload then reads it back from the backend. This asserts persistence
 * only — no push-notification delivery is exercised.
 */
test('settings: a changed notification setting persists across reload', async ({ page }) => {
  const seeded = `E2E seeded ${Date.now()}`;
  const changed = `E2E changed ${Date.now()}`;
  await new BackendClient().seedNotificationRule(seeded);

  const frontend = new FrontendApp(page);
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
});
