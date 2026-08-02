/**
 * The theme is provided by the application root, not by any one screen.
 *
 * Each screen is replaced with the same probe — an ordinary Material-UI surface
 * — so the assertion is about what the app hands its children rather than about
 * what any particular screen builds for itself.
 */
import { Card } from '@mui/material';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import App from './App';

const Probe = (): JSX.Element => <Card data-testid="probe">probe</Card>;

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

const designSurface = {
  backgroundColor: '#FFFFFF',
  borderColor: '#E2E2DF',
  borderRadius: '16px',
  boxShadow: 'none',
};

describe('App theming', () => {
  it('styles the screen it renders with the application theme', () => {
    render(<App />);

    expect(screen.getByTestId('probe')).toHaveStyle(designSurface);
  });

  it('keeps styling screens with it after navigating away from the first one', () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('settings-button'));

    expect(screen.getByTestId('probe')).toHaveStyle(designSurface);
  });
});
