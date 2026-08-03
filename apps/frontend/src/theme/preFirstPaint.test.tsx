/**
 * No flash of the wrong colour scheme on reload (AC 4).
 *
 * The application only decides which scheme applies once its bundle has run, so
 * the page it is served in has to arrive already in that scheme — and has to be
 * painted in it, since a scheme the served page merely records paints nothing
 * and the white page flashes anyway. These tests let the app settle on a scheme,
 * wipe the document back to how the browser would hand it over on the next load,
 * serve it again — the page's own stylesheets and its own initialisation script,
 * nothing of the application — and require both that the document comes back to
 * exactly the state the app ends up in and that the page is painted in the
 * scheme's background before a line of the application has run.
 *
 * Nothing here names a storage key or an attribute: what matters is that the
 * page and the app agree, whatever they agree through.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { stubSystemColorScheme } from 'theme/src/testing/systemColorScheme';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../api';
import { createFakeBackend } from '../api/fakeBackend';
import { Settings } from '../components/settings/settings';
import { DesignSurface, appTheme, carbonDark, carbonLight } from './index';

const HTML_TEMPLATE = path.resolve(__dirname, '../../public/index.html');

const template = (): string => fs.readFileSync(HTML_TEMPLATE, 'utf8');

/** Every inline script the served page runs before the bundle does. */
const inlineScripts = (): string[] =>
  Array.from(template().matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)).map(
    match => match[1]
  );

/** Every stylesheet the served page carries in itself, ahead of the bundle. */
const inlineStyles = (): string[] =>
  Array.from(template().matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)).map(match => match[1]);

/**
 * Hand the document over the way the browser hands it over on a reload: wiped
 * clean of everything the last run left on it, then given the served page's own
 * stylesheets and its own initialisation script — and nothing else, because a
 * test that reimplemented either would pass while the served page did nothing.
 */
let servedStyles: HTMLStyleElement[] = [];

const serveThePage = (): void => {
  Array.from(document.documentElement.attributes).forEach(attribute =>
    document.documentElement.removeAttribute(attribute.name)
  );
  servedStyles.forEach(style => style.remove());

  servedStyles = inlineStyles().map(css => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    return style;
  });

  // eslint-disable-next-line no-new-func
  inlineScripts().forEach(source => new Function(source)());
};

/** How the served page leaves the document, before any application code runs. */
const asServed = (): Record<string, string> => {
  serveThePage();
  return attributesOfTheDocument();
};

/** The colour the served page paints itself, as the browser computes it. */
const paintedBackground = (): string => getComputedStyle(document.documentElement).backgroundColor;

/** A design token as a browser reports it back from a computed style. */
const asRendered = (hex: string): string => {
  const [, r, g, b] = /^#(\w{2})(\w{2})(\w{2})$/.exec(hex) ?? [];
  return `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`;
};

const attributesOfTheDocument = (): Record<string, string> =>
  Object.fromEntries(
    Array.from(document.documentElement.attributes).map(attribute => [
      attribute.name,
      attribute.value,
    ])
  );

let system: ReturnType<typeof stubSystemColorScheme>;

beforeEach(() => {
  localStorage.clear();
  system = stubSystemColorScheme(false);
});
afterEach(() => system.restore());

/** The settings page, themed exactly as the application root themes it. */
const renderSettings = () => {
  const client = createApiClient(createFakeBackend());
  return render(
    <CssVarsProvider theme={appTheme} defaultMode="system">
      <DesignSurface>
        <ApiClientProvider client={client}>
          <SnackbarProvider>
            <Settings />
          </SnackbarProvider>
        </ApiClientProvider>
      </DesignSurface>
    </CssVarsProvider>
  );
};

describe('the page the application is served in', () => {
  it('is already in the scheme the device asks for', async () => {
    system.setDark(true);
    renderSettings();
    await screen.findByText('Appearance');
    const afterTheAppRan = attributesOfTheDocument();

    expect(asServed()).toEqual(afterTheAppRan);
  });

  it('is already in the scheme that was last chosen', async () => {
    const { unmount } = renderSettings();
    await screen.findByText('Appearance');
    await userEvent.click(screen.getByRole('button', { name: 'Dark' }));
    const afterTheAppRan = attributesOfTheDocument();
    unmount();

    expect(asServed()).toEqual(afterTheAppRan);
  });
});

/**
 * Recording the scheme is not enough. The flash this exists to prevent is a
 * painted one, and the application's own colours only arrive with its bundle —
 * so the page has to carry enough of the palette to paint itself.
 */
describe('the colour the page is painted before the application runs', () => {
  it('is the dark background when the device asks for dark', () => {
    system.setDark(true);

    serveThePage();

    expect(paintedBackground()).toBe(asRendered(carbonDark.background));
  });

  it('is the light background when the device asks for light', () => {
    serveThePage();

    expect(paintedBackground()).toBe(asRendered(carbonLight.background));
  });

  it('is the dark background when dark was last chosen, whatever the device says', async () => {
    const { unmount } = renderSettings();
    await screen.findByText('Appearance');
    await userEvent.click(screen.getByRole('button', { name: 'Dark' }));
    unmount();

    serveThePage();

    expect(paintedBackground()).toBe(asRendered(carbonDark.background));
  });

  /**
   * The page carries those colours as literals — it has no bundle to read tokens
   * from — so they are only right for as long as they match the palette the
   * application paints with once it has loaded.
   */
  it('is the very colour the application goes on to paint that scheme with', async () => {
    renderSettings();
    await screen.findByText('Appearance');
    await userEvent.click(screen.getByRole('button', { name: 'Dark' }));

    expect(screen.getByTestId('settings-page')).toHaveStyle({
      backgroundColor: carbonDark.background,
    });
  });
});
