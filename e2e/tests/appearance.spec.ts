import { test } from '@playwright/test';
import { carbonDark } from 'theme/src/tokens';
import { FrontendApp } from '../src/pageObjects/FrontendApp';

/**
 * Secondary flow: the appearance choice. `@deployed`-safe, and the only journey
 * in the suite that touches the backend neither to arrange nor to assert: the
 * choice is held per browser, and Playwright hands every journey a fresh
 * context, so this writes nothing another journey or another operator can see.
 * It therefore seeds no fixture — which is only sound because reaching Settings
 * waits on the Appearance card rather than on the notifications card, whose
 * fields depend on what the stack happens to have stored.
 *
 * Dark is chosen, the page is reloaded, and the app has to come back dark: the
 * control still showing Dark (the choice survived) and the settings page
 * actually painted in the dark background token (the choice is applied, not
 * merely remembered). The colour is asserted against the shared token rather
 * than a literal, so a palette change moves the expectation with it; no pixels
 * are compared.
 */
test(
  'appearance: a choice of dark survives a reload and repaints the app',
  { tag: '@deployed' },
  async ({ page }) => {
    const frontend = new FrontendApp(page);

    await frontend.goto();
    await frontend.openSettings();

    await frontend.chooseAppearance('Dark');
    await frontend.expectSettingsBackground(carbonDark.background);

    await frontend.reload();
    await frontend.openSettings();

    await frontend.expectAppearanceChosen('Dark');
    await frontend.expectSettingsBackground(carbonDark.background);
  }
);
