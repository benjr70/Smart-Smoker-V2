/**
 * No flash of the wrong colour scheme on reload (AC 4).
 *
 * The application only decides which scheme applies once its bundle has run, so
 * the page it is served in has to arrive already in that scheme. These tests let
 * the app settle on a scheme, wipe the document back to how the browser would
 * hand it over on the next load, run the page's own initialisation script, and
 * require the document to come back to exactly the state the app ends up in.
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
import { appTheme } from './index';

const HTML_TEMPLATE = path.resolve(__dirname, '../../public/index.html');

/** Every inline script the served page runs before the bundle does. */
const inlineScripts = (): string[] =>
  Array.from(
    fs
      .readFileSync(HTML_TEMPLATE, 'utf8')
      .matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)
  ).map(match => match[1]);

/** How the served page leaves the document, before any application code runs. */
const asServed = (): Record<string, string> => {
  Array.from(document.documentElement.attributes).forEach(attribute =>
    document.documentElement.removeAttribute(attribute.name)
  );

  // Running the page's own script is the whole point: a test that reimplemented
  // it would pass while the served page did nothing.
  // eslint-disable-next-line no-new-func
  inlineScripts().forEach(source => new Function(source)());

  return attributesOfTheDocument();
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
      <ApiClientProvider client={client}>
        <SnackbarProvider>
          <Settings />
        </SnackbarProvider>
      </ApiClientProvider>
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
