/**
 * The colour scheme the application renders in is decided at the root.
 *
 * Each screen is replaced with the same probe, which reports the theme it is
 * handed — the design tokens it carries and the text colour it paints with — so
 * the assertions are about what the app gives its children rather than about how
 * any screen paints itself. With nothing stored, a browser follows the device;
 * and now that every screen has been recoloured, every one of them is handed the
 * scheme in effect rather than being held on the light palette.
 */
import { useTheme } from '@mui/material/styles';
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
 * Smoke and History used to be held on the light palette whatever the device
 * asked for, because they were still painted against a light-grey shell. They
 * are recoloured now, so the scheme reaches them like everything else: the very
 * point of the slice is that no screen stays light when the device asks for
 * dark.
 */
describe('the screen the app opens on, on a device asking for dark', () => {
  it('is handed the dark design tokens', () => {
    renderAppOnADeviceThatIs('dark');

    expect(screen.getByTestId('probe')).toHaveAttribute('data-background', carbonDark.background);
  });

  it('is handed the dark palette to paint its text with', () => {
    renderAppOnADeviceThatIs('dark');

    expect(screen.getByTestId('probe')).toHaveAttribute('data-text', carbonDark.text);
  });
});
