import { ThemeProvider, createTheme } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../api';
import { createFakeBackend } from '../../api/fakeBackend';
import { appTheme } from '../../theme';
import { Settings } from './settings';

/**
 * Settings is rendered whole — real Material-UI, the real notifications card,
 * and the in-memory fake backend behind the injected API client — so these
 * assertions describe the page an operator sees rather than the components it
 * happens to be built from.
 */
const renderSettings = (wrap: (page: JSX.Element) => JSX.Element = page => page) => {
  const client = createApiClient(createFakeBackend({ notifications: { settings: [] } }));
  return render(
    <ApiClientProvider client={client}>
      <SnackbarProvider>{wrap(<Settings />)}</SnackbarProvider>
    </ApiClientProvider>
  );
};

describe('Settings page', () => {
  it('shows the page heading, the notifications card and the version card', async () => {
    renderSettings();

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(await screen.findByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Version')).toBeInTheDocument();
  });

  it('shows the build version the bundle was stamped with', () => {
    (globalThis as Record<string, unknown>).VERSION = '2.4.1';
    try {
      renderSettings();

      expect(screen.getByTestId('settings-version-value')).toHaveTextContent('2.4.1');
    } finally {
      delete (globalThis as Record<string, unknown>).VERSION;
    }
  });

  it('falls back to "unknown" when the build version was never stamped in', () => {
    renderSettings();

    expect(screen.getByTestId('settings-version-value')).toHaveTextContent('unknown');
  });

  /**
   * AC 3: the page must take its theme from the application, not build one of
   * its own. An enclosing theme that marks every card it styles proves it —
   * a theme constructed inside the page would shadow this one and the marks
   * would never reach the cards.
   */
  it('takes its card styling from the enclosing application theme', async () => {
    const markedTheme = createTheme({
      components: {
        MuiCardContent: { defaultProps: { 'data-testid': 'styled-by-application-theme' } as never },
      },
    });

    renderSettings(page => <ThemeProvider theme={markedTheme}>{page}</ThemeProvider>);
    await screen.findByText('Notifications');

    expect(screen.getAllByTestId('styled-by-application-theme')).toHaveLength(2);
  });

  it('paints the page with the design background and typeface', async () => {
    renderSettings(page => <ThemeProvider theme={appTheme}>{page}</ThemeProvider>);
    await screen.findByText('Notifications');

    const page = screen.getByTestId('settings-page');
    expect(page).toHaveStyle({ backgroundColor: '#F6F6F5', color: '#121212' });
    expect(getComputedStyle(page).fontFamily).toContain('Plus Jakarta Sans');
  });

  /**
   * AC 4: the cards are spaced by the page's stack alone. A card that brings
   * padding of its own sits in a wrapper, which is what takes the stack's gap —
   * leaving that card flush against the one above and widening its own gap.
   */
  it('gives every card the same gap, taken from the page stack', async () => {
    renderSettings(page => <ThemeProvider theme={appTheme}>{page}</ThemeProvider>);
    await screen.findByText('Notifications');

    expect(screen.getByTestId('settings-notifications-card')).toHaveStyle({ marginTop: '16px' });
    expect(screen.getByTestId('settings-version-card')).toHaveStyle({ marginTop: '16px' });
  });

  it("renders its cards as the mock's flat, hairline-bordered white surface", async () => {
    renderSettings(page => <ThemeProvider theme={appTheme}>{page}</ThemeProvider>);
    await screen.findByText('Notifications');

    expect(screen.getByTestId('settings-version-card')).toHaveStyle({
      backgroundColor: '#FFFFFF',
      borderColor: '#E2E2DF',
      borderRadius: '16px',
      boxShadow: 'none',
    });
  });
});
