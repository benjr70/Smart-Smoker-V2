/**
 * The colour scheme the application renders in is decided at the root.
 *
 * Each screen is replaced with the same probe, which reports the theme it is
 * handed — the design tokens it carries and the text colour it paints with — so
 * the assertions are about what the app gives its children rather than about how
 * any screen paints itself. With nothing stored, a browser follows the device
 * (AC 7); and the screens this slice does not restyle stay on the light palette
 * whatever the device says.
 */
import { createTheme, useTheme } from '@mui/material/styles';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { stubSystemColorScheme } from 'theme/src/testing/systemColorScheme';
import App from './App';
import { carbonDark, carbonLight } from './theme';

const Probe = (): JSX.Element => {
  const { design, palette } = useTheme();
  return (
    <div
      data-testid="probe"
      data-background={design?.background}
      data-text={palette.text.primary}
    />
  );
};

jest.mock('./components/smoke/smoke', () => ({ Smoke: () => <Probe /> }));
jest.mock('./components/history/history', () => ({ History: () => <Probe /> }));
jest.mock('./components/settings/settings', () => ({ Settings: () => <Probe /> }));
jest.mock('../src/components/bottomBar/bottombar', () => ({
  BottomBar: ({ settingsOnClick }: { settingsOnClick: () => void }) => (
    <button onClick={settingsOnClick}>Settings</button>
  ),
}));

let system: ReturnType<typeof stubSystemColorScheme>;

afterEach(() => system.restore());

const renderAppOnADeviceThatIs = (preference: 'light' | 'dark'): void => {
  localStorage.clear();
  system = stubSystemColorScheme(preference === 'dark');
  render(<App />);
};

/** The Settings screen, the only one this slice restyles. */
const openSettings = (): Promise<void> => userEvent.click(screen.getByText('Settings'));

describe('the colour scheme a browser renders a restyled screen in with nothing stored', () => {
  it('is dark when the device asks for dark', async () => {
    renderAppOnADeviceThatIs('dark');
    await openSettings();

    expect(screen.getByTestId('probe')).toHaveAttribute('data-background', carbonDark.background);
  });

  it('is light when the device asks for light', async () => {
    renderAppOnADeviceThatIs('light');
    await openSettings();

    expect(screen.getByTestId('probe')).toHaveAttribute('data-background', carbonLight.background);
  });
});

/**
 * Smoke, History and the bottom navigation are not restyled in this slice: they
 * are still painted against the light-grey shell `App.css` gives them. Handing
 * them the dark scheme would paint near-white Material-UI text and outlines onto
 * that light grey, so the root keeps them on the light palette — in the literal
 * colours Material-UI paints with, not in references to the scheme in effect.
 */
describe('the screens this slice does not restyle, on a device asking for dark', () => {
  it('are handed the palette Material-UI paints with out of the box', () => {
    renderAppOnADeviceThatIs('dark');

    expect(screen.getByTestId('probe')).toHaveAttribute(
      'data-text',
      createTheme().palette.text.primary
    );
  });

  it('are handed the light design tokens, so nothing on them reaches for a dark one', () => {
    renderAppOnADeviceThatIs('dark');

    expect(screen.getByTestId('probe')).toHaveAttribute('data-background', carbonLight.background);
  });
});
