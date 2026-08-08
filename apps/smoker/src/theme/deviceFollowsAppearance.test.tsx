/**
 * The colour the touchscreen is actually painted, as the appearance chosen on a
 * phone reaches it.
 *
 * The home screen is replaced with a probe reporting the theme it is handed, so
 * these assertions are about what the application gives its screens rather than
 * about how any one screen paints itself. The boot read and the announcement
 * channel are injected, so what reaches the panel is stated without HTTP or a
 * socket.
 */
import { useTheme } from '@mui/material/styles';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { AppearancePreference, carbonDark, carbonLight } from 'theme/src';
import { createApiClient } from '../api/client';
import { createFakeBackend } from '../api/fakeBackend';
import { DeviceThemeProvider } from './DeviceThemeProvider';

const Probe = (): JSX.Element => {
  const { design } = useTheme();
  return <div data-testid="probe" data-background={design?.background} />;
};

/** A backend whose read this test resolves by hand. */
const createPendingBackend = () => {
  let settle: (value: AppearancePreference) => void = () => undefined;
  return {
    get: () => new Promise<AppearancePreference>(resolve => (settle = resolve)),
    answer: (preference: AppearancePreference) => settle(preference),
  };
};

const createChannel = () => {
  const listeners: Array<(preference: AppearancePreference) => void> = [];
  return {
    subscribe: (listener: (preference: AppearancePreference) => void) => {
      listeners.push(listener);
      return () => {
        listeners.splice(listeners.indexOf(listener), 1);
      };
    },
    announce: (preference: AppearancePreference) =>
      listeners.forEach(listener => listener(preference)),
  };
};

const painted = () => screen.getByTestId('probe').getAttribute('data-background');

describe('the touchscreen following the installation', () => {
  /**
   * The panel is 800x480 in a garage and the backend is across a tailnet. Until
   * it answers there is nothing to render but the scheme the garage is lit for.
   */
  it('is dark before the backend has said anything', () => {
    const backend = createPendingBackend();

    render(
      <DeviceThemeProvider appearance={{ client: backend }}>
        <Probe />
      </DeviceThemeProvider>
    );

    expect(painted()).toBe(carbonDark.background);
  });

  it('renders the resolved value it read at boot', async () => {
    const backend = createPendingBackend();
    render(
      <DeviceThemeProvider appearance={{ client: backend }}>
        <Probe />
      </DeviceThemeProvider>
    );

    backend.answer({ mode: 'light', resolvedMode: 'light' });

    await waitFor(() => expect(painted()).toBe(carbonLight.background));
  });

  /**
   * Nobody is in the garage to reload the panel, so a choice made on a phone in
   * the kitchen has to land on the screen as it stands.
   */
  it('renders a value announced while it is running, without a reload', async () => {
    const backend = createPendingBackend();
    const channel = createChannel();
    render(
      <DeviceThemeProvider appearance={{ client: backend, subscription: channel }}>
        <Probe />
      </DeviceThemeProvider>
    );
    backend.answer({ mode: 'dark', resolvedMode: 'dark' });
    await waitFor(() => expect(painted()).toBe(carbonDark.background));

    channel.announce({ mode: 'light', resolvedMode: 'light' });

    await waitFor(() => expect(painted()).toBe(carbonLight.background));
  });

  /**
   * "Follow the device" means the browser's device, which the touchscreen is
   * not. It renders the half that browser resolved and pays the chosen mode no
   * attention at all — so an operator choosing Auto on a phone set to dark gets
   * a dark smoker, whatever this panel would have said about itself.
   */
  it('renders what "follow the device" resolved to elsewhere, not what its own panel wants', async () => {
    const backend = createPendingBackend();
    render(
      <DeviceThemeProvider appearance={{ client: backend }}>
        <Probe />
      </DeviceThemeProvider>
    );

    backend.answer({ mode: 'system', resolvedMode: 'light' });

    await waitFor(() => expect(painted()).toBe(carbonLight.background));
  });

  /**
   * A smoker installed this afternoon, with nobody having opened the settings
   * page on a phone yet. The backend answers that read with a document all the
   * same — the documented default — so "nothing chosen" reaches the panel as a
   * preference like any other, and the only thing standing between the garage
   * and a sheet of white is what that default records. Run against the real
   * client and the fake backend, because the value under test is the one the
   * assembled application actually reads.
   */
  it('stays dark on an installation nobody has chosen an appearance on', async () => {
    const cloud = createFakeBackend({ appSettings: {} });
    const client = createApiClient(cloud, createFakeBackend());
    render(
      <DeviceThemeProvider appearance={{ client: client.appearance }}>
        <Probe />
      </DeviceThemeProvider>
    );

    await waitFor(() =>
      expect(cloud.requests).toEqual([{ method: 'get', path: 'appSettings', body: undefined }])
    );

    expect(painted()).toBe(carbonDark.background);
  });
});

/**
 * The device is a reader of the installation's appearance and nothing else.
 *
 * It cannot see the operating-system preference that "follow the device" is
 * about, so anything it wrote would be a guess overwriting the browser that
 * knows — and, with the last writer deciding what the smoker shows, the guess
 * would win. This runs the device against the real client and the fake backend
 * so the assertion is about what actually leaves the appliance.
 */
describe('what the touchscreen sends the backend', () => {
  it('is never a write of the appearance, at boot or afterwards', async () => {
    const cloud = createFakeBackend({
      appSettings: { appearance: { mode: 'dark', resolvedMode: 'dark' } },
    });
    const client = createApiClient(cloud, createFakeBackend());
    const channel = createChannel();
    render(
      <DeviceThemeProvider appearance={{ client: client.appearance, subscription: channel }}>
        <Probe />
      </DeviceThemeProvider>
    );
    await waitFor(() => expect(painted()).toBe(carbonDark.background));

    channel.announce({ mode: 'light', resolvedMode: 'light' });
    await waitFor(() => expect(painted()).toBe(carbonLight.background));

    expect(cloud.requests).toEqual([{ method: 'get', path: 'appSettings', body: undefined }]);
  });
});
