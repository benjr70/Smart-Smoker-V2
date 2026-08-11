/**
 * No screen makes its own allowance for the bottom bar.
 *
 * The bar is pinned to the viewport and reserves its height once, in flow (see
 * `BOTTOM_BAR_HEIGHT` and the reservation in `bottombar.tsx`). Before that
 * reservation existed each screen that noticed the problem worked around it
 * privately — a bar-height padding under the content, a viewport claim that
 * forgot its own padding. Left in place those allowances are now counted twice,
 * and the first thing a person sees is a scrollbar on a screen that fits.
 *
 * The stylesheets are read from disk rather than through a rendered screen: the
 * test runner replaces stylesheet imports with a proxy, so a rendered element
 * cannot show what its `.css` file says. This is the same reason
 * `theme/legacyStylesheets.test.ts` reads them that way.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../api';
import { createFakeBackend } from '../../api/fakeBackend';
import { DesignSurface, appTheme } from '../../theme';
import { History } from '../history/history';
import { Screens } from '../common/interfaces/enums';
import { Settings } from '../settings/settings';
import { Smoke } from '../smoke/smoke';
import { BOTTOM_BAR_HEIGHT, BottomBar } from './bottombar';

const SOURCE_ROOT = path.resolve(__dirname, '..', '..');

/** Every stylesheet the application ships. */
const stylesheets = (directory: string): string[] =>
  fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap(entry =>
      entry.isDirectory()
        ? stylesheets(path.join(directory, entry.name))
        : entry.name.endsWith('.css')
          ? [path.join(directory, entry.name)]
          : []
    );

/** A stylesheet's declarations, without the commented-out ones (they lay out nothing). */
const declarationsOf = (file: string): string =>
  fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Space held open below a screen's content that is exactly the height of the
 * bar — the shape a private reservation takes.
 */
const BAR_HEIGHT_GAP_BELOW = new RegExp(`(?:padding|margin)-bottom:\\s*${BOTTOM_BAR_HEIGHT}px`);

describe('the space left for the bottom bar', () => {
  const files = stylesheets(SOURCE_ROOT);

  it('is reserved somewhere the stylesheets can be read from', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map(file => [path.relative(SOURCE_ROOT, file), file]))(
    '%s holds no bar-height gap below its content of its own',
    (_name, file) => {
      expect(declarationsOf(file)).not.toMatch(BAR_HEIGHT_GAP_BELOW);
    }
  );

  /**
   * The Review screen claims `calc(100vh - BOTTOM_BAR_HEIGHT)` — the viewport
   * the bar's reservation leaves it. Padding the screen carries outside that
   * claim is added to it, so the screen plus the reservation comes to more than
   * one viewport and an empty Review scrolls by the width of the padding.
   */
  it('is not pushed past the viewport by padding the Review screen holds outside its claim', async () => {
    renderReview();
    const root = await screen.findByTestId('history-screen');

    const padding =
      pixels(getComputedStyle(root).paddingTop) + pixels(getComputedStyle(root).paddingBottom);
    const claimCountsItsOwnPadding = /\.history\s*\{[^}]*box-sizing:\s*border-box/.test(
      declarationsOf(path.join(SOURCE_ROOT, 'components', 'history', 'history.style.css'))
    );

    expect(claimCountsItsOwnPadding ? 0 : padding).toBe(0);
  });

  /**
   * The Review card list held a gap below its last card that was the bar's
   * height over again — the same workaround as the Smoke step's padding, in a
   * component prop rather than a stylesheet. Stacked on the reservation it is
   * twice the dead space below the last card, and it grows the screen by the
   * bar's height a second time.
   */
  it('is not held a second time below the last Review card', async () => {
    renderReview();
    const cards = await screen.findByTestId('history-cards');

    expect(pixels(getComputedStyle(cards).paddingBottom)).toBeLessThan(BOTTOM_BAR_HEIGHT);
  });

  /**
   * Settings is the screen the collision was reported on. It claims the
   * viewport the reservation leaves it, and the two are measured here from
   * opposite ends — what the bar actually reserves against what the screen
   * actually claims — so a change to one that is not made to the other is
   * caught rather than cancelling itself out.
   */
  it('is the whole of what the Settings screen leaves out of its viewport claim', async () => {
    renderBar();
    const reserved = getComputedStyle(screen.getByTestId('bottom-bar-reservation')).height;

    renderSettingsScreen();
    await screen.findByText('Notifications');

    expect(screen.getByTestId('settings-page')).toHaveStyle({
      minHeight: `calc(100vh - ${reserved})`,
    });
  });
});

/** Portrait heights of the phones this application is read on, in CSS pixels. */
const PHONE_HEIGHTS = [800, 952, 1071];

/** A rule that sizes itself against the viewport, and the selector it sizes. */
type ViewportClaim = { selector: string; height: string };

/** Every height in a stylesheet that is measured against the viewport. */
const viewportClaims = (css: string): ViewportClaim[] =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, selector, body]) => {
    const height = /(?:^|[;\s])(?:min-)?height:\s*([^;}]*vh[^;}]*)/.exec(body);

    return height ? [{ selector: selector.trim(), height: height[1].trim() }] : [];
  });

/** What a viewport-relative height comes to, in pixels, on a viewport this tall. */
const claimedPixels = (height: string, viewportHeight: number): number => {
  const viewportUnits = /(\d+(?:\.\d+)?)vh/.exec(height);
  const subtracted = /-\s*(\d+(?:\.\d+)?)px/.exec(height);

  return (Number(viewportUnits?.[1] ?? 0) / 100) * viewportHeight - Number(subtracted?.[1] ?? 0);
};

/** The screens the bar navigates between, and the stylesheet each is laid out from. */
const screens = [
  {
    name: 'Smoke',
    stylesheet: path.join(SOURCE_ROOT, 'components', 'smoke', 'smoke.style.css'),
    show: async (): Promise<HTMLElement> => {
      renderSmokeWizard();
      await screen.findByTestId('presmoke-name-input');

      return screen.getByTestId('smoke-screen');
    },
  },
  {
    name: 'Review',
    stylesheet: path.join(SOURCE_ROOT, 'components', 'history', 'history.style.css'),
    show: (): Promise<HTMLElement> => {
      renderReview();

      return screen.findByTestId('history-screen');
    },
  },
];

const renderSmokeWizard = () =>
  render(
    <CssVarsProvider theme={appTheme}>
      <DesignSurface>
        <ApiClientProvider client={createApiClient(createFakeBackend())}>
          <SnackbarProvider>
            <Smoke />
          </SnackbarProvider>
        </ApiClientProvider>
      </DesignSurface>
    </CssVarsProvider>
  );

const renderReview = () =>
  render(
    <ApiClientProvider client={createApiClient(createFakeBackend())}>
      <SnackbarProvider>
        <History />
      </SnackbarProvider>
    </ApiClientProvider>
  );

const renderBar = () =>
  render(
    <CssVarsProvider theme={appTheme}>
      <DesignSurface>
        <BottomBar
          currentScreen={Screens.HOME}
          smokeOnClick={jest.fn()}
          historyOnClick={jest.fn()}
          settingsOnClick={jest.fn()}
        />
      </DesignSurface>
    </CssVarsProvider>
  );

const renderSettingsScreen = () =>
  render(
    <CssVarsProvider theme={appTheme}>
      <DesignSurface>
        <ApiClientProvider client={createApiClient(createFakeBackend())}>
          <SnackbarProvider>
            <Settings />
          </SnackbarProvider>
        </ApiClientProvider>
      </DesignSurface>
    </CssVarsProvider>
  );

/** A computed length in pixels, as a number; anything else counts as none. */
const pixels = (length: string): number => Number.parseFloat(length) || 0;

/**
 * What a screen asks the viewport for, against what the bar leaves it.
 *
 * The reservation gives the bar's height back in flow, so a screen has
 * `100vh - BOTTOM_BAR_HEIGHT` to lay itself out in — all of it, the whole
 * screen, not each box within the screen separately. A viewport claim made by
 * something *inside* a screen is measured as though that box were alone on the
 * page, while whatever the screen stacks above it still has to come out of the
 * same viewport: the Smoke wizard's step asked for `93vh - 56px` with an 80px
 * stepper above it and the 56px reservation below, which is more than one
 * viewport on every phone-sized screen and scrolls by the difference.
 *
 * So the claim belongs to the outermost box of a screen, where it covers
 * everything the screen stacks, and it may be no larger than what the
 * reservation leaves.
 */
describe('the viewport a screen claims', () => {
  it.each(screens)(
    '$name asks for no more of it than the bar leaves the whole screen',
    async ({ stylesheet, show }) => {
      const root = await show();
      const claims = viewportClaims(declarationsOf(stylesheet));

      expect(claims).not.toHaveLength(0);
      expect(claims.filter(claim => !root.matches(claim.selector))).toEqual([]);
      PHONE_HEIGHTS.forEach(viewport =>
        claims.forEach(claim =>
          expect(claimedPixels(claim.height, viewport) + BOTTOM_BAR_HEIGHT).toBeLessThanOrEqual(
            viewport
          )
        )
      );
    }
  );
});
