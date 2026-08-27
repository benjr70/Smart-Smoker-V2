/**
 * What the two touchscreen screens actually look like once the shared theme is
 * over them.
 *
 * These assertions are about computed colour on the controls an operator
 * touches, because that is the thing the recolour is for. Both screens are the
 * real ones; only the leaves that reach hardware are stood in
 * for.
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
import { AppearancePreference, carbonDark, carbonLight } from 'theme/src';
import { Home } from '../components/home/home';
import {
  chartPanelFill,
  chartPlot,
  gridStroke,
  seriesStrokes,
  tempLabelFill,
} from '../testing/chartInk';
import { getConnection } from '../services/deviceService';
import { DeviceAppearanceSource, DeviceThemeProvider } from './DeviceThemeProvider';

jest.mock('../services/deviceService', () => ({
  connectToWiFi: jest.fn(),
  getConnection: jest.fn(),
}));

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

/**
 * A backend whose appearance read this test resolves by hand, so a screen can
 * be looked at before the installation has answered and again after it has.
 */
const createPendingBackend = () => {
  let settle: (value: AppearancePreference) => void = () => undefined;
  return {
    get: () => new Promise<AppearancePreference>(resolve => (settle = resolve)),
    answer: (preference: AppearancePreference) => settle(preference),
  };
};

/** The channel a phone announces a change of appearance down. */
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

const renderTouchscreen = async (appearance?: DeviceAppearanceSource): Promise<void> => {
  render(
    <DeviceThemeProvider appearance={appearance}>
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
 * The mock's rebuilt touchscreen under the shared theme: the header's pill and
 * the hero card are painted from the scheme's tokens, and the whole screen is
 * set in the design typeface the app now bundles — which is the thing the
 * device could not do while its faces lived on a font CDN.
 */
describe('the rebuilt home screen under the shared theme', () => {
  it('still offers exactly the two controls: wifi, and start/stop', async () => {
    await renderTouchscreen();

    // The stamp row under the chart is the cook log, not a control of the
    // screen: it logs what is happening in the smoker rather than changing
    // anything about the panel, and it is counted with the log it belongs to.
    const controls = screen
      .getAllByRole('button')
      .filter(button => !(button.getAttribute('data-testid') ?? '').startsWith('smoker-stamp-'));

    expect(controls).toHaveLength(2);
    expect(screen.getByTestId('smoker-stamp-bar')).toBeInTheDocument();
  });

  it('is set in the design typeface, not Roboto', async () => {
    await renderTouchscreen();

    const brand = screen.getByText('SMART SMOKER');
    expect(getComputedStyle(brand).fontFamily).toContain('Plus Jakarta Sans');
    expect(getComputedStyle(brand).fontFamily).not.toContain('Roboto');
  });

  it('paints the hero reading’s label in the scheme’s chamber colour, live on a flip', async () => {
    const backend = createPendingBackend();
    const channel = createChannel();
    await renderTouchscreen({ client: backend, subscription: channel });
    await act(async () => {
      backend.answer({ mode: 'dark', resolvedMode: 'dark' });
      await flushPromises();
    });

    const hero = screen.getByTestId('smoker-chamber-card');
    const heroLabel = within(hero).getByText('Chamber');
    expect(heroLabel).toHaveStyle({ color: carbonDark.probes.chamber });

    // A phone flips the installation light: the label repaints without the
    // screen being reloaded or remounted.
    await act(async () => {
      channel.announce({ mode: 'light', resolvedMode: 'light' });
      await flushPromises();
    });

    expect(within(screen.getByTestId('smoker-chamber-card')).getByText('Chamber')).toBe(heroLabel);
    expect(heroLabel).toHaveStyle({ color: carbonLight.probes.chamber });
  });
});

/**
 * The chart is a surface like any other now. It used to paint itself a light
 * grey panel and draw the light probe colours whatever the screen around it was
 * doing, which on this near-black panel left a pale slab in a dark garage.
 * Every colour it draws with comes from the scheme this device has been told to
 * render — and it is drawn here rather than stubbed, so these are the colours
 * the touchscreen actually comes out.
 */
describe('the chart under the shared theme', () => {
  it('is drawn on the panel of the scheme the device renders', async () => {
    await renderTouchscreen();

    expect(chartPanelFill()).toBe(carbonDark.chart.panel);
  });

  it('draws each reading’s line in that scheme’s colour for its probe', async () => {
    await renderTouchscreen();

    expect(seriesStrokes()).toEqual([
      carbonDark.chart.chamber,
      carbonDark.chart.probe1,
      carbonDark.chart.probe2,
      carbonDark.chart.probe3,
    ]);
  });

  it('rules its frame and writes its labels in that scheme’s colours', async () => {
    await renderTouchscreen();

    expect(gridStroke()).toBe(carbonDark.chart.grid);
    expect(tempLabelFill()).toBe(carbonDark.chart.label);
  });

  /**
   * The scheme the device is *told* to render, rather than the one it would
   * reach for on its own.
   *
   * Dark is both this appliance's answer before the installation has said
   * anything and the answer it falls back to when it is handed no palette at
   * all, so a chart asserted only in the dark would be a chart that could just
   * as well be painted from four constants. A panel told to render light has to
   * come out light — that is the half of the rule that says this device renders
   * a resolved scheme rather than choosing one.
   */
  it('is drawn in the light scheme when that is what the installation resolved', async () => {
    const backend = createPendingBackend();
    await renderTouchscreen({ client: backend });

    expect(chartPanelFill()).toBe(carbonDark.chart.panel);

    await act(async () => {
      backend.answer({ mode: 'light', resolvedMode: 'light' });
      await flushPromises();
    });

    expect(chartPanelFill()).toBe(carbonLight.chart.panel);
    expect(seriesStrokes()).toEqual([
      carbonLight.chart.chamber,
      carbonLight.chart.probe1,
      carbonLight.chart.probe2,
      carbonLight.chart.probe3,
    ]);
    expect(gridStroke()).toBe(carbonLight.chart.grid);
    expect(tempLabelFill()).toBe(carbonLight.chart.label);
  });

  /**
   * Nobody is in the garage to reload the panel, so a scheme chosen on a phone
   * in the kitchen has to land on the chart as it stands — repainted, not
   * rebuilt, because rebuilding it would throw away the cook it has drawn and
   * the reading under the operator's finger.
   */
  it('repaints on a scheme announced mid-cook, without being rebuilt', async () => {
    const backend = createPendingBackend();
    const channel = createChannel();
    await renderTouchscreen({ client: backend, subscription: channel });
    await act(async () => {
      backend.answer({ mode: 'dark', resolvedMode: 'dark' });
      await flushPromises();
    });
    const plot = chartPlot();
    expect(chartPanelFill()).toBe(carbonDark.chart.panel);

    await act(async () => {
      channel.announce({ mode: 'light', resolvedMode: 'light' });
      await flushPromises();
    });

    expect(chartPanelFill()).toBe(carbonLight.chart.panel);
    expect(seriesStrokes()[0]).toBe(carbonLight.chart.chamber);
    // The same element, not a new one: rebuilding it would throw away the cook
    // it has drawn and the reading under the operator's finger.
    expect(chartPlot()).toBe(plot);
  });
});

describe('the wifi screen under the shared theme', () => {
  it('shows its entry fields and paints its connect action in the dark accent', async () => {
    await renderTouchscreen();
    await openWifiScreen();

    expect(screen.getByRole('button', { name: /network/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /password/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toHaveStyle({
      backgroundColor: carbonDark.accent,
    });
  });
});
