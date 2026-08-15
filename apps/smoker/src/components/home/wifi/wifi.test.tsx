/**
 * The wifi setup screen, exercised the way an operator uses it: tap a field,
 * tap real key caps on the on-screen keyboard, tap Connect, watch the status.
 *
 * The keyboard is the real wrapper (and the real library under it) — the suite
 * taps visible caps and never names either. The only mocked seam is the
 * device-service boundary the screen connects through.
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { connectToWiFi, getConnection } from '../../../services/deviceService';
import { Wifi } from './wifi';

jest.mock('../../../services/deviceService', () => ({
  connectToWiFi: jest.fn(),
  getConnection: jest.fn(),
}));

const mockConnectToWiFi = connectToWiFi as jest.MockedFunction<typeof connectToWiFi>;
const mockGetConnection = getConnection as jest.MockedFunction<typeof getConnection>;

(global as any).VERSION = '1.0.0';

const renderWifi = () => {
  const onBack = jest.fn();
  render(<Wifi onBack={onBack} />);
  return { onBack };
};

/** Tap the keyboard key whose cap reads `label`, exactly as a thumb would. */
const tap = (label: string) => fireEvent.click(screen.getByText(label));

const networkField = () => screen.getByRole('button', { name: /network/i });
const passwordField = () => screen.getByRole('button', { name: /password/i });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetConnection.mockResolvedValue([]);
});

describe('the header', () => {
  it('carries the title, and the back button leaves the screen', async () => {
    const { onBack } = renderWifi();

    expect(screen.getByText('Wi-Fi Setup')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledWith(0);

    // Let the mount-time connection read settle before unmount.
    await screen.findByText('Not connected');
  });
});

describe('typing routes to the focused field', () => {
  it('lands in the network field by default, and follows a mid-entry switch', async () => {
    renderWifi();

    // The network field starts active: typed caps land there.
    tap('m');
    tap('y');
    expect(within(networkField()).getByText('my')).toBeInTheDocument();

    // Switch to the password mid-entry; the next caps land there, masked.
    fireEvent.click(passwordField());
    tap('p');
    tap('w');
    expect(within(passwordField()).getByText('••')).toBeInTheDocument();

    // And back: the network keeps what it had and takes the next character.
    fireEvent.click(networkField());
    tap('5');
    expect(within(networkField()).getByText('my5')).toBeInTheDocument();
    expect(within(passwordField()).getByText('••')).toBeInTheDocument();

    await screen.findByText('Not connected');
  });

  it('backspace erases from whichever field is active', async () => {
    renderWifi();

    tap('a');
    tap('b');
    tap('⌫');
    expect(within(networkField()).getByText('a')).toBeInTheDocument();

    fireEvent.click(passwordField());
    tap('x');
    tap('y');
    tap('⌫');
    expect(within(passwordField()).getByText('•')).toBeInTheDocument();
    // The network field was untouched by the password erase.
    expect(within(networkField()).getByText('a')).toBeInTheDocument();

    await screen.findByText('Not connected');
  });

  it('shows the accent state and caret only on the active field', async () => {
    renderWifi();

    // The network field starts active and carries the caret.
    expect(networkField().className).toContain('wifiFieldActive');
    expect(passwordField().className).not.toContain('wifiFieldActive');
    expect(within(networkField()).getByTestId('wifi-caret')).toBeInTheDocument();

    fireEvent.click(passwordField());
    expect(passwordField().className).toContain('wifiFieldActive');
    expect(networkField().className).not.toContain('wifiFieldActive');
    expect(within(passwordField()).getByTestId('wifi-caret')).toBeInTheDocument();
    expect(within(networkField()).queryByTestId('wifi-caret')).not.toBeInTheDocument();

    await screen.findByText('Not connected');
  });
});

describe('a password with symbols', () => {
  it('reaches the symbols layer, types them, and Connect sends the credentials as typed', async () => {
    mockConnectToWiFi.mockResolvedValue({ success: true });
    mockGetConnection.mockResolvedValue([]);
    renderWifi();

    tap('h');
    tap('q');

    fireEvent.click(passwordField());
    // Mixed case, a digit, and symbols — a real wifi password.
    tap('⇧');
    tap('P');
    tap('⇧');
    tap('a');
    tap('7');
    tap('?123');
    tap('@');
    tap('#');
    tap('ABC');
    tap('z');

    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

    await waitFor(() =>
      expect(mockConnectToWiFi).toHaveBeenCalledWith({ ssid: 'hq', password: 'Pa7@#z' })
    );
    // Let the attempt reach its final state before the test ends.
    await screen.findByText('Connected: hq');
  });

  it('keeps the digit row available on every layer', async () => {
    renderWifi();

    fireEvent.click(passwordField());
    tap('1');
    tap('⇧');
    tap('2');
    tap('?123');
    tap('3');

    expect(within(passwordField()).getByText('•••')).toBeInTheDocument();

    await screen.findByText('Not connected');
  });
});

describe('the connection status', () => {
  it('shows the connected network found at mount, in the connected state', async () => {
    mockGetConnection.mockResolvedValue([{ ssid: 'HomeNet', status: 'connected' }]);
    renderWifi();

    await screen.findByText('Connected: HomeNet');
    expect(screen.getByTestId('wifi-status').className).toContain('wifiStatus-connected');
  });

  it('shows not-connected when nothing is connected at mount', async () => {
    mockGetConnection.mockResolvedValue([]);
    renderWifi();

    await screen.findByText('Not connected');
    expect(screen.getByTestId('wifi-status').className).toContain('wifiStatus-idle');
  });

  it('walks connecting → connected through a successful attempt', async () => {
    let finishConnect: (value: unknown) => void = () => undefined;
    mockConnectToWiFi.mockReturnValue(
      new Promise(resolve => {
        finishConnect = resolve;
      }) as Promise<unknown>
    );
    mockGetConnection
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ssid: 'NewNet', status: 'connected' }]);
    renderWifi();

    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

    await screen.findByText('Connecting…');
    expect(screen.getByTestId('wifi-status').className).toContain('wifiStatus-connecting');
    // While connecting, the button is held down so a second tap cannot overlap.
    expect(screen.getByRole('button', { name: /^connect$/i })).toBeDisabled();

    finishConnect({ success: true });

    await screen.findByText('Connected: NewNet');
    expect(screen.getByTestId('wifi-status').className).toContain('wifiStatus-connected');
  });

  it('shows the failure reason from the device service in the failed state', async () => {
    mockConnectToWiFi.mockRejectedValue({
      response: { data: { error: 'Invalid credentials' } },
    });
    renderWifi();

    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

    await screen.findByText('Invalid credentials');
    expect(screen.getByTestId('wifi-status').className).toContain('wifiStatus-failed');
  });

  it('falls back to the error message, then a generic reason, when the failure carries less', async () => {
    mockConnectToWiFi.mockRejectedValueOnce(new Error('Network timeout'));
    const { unmount } = render(<Wifi onBack={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));
    await screen.findByText('Network timeout');
    unmount();

    mockConnectToWiFi.mockRejectedValueOnce({});
    render(<Wifi onBack={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));
    await screen.findByText('Connection error');
  });

  it('survives the mount-time connection read failing', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    const error = new Error('Connection check failed');
    mockGetConnection.mockRejectedValue(error);

    renderWifi();

    await waitFor(() => expect(consoleLogSpy).toHaveBeenCalledWith(error));
    expect(screen.getByText('Not connected')).toBeInTheDocument();

    consoleLogSpy.mockRestore();
  });

  it('names the network as entered when the post-connect read comes back empty', async () => {
    mockConnectToWiFi.mockResolvedValue({ success: true });
    mockGetConnection.mockResolvedValue([]);
    renderWifi();

    tap('h');
    tap('q');
    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

    await screen.findByText('Connected: hq');
  });
});

describe('the version line', () => {
  it('shows the application version', async () => {
    renderWifi();

    expect(screen.getByText('Version: 1.0.0')).toBeInTheDocument();

    await screen.findByText('Not connected');
  });

  it('says unknown when the build carries no version', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    const originalVersion = (global as any).VERSION;
    delete (global as any).VERSION;

    renderWifi();

    expect(screen.getByText('Version: unknown')).toBeInTheDocument();
    expect(consoleLogSpy).toHaveBeenCalledWith('Cannot get version of application.');

    (global as any).VERSION = originalVersion;
    consoleLogSpy.mockRestore();
    await screen.findByText('Not connected');
  });
});
