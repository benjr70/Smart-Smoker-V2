/**
 * What the two touchscreen screens actually look like once the shared theme is
 * over them.
 *
 * These assertions are about computed colour on the controls an operator
 * touches, because that is the thing the recolour is for. Both screens are the
 * real ones; only the leaves that reach hardware or draw with D3 are stood in
 * for.
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { SessionConfig } from 'smoke-session/src';
import { SmokeSessionProvider } from 'smoke-session/src/react';
import {
  FakeCloudSocket,
  FakeDeviceFeed,
  FakeSessionApi,
  FakeWifiStatus,
  SteppingClock,
} from 'smoke-session/src/testing';
import { carbonDark } from 'theme/src';
import { Home } from '../components/home/home';
import { getConnection } from '../services/deviceService';
import { DeviceThemeProvider } from './DeviceThemeProvider';

jest.mock('../services/deviceService', () => ({
  connectToWiFi: jest.fn(),
  getConnection: jest.fn(),
}));

// The chart is a heavy D3 leaf, and this slice does not restyle it.
jest.mock('temperaturechart/src/tempChart', () => {
  return function MockTempChart() {
    return <div data-testid="temp-chart" />;
  };
});

// The on-screen keyboard is a third-party leaf with its own DOM.
jest.mock('react-simple-keyboard', () => {
  return function MockKeyboard() {
    return <div data-testid="mock-keyboard" />;
  };
});

const flushPromises = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

const sessionConfig = (): SessionConfig => ({
  role: 'smoker',
  socket: new FakeCloudSocket(),
  api: new FakeSessionApi(),
  clock: new SteppingClock(),
  deviceFeed: new FakeDeviceFeed(),
  wifi: { port: new FakeWifiStatus(), throttleMs: 0 },
});

const renderTouchscreen = async (): Promise<void> => {
  render(
    <DeviceThemeProvider>
      <SmokeSessionProvider config={sessionConfig()}>
        <Home />
      </SmokeSessionProvider>
    </DeviceThemeProvider>
  );
  await act(async () => {
    await flushPromises();
  });
};

const openWifiScreen = async (): Promise<void> => {
  fireEvent.click(screen.getByLabelText('wifi connected'));
  await act(async () => {
    await flushPromises();
  });
};

beforeEach(() => {
  (getConnection as jest.Mock).mockResolvedValue([]);
});

describe('the home screen under the shared theme', () => {
  it('paints its primary action in the dark accent', async () => {
    await renderTouchscreen();

    expect(screen.getByTestId('smoker-start-button')).toHaveStyle({
      backgroundColor: carbonDark.accent,
    });
  });
});

/**
 * The mock's rebuilt touchscreen — a status pill, an elapsed clock, a reading
 * column, a chart card with a legend — is a later piece of work. Recolouring it
 * must not smuggle any of that in, so the screen is still the two actions it
 * always was, with nothing on it that counts.
 */
describe('what the recolour adds to the home screen', () => {
  it('adds no control beyond the two the screen already had', async () => {
    await renderTouchscreen();

    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('adds no elapsed clock', async () => {
    await renderTouchscreen();

    expect(screen.queryByText(/\d+:\d{2}/)).toBeNull();
  });
});

describe('the wifi screen under the shared theme', () => {
  it('shows its inputs and paints its connect action in the dark accent', async () => {
    await renderTouchscreen();
    await openWifiScreen();

    expect(screen.getByLabelText('SSid')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toHaveStyle({
      backgroundColor: carbonDark.accent,
    });
  });
});
