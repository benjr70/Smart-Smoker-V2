import { test } from '@playwright/test';
import { BackendFixture } from '../src/api/backend-fixture';
import { FrontendApp } from '../src/pageObjects/FrontendApp';

/**
 * Secondary flow: the cook log on the web live smoke step.
 *
 * Tap a stamp while a cook is running, see the entry appear in the list under
 * the chart with the stamp's label, then remove it and see the list empty
 * again. No temperatures are needed — an event is stamped against the cook, and
 * the pit it snapshots may legitimately have reported nothing yet — so this is
 * `@deployed`-safe: it runs against dev-cloud, which has no smoker app.
 *
 * The list is the assertion rather than the click, because the list is drawn
 * from what the backend answered: an entry on screen is an event that was
 * recorded, and an empty list after the delete is one that is really gone.
 */
test(
  'cook log: a stamp tapped on the web appears in the log and can be removed',
  { tag: '@deployed' },
  async ({ page }) => {
    const fixture = new BackendFixture();
    const { name: smokeName } = await fixture.createPreSmoke({ label: 'cooklog' });

    const frontend = new FrontendApp(page);
    try {
      await frontend.goto();
      await frontend.expectPreSmokeLoaded(smokeName);
      await frontend.openSmokeStep();

      // Stamps are only offered against a cook that is running.
      await frontend.startSmoking();

      await frontend.tapCookStamp('wood');
      await frontend.expectCookLogEntry('Added Wood');

      await frontend.removeCookLogEntry('Added Wood');
      await frontend.expectCookLogEmpty();

      await frontend.stopSmoking();
    } finally {
      await fixture.cleanup();
    }
  }
);
