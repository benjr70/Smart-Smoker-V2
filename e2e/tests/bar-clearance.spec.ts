import { test } from '@playwright/test';
import { BackendFixture } from '../src/api/backend-fixture';
import { FrontendApp } from '../src/pageObjects/FrontendApp';

/**
 * Portrait phone, the size the collision was reported at (a Pixel, scaled to
 * CSS pixels). The bar is fixed to the bottom of the viewport, so everything
 * this journey is about only happens on a screen short enough for content to
 * reach it — a desktop viewport hides the whole question.
 */
test.use({ viewport: { width: 427, height: 952 } });

/**
 * Secondary flow: the bottom navigation bar and the space beneath a screen.
 * `@deployed`-safe — it seeds one pre-smoke so the wizard has known content to
 * measure, and deletes it again.
 *
 * The bar is pinned to the viewport, so it is over whatever the screen puts
 * there; the app holds its height open in flow instead, once, below every
 * screen. Two things have to be true at the same time and this asserts both,
 * because fixing either one alone breaks the other:
 *
 *   - nothing of a screen ends up under the bar (the Settings version card,
 *     which is what was reported: the screen overflows, and scrolled to the
 *     bottom the bar sat over its last card);
 *   - a screen that fits gains no scrollbar from the space being held (the
 *     Smoke wizard, whose step used to claim `93vh - 56px` for itself with a
 *     stepper above it and the reserved height below — more than one viewport
 *     between them, on every phone).
 *
 * Only the wizard is held to the viewport: Review and Settings show whatever
 * the stack has stored and are expected to scroll when that is tall enough.
 */
test(
  'layout: no screen is left under the bottom navigation bar, and none scrolls to make room for it',
  { tag: '@deployed' },
  async ({ page }) => {
    const fixture = new BackendFixture();
    const seeded = await fixture.createPreSmoke({ label: 'bar-clearance' });

    const frontend = new FrontendApp(page);
    try {
      await frontend.goto();
      await frontend.expectPreSmokeLoaded(seeded.name);

      await frontend.expectClearsBottomBar('smoke', { fitsTheViewport: true });

      await frontend.openHistory();
      await frontend.expectClearsBottomBar('review');

      await frontend.openSettings();
      await frontend.expectClearsBottomBar('settings');
    } finally {
      await fixture.cleanup();
    }
  }
);
