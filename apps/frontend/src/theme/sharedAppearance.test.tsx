/**
 * The appearance as one installation-wide preference, seen from the page.
 *
 * These assertions are about the colour an operator is looking at and about
 * what a second browser finds when it opens, not about which hook was called.
 * The backend is the fake one every other API test uses, so "another browser
 * chose dark" is modelled by the value actually sitting in the store.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { stubSystemColorScheme } from 'theme/src/testing/systemColorScheme';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../api';
import { FakeBackend, createFakeBackend } from '../api/fakeBackend';
import { Settings } from '../components/settings/settings';
import { DesignSurface, appTheme, carbonDark, carbonLight } from '.';
import { SharedAppearanceProvider } from './SharedAppearance';

let system: ReturnType<typeof stubSystemColorScheme>;

beforeEach(() => {
  localStorage.clear();
  system = stubSystemColorScheme(false);
});
afterEach(() => system.restore());

/** The settings page, themed and wired exactly as the application root wires it. */
const renderApp = (backend: FakeBackend) =>
  render(
    <CssVarsProvider theme={appTheme} defaultMode="system">
      <ApiClientProvider client={createApiClient(backend)}>
        <SharedAppearanceProvider>
          <DesignSurface>
            <SnackbarProvider>
              <Settings />
            </SnackbarProvider>
          </DesignSurface>
        </SharedAppearanceProvider>
      </ApiClientProvider>
    </CssVarsProvider>
  );

const page = () => screen.getByTestId('settings-page');
const option = (name: 'Light' | 'Dark' | 'Auto') => screen.getByRole('button', { name });

describe('a browser opening an installation where dark was chosen elsewhere', () => {
  it('ends up dark, without ever being told by this browser', async () => {
    const backend = createFakeBackend({
      appSettings: { settings: { appearance: { mode: 'dark', resolvedMode: 'dark' } } },
    });

    renderApp(backend);

    await waitFor(() => expect(page()).toHaveStyle({ backgroundColor: carbonDark.background }));
    expect(option('Dark')).toHaveAttribute('aria-pressed', 'true');
  });

  /**
   * The local cache is the render source; the backend is a synchronisation
   * channel. The first paint must therefore be the cached scheme, whatever the
   * installation turns out to hold — anything else is the flash this design
   * exists to prevent.
   */
  it('paints its own cached scheme first', async () => {
    const backend = createFakeBackend({
      appSettings: { settings: { appearance: { mode: 'dark', resolvedMode: 'dark' } } },
    });

    renderApp(backend);

    expect(page()).toHaveStyle({ backgroundColor: carbonLight.background });
    await waitFor(() => expect(page()).toHaveStyle({ backgroundColor: carbonDark.background }));
  });
});

describe('choosing an option', () => {
  it('publishes the choice for every other client to find', async () => {
    const backend = createFakeBackend();
    renderApp(backend);
    await screen.findByText('Appearance');

    await userEvent.click(option('Dark'));

    await waitFor(() =>
      expect(backend.store.appSettings).toMatchObject({
        appearance: { mode: 'dark', resolvedMode: 'dark' },
      })
    );
  });

  it('is in effect in the next browser that loads the app', async () => {
    const backend = createFakeBackend();
    const view = renderApp(backend);
    await screen.findByText('Appearance');
    await userEvent.click(option('Dark'));
    await waitFor(() => expect(backend.store.appSettings).toBeDefined());
    view.unmount();

    // A second browser: nothing carried over but what the installation stored.
    localStorage.clear();
    renderApp(backend);

    await waitFor(() => expect(page()).toHaveStyle({ backgroundColor: carbonDark.background }));
  });
});

describe('an installation whose backend cannot be reached', () => {
  it('still themes the page from the cached scheme', async () => {
    const backend = createFakeBackend();
    backend.injectFault({ method: 'get', path: 'appSettings', status: 500 });

    renderApp(backend);

    await screen.findByText('Appearance');
    expect(page()).toHaveStyle({ backgroundColor: carbonLight.background });
  });
});
