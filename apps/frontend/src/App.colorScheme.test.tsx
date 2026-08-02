/**
 * The colour scheme the application renders in is decided at the root.
 *
 * Each screen is replaced with the same probe, which reports the design tokens
 * the theme it is handed carries, so the assertion is about what the app gives
 * its children rather than about how any screen paints itself. With nothing
 * stored, a browser follows the device (AC 7).
 */
import { useTheme } from '@mui/material/styles';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { stubSystemColorScheme } from 'theme/src/testing/systemColorScheme';
import App from './App';
import { carbonDark, carbonLight } from './theme';

const Probe = (): JSX.Element => {
  const { design } = useTheme();
  return <div data-testid="probe" data-background={design?.background} />;
};

jest.mock('./components/smoke/smoke', () => ({ Smoke: () => <Probe /> }));
jest.mock('./components/history/history', () => ({ History: () => <Probe /> }));
jest.mock('./components/settings/settings', () => ({ Settings: () => <Probe /> }));
jest.mock('../src/components/bottomBar/bottombar', () => ({ BottomBar: () => <nav /> }));

let system: ReturnType<typeof stubSystemColorScheme>;

afterEach(() => system.restore());

const renderAppOnADeviceThatIs = (preference: 'light' | 'dark'): void => {
  localStorage.clear();
  system = stubSystemColorScheme(preference === 'dark');
  render(<App />);
};

describe('the colour scheme a browser renders in with nothing stored', () => {
  it('is dark when the device asks for dark', () => {
    renderAppOnADeviceThatIs('dark');

    expect(screen.getByTestId('probe')).toHaveAttribute('data-background', carbonDark.background);
  });

  it('is light when the device asks for light', () => {
    renderAppOnADeviceThatIs('light');

    expect(screen.getByTestId('probe')).toHaveAttribute('data-background', carbonLight.background);
  });
});
