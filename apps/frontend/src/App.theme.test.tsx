/**
 * The theme is provided by the application root, not by any one screen.
 *
 * Each screen is replaced with the same probe, which reports the design tokens
 * the theme it is handed carries — so the assertion is about what the app gives
 * its children rather than about what any particular screen builds for itself.
 * A screen mounted outside a provider would see Material-UI's default theme,
 * which carries no tokens at all.
 */
import { useTheme } from '@mui/material/styles';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import App from './App';
import { carbonLight } from './theme';

const Probe = (): JSX.Element => {
  const { design } = useTheme();
  return (
    <div data-testid="probe" data-accent={design?.accent} data-background={design?.background} />
  );
};

jest.mock('./components/smoke/smoke', () => ({ Smoke: () => <Probe /> }));
jest.mock('./components/history/history', () => ({ History: () => <Probe /> }));
jest.mock('./components/settings/settings', () => ({ Settings: () => <Probe /> }));
jest.mock('../src/components/bottomBar/bottombar', () => ({
  BottomBar: ({ settingsOnClick }: { settingsOnClick: () => void }) => (
    <button data-testid="settings-button" onClick={settingsOnClick}>
      Settings
    </button>
  ),
}));

const carriesTheDesignTokens = (): void => {
  const probe = screen.getByTestId('probe');
  expect(probe).toHaveAttribute('data-accent', carbonLight.accent);
  expect(probe).toHaveAttribute('data-background', carbonLight.background);
};

describe('App theming', () => {
  it('hands the application theme to the screen it renders', () => {
    render(<App />);

    carriesTheDesignTokens();
  });

  it('keeps handing it to screens after navigating away from the first one', () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('settings-button'));

    carriesTheDesignTokens();
  });
});
