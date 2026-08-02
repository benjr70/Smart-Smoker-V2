/**
 * Choosing how the app looks.
 *
 * The whole Settings page is rendered under the colour-scheme provider the
 * application root uses, so these assertions describe what an operator sees and
 * what changes when they choose — not which hook the card happens to call. The
 * page's own background is the evidence that a choice was applied, because that
 * is the surface the operator is looking at.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { stubSystemColorScheme } from 'theme/src/testing/systemColorScheme';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../api';
import { createFakeBackend } from '../../api/fakeBackend';
import { appTheme, carbonDark, carbonLight } from '../../theme';
import { Settings } from './settings';

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

const option = (name: 'Light' | 'Dark' | 'Auto') => screen.getByRole('button', { name });

describe('the Appearance control', () => {
  it('offers light, dark and following the device', async () => {
    renderSettings();

    await screen.findByText('Appearance');
    expect(option('Light')).toBeInTheDocument();
    expect(option('Dark')).toBeInTheDocument();
    expect(option('Auto')).toBeInTheDocument();
  });

  /** The mock raises the active option onto a surface of its own. */
  it('raises the option in effect onto a surface, leaving the others on the track', async () => {
    renderSettings();
    await screen.findByText('Appearance');

    expect(option('Auto')).toHaveStyle({ backgroundColor: carbonLight.surface });
    expect(option('Dark')).not.toHaveStyle({ backgroundColor: carbonLight.surface });
  });

  it('shows which of them is in effect', async () => {
    renderSettings();

    await screen.findByText('Appearance');
    expect(option('Auto')).toHaveAttribute('aria-pressed', 'true');
    expect(option('Dark')).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('the sentence under the control', () => {
  const explanation = () => screen.getByTestId('settings-appearance-explanation');

  it('names the scheme in effect while the device is being followed', async () => {
    system.setDark(true);
    renderSettings();

    await screen.findByText('Appearance');
    expect(explanation()).toHaveTextContent('Following your device — currently dark.');
  });

  it('says the choice overrides the device once one has been made', async () => {
    renderSettings();
    await screen.findByText('Appearance');

    await userEvent.click(option('Light'));

    expect(explanation()).toHaveTextContent('Always light, regardless of your device setting.');
  });
});

describe('choosing a scheme', () => {
  const pageBackground = () => screen.getByTestId('settings-page');

  it('repaints the page there and then', async () => {
    renderSettings();
    await screen.findByText('Appearance');
    expect(pageBackground()).toHaveStyle({ backgroundColor: carbonLight.background });

    await userEvent.click(option('Dark'));

    expect(pageBackground()).toHaveStyle({ backgroundColor: carbonDark.background });
  });

  it("takes the page's cards and text with it", async () => {
    renderSettings();
    await screen.findByText('Appearance');

    await userEvent.click(option('Dark'));

    expect(screen.getByTestId('settings-page')).toHaveStyle({ color: carbonDark.text });
    expect(screen.getByTestId('settings-version-card')).toHaveStyle({
      backgroundColor: carbonDark.surface,
      borderColor: carbonDark.border,
    });
  });

  it('is still in effect when the page is loaded again', async () => {
    const { unmount } = renderSettings();
    await screen.findByText('Appearance');
    await userEvent.click(option('Dark'));
    unmount();

    // A second load of the app, with nothing carried over but what was stored.
    renderSettings();

    await screen.findByText('Appearance');
    expect(option('Dark')).toHaveAttribute('aria-pressed', 'true');
    expect(pageBackground()).toHaveStyle({ backgroundColor: carbonDark.background });
  });
});

describe('a device whose colour preference changes while the app is open', () => {
  it('re-paints the page when the app is following the device', async () => {
    renderSettings();
    await screen.findByText('Appearance');
    expect(screen.getByTestId('settings-page')).toHaveStyle({
      backgroundColor: carbonLight.background,
    });

    act(() => system.setDark(true));

    expect(screen.getByTestId('settings-page')).toHaveStyle({
      backgroundColor: carbonDark.background,
    });
    expect(screen.getByTestId('settings-appearance-explanation')).toHaveTextContent(
      'Following your device — currently dark.'
    );
  });

  it('leaves the page alone when a scheme was chosen outright', async () => {
    renderSettings();
    await screen.findByText('Appearance');
    await userEvent.click(option('Light'));

    act(() => system.setDark(true));

    expect(screen.getByTestId('settings-page')).toHaveStyle({
      backgroundColor: carbonLight.background,
    });
  });
});
