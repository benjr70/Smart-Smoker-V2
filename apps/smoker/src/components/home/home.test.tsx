import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Home } from './home';
import { SessionConfig, SmokeProfile, decodeEvents } from 'smoke-session/src';
import { SmokeSessionProvider } from 'smoke-session/src/react';
import {
  FakeCloudSocket,
  FakeDeviceFeed,
  FakeSessionApi,
  FakeWifiStatus,
  SteppingClock,
} from 'smoke-session/src/testing';
import { plotBoxOf } from 'temperaturechart/src/chartGeometry';

// The package's flushPromises leans on node's setImmediate, absent in the CRA
// jsdom test env; a setTimeout(0) drain settles the store's fire-and-forget
// startup loads and command promises just the same.
const flushPromises = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

// The wifi sub-screen owns its own device wiring; stub it to a back button.
jest.mock('./wifi/wifi', () => ({
  Wifi: function MockWifi(props: any) {
    return (
      <div data-testid="wifi-component">
        <button onClick={() => props.onBack(0)}>Back to Home</button>
        WiFi Settings
      </div>
    );
  },
}));

interface SmokerKit {
  config: SessionConfig;
  socket: FakeCloudSocket;
  api: FakeSessionApi;
  deviceFeed: FakeDeviceFeed;
  wifi: FakeWifiStatus;
  clock: SteppingClock;
}

function smokerKit(): SmokerKit {
  const socket = new FakeCloudSocket();
  const api = new FakeSessionApi();
  const clock = new SteppingClock();
  const deviceFeed = new FakeDeviceFeed();
  const wifi = new FakeWifiStatus();
  const config: SessionConfig = {
    role: 'smoker',
    socket,
    api,
    clock,
    deviceFeed,
    wifi: { port: wifi, throttleMs: 0 },
  };
  return { config, socket, api, deviceFeed, wifi, clock };
}

function renderHome(kit: SmokerKit) {
  return render(
    <SmokeSessionProvider config={kit.config}>
      <Home />
    </SmokeSessionProvider>
  );
}

const reading = (chamber: string, meat: string, meat2: string, meat3: string): string =>
  JSON.stringify({ Chamber: chamber, Meat: meat, Meat2: meat2, Meat3: meat3 });

/**
 * The chart on the touchscreen.
 *
 * It is the real one, drawn into this document, because the whole point of the
 * rewrite is that the drawing is a rendering an operator could read — so what a
 * test asks of it is the same thing an operator would look for at the smoker.
 */
describe('the chart on the home screen', () => {
  /** The touchscreen's shape, the one the kiosk's wide panel is cut for. */
  const TOUCHSCREEN = plotBoxOf('touchscreen');

  it('draws a line for the chamber and each of the three probes', async () => {
    const kit = smokerKit();
    const { container } = renderHome(kit);
    await act(async () => {
      await flushPromises();
    });

    expect(
      Array.from(container.querySelectorAll('path[data-series]')).map(line =>
        line.getAttribute('data-series')
      )
    ).toEqual(['chamber', 'probe1', 'probe2', 'probe3']);
  });

  it('draws in the shape the touchscreen gives it', async () => {
    const kit = smokerKit();
    renderHome(kit);
    await act(async () => {
      await flushPromises();
    });

    expect(screen.getByRole('img', { name: 'Temperature chart' })).toHaveAttribute(
      'viewBox',
      `0 0 ${TOUCHSCREEN.width} ${TOUCHSCREEN.height}`
    );
  });

  /**
   * The panel this screen is drawn on: 800 across, 480 down, and no scrollbar
   * at a smoker to go looking for anything that falls off it.
   *
   * The chart is given the whole width of the row it sits in and takes its own
   * height from the shape it draws in, so that shape is the whole of what
   * decides whether the plot uses the panel or is letterboxed in the middle of
   * it, and whether the legend naming the four lines is on the screen at all.
   * Both of those are the same number, which is why they are asserted together:
   * a shape tall enough to be worth capping is a shape that had to be shrunk
   * away from the sides to fit.
   */
  describe('drawn across the panel it hangs on', () => {
    const PANEL = { width: 800, height: 480 };
    /** What the readouts and the two actions take off the top of the panel. */
    const READOUTS_AND_ACTIONS = 140;
    /** The legend the chart writes under the plot. */
    const LEGEND = 32;
    /** The room left down the panel for the plot itself. */
    const ROOM = PANEL.height - READOUTS_AND_ACTIONS - LEGEND;

    /** How tall the plot comes out, drawn at the width the row gives it. */
    const drawnHeight = (plot: SVGSVGElement): number => {
      const [, , width, height] = (plot.getAttribute('viewBox') ?? '')
        .split(' ')
        .map(Number) as number[];
      return (PANEL.width * height) / width;
    };

    it('fills the width of the panel and still leaves its legend on the screen', async () => {
      const kit = smokerKit();
      renderHome(kit);
      await act(async () => {
        await flushPromises();
      });
      const plot = screen.getByRole('img', {
        name: 'Temperature chart',
      }) as unknown as SVGSVGElement;

      // Drawn at the width it is given, rather than at a width of its own...
      expect(plot).toHaveAttribute('width', '100%');
      // ...it comes out short enough for the legend under it to be on screen...
      expect(drawnHeight(plot)).toBeLessThanOrEqual(ROOM);
      // ...and tall enough to be using the room it was left, rather than a
      // strip of it with the panel showing either side.
      expect(drawnHeight(plot)).toBeGreaterThan(ROOM * 0.8);
    });
  });

  it('plots the cook as the device reads it, while the smoke is running', async () => {
    const kit = smokerKit();
    kit.api.seedSmoking(true);
    const { container } = renderHome(kit);
    await act(async () => {
      await flushPromises();
    });

    const drawnBefore = container.querySelector('path[data-series="chamber"]');
    expect(drawnBefore).toHaveAttribute('d', '');

    for (const chamber of ['225', '230', '228']) {
      kit.clock.step(60_000);
      await act(async () => {
        kit.deviceFeed.injectReading(reading(chamber, '185', '190', '0'));
        await flushPromises();
      });
    }

    expect(container.querySelector('path[data-series="chamber"]')).not.toHaveAttribute('d', '');
  });

  /**
   * The operator is standing at the smoker with a finger on the glass, so a
   * touch has to answer what the probes read at the moment being touched — and
   * lifting off has to give the plot back.
   */
  describe('a finger on the plot', () => {
    /** Where the plot's own middle falls, between the touchscreen's margins. */
    const middleOfThePlot = (TOUCHSCREEN.width + TOUCHSCREEN.margin.left) / 2;

    /** The chart's own plot, not the wifi button's icon further up the screen. */
    const plotOf = (container: HTMLElement): SVGSVGElement =>
      container.querySelector('svg[aria-label="Temperature chart"]') as SVGSVGElement;

    const touchAt = (container: HTMLElement, x: number): void => {
      fireEvent(plotOf(container), new MouseEvent('pointerdown', { bubbles: true, clientX: x }));
    };

    const cookThreeReadings = async (kit: SmokerKit): Promise<void> => {
      for (const chamber of ['225', '230', '228']) {
        kit.clock.step(60_000);
        await act(async () => {
          kit.deviceFeed.injectReading(reading(chamber, '185', '190', '0'));
          await flushPromises();
        });
      }
    };

    it('says what each probe read at the moment being touched', async () => {
      const kit = smokerKit();
      kit.api.seedSmoking(true);
      const { container } = renderHome(kit);
      await act(async () => {
        await flushPromises();
      });
      await cookThreeReadings(kit);

      expect(container.querySelector('[data-hover-card]')).toBeNull();

      touchAt(container, middleOfThePlot);

      const card = container.querySelector('[data-hover-card]') as unknown as HTMLElement;
      expect(card).not.toBeNull();
      expect(within(card).getByText('Chamber')).toBeInTheDocument();
      expect(within(card).getByText('probe 1')).toBeInTheDocument();
      expect(within(card).getByText('185°')).toBeInTheDocument();
      expect(container.querySelector('[data-crosshair]')).not.toBeNull();
      expect(container.querySelectorAll('circle[data-hover]').length).toBeGreaterThan(0);
    });

    it('gives the plot back when the finger leaves', async () => {
      const kit = smokerKit();
      kit.api.seedSmoking(true);
      const { container } = renderHome(kit);
      await act(async () => {
        await flushPromises();
      });
      await cookThreeReadings(kit);

      touchAt(container, middleOfThePlot);
      expect(container.querySelector('[data-hover-card]')).not.toBeNull();

      fireEvent.pointerLeave(plotOf(container));

      expect(container.querySelector('[data-hover-card]')).toBeNull();
    });
  });
});

describe('Home (smoker session host)', () => {
  it('renders a live device reading and relays it to the cloud as an events frame', async () => {
    const kit = smokerKit();
    renderHome(kit);
    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      kit.socket.setConnected(true);
      kit.deviceFeed.injectReading(reading('225', '185', '190', '0'));
      await flushPromises();
    });

    // The live reading is on screen...
    expect(screen.getByTestId('smoker-chamber-temp')).toHaveTextContent('225');
    expect(screen.getByText('185')).toBeInTheDocument();
    expect(screen.getByText('190')).toBeInTheDocument();

    // ...and relayed to the cloud verbatim.
    expect(kit.socket.emittedEvents).toHaveLength(1);
    const frame = decodeEvents(kit.socket.emittedEvents[0]);
    expect(frame.chamberTemp).toBe('225');
    expect(frame.probeTemp1).toBe('185');
  });

  it('starts smoking on the button press and broadcasts the agreed smoke update', async () => {
    const kit = smokerKit();
    kit.api.seedSmoking(false);
    renderHome(kit);
    await act(async () => {
      await flushPromises();
    });

    expect(screen.getByText('Start Smoking')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('smoker-start-button'));
    await act(async () => {
      await flushPromises();
    });

    // The local view flips...
    expect(screen.getByText('Stop Smoking')).toBeInTheDocument();
    // ...and the broadcast smokeUpdate agrees with the new snapshot state.
    expect(kit.socket.emittedSmokeUpdates).toHaveLength(1);
    expect(kit.socket.emittedSmokeUpdates[0].smoking).toBe(true);
  });

  it('buffers readings while offline and, on reconnect, posts the batch then refreshes then relays', async () => {
    const kit = smokerKit();
    renderHome(kit);
    await act(async () => {
      kit.socket.setConnected(false);
      await flushPromises();
    });

    // Disconnected: the pinned every-11th cadence keeps one sample; nothing
    // is posted while offline.
    await act(async () => {
      for (let i = 0; i < 11; i++) {
        kit.deviceFeed.injectReading(reading('225', '185', '190', '0'));
      }
      await flushPromises();
    });
    expect(kit.api.countCalls('postTempsBatch')).toBe(0);
    expect(kit.socket.emittedEvents).toHaveLength(0);

    // Reconnect and take one more reading: the buffered batch uploads first,
    // then a refresh, then the live relay — in that order.
    await act(async () => {
      kit.socket.setConnected(true);
      kit.deviceFeed.injectReading(reading('230', '188', '191', '0'));
      await flushPromises();
    });

    expect(kit.api.countCalls('postTempsBatch')).toBe(1);
    expect(kit.socket.emittedRefreshes).toBe(1);
    expect(kit.socket.outbound.slice(-2)).toEqual(['refresh', 'events']);
  });

  it('navigates to the wifi screen and refreshes the chart baseline on return', async () => {
    const kit = smokerKit();
    renderHome(kit);
    await act(async () => {
      await flushPromises();
    });
    expect(kit.api.countCalls('getCurrentTemps')).toBe(1);

    fireEvent.click(screen.getByLabelText('wifi connected'));
    await act(async () => {
      await flushPromises();
    });
    expect(screen.getByText('WiFi Settings')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Back to Home'));
    await act(async () => {
      await flushPromises();
    });

    expect(screen.getByText('Start Smoking')).toBeInTheDocument();
    // Returning to the home screen re-fetches the chart baseline.
    expect(kit.api.countCalls('getCurrentTemps')).toBe(2);
  });

  it('drives the wifi indicator off the throttled snapshot connectivity flag', async () => {
    const kit = smokerKit();
    kit.wifi.setStatus(false);
    renderHome(kit);
    await act(async () => {
      await flushPromises();
    });

    // Defaults to connected before any probe.
    expect(screen.getByTestId('WifiIcon')).toBeInTheDocument();

    // A reading triggers a wifi probe; the disconnected result flips the icon.
    await act(async () => {
      kit.socket.setConnected(true);
      kit.deviceFeed.injectReading(reading('225', '185', '190', '0'));
      await flushPromises();
    });

    expect(screen.getByTestId('WifiOffIcon')).toBeInTheDocument();
  });

  it('renders the probe names from the loaded smoke profile', async () => {
    const kit = smokerKit();
    kit.api.seedProfile({
      chamberName: 'Big Pit',
      probe1Name: 'Brisket',
      probe2Name: 'Ribs',
      probe3Name: 'Wings',
      notes: '',
      woodType: 'Hickory',
    });
    renderHome(kit);

    await act(async () => {
      await flushPromises();
    });

    // Each name is on screen twice: as the readout's label, and labelling that
    // probe's line in the chart's legend.
    expect(screen.getAllByText('Big Pit')).toHaveLength(2);
    expect(screen.getAllByText('Brisket')).toHaveLength(2);
    expect(screen.getAllByText('Ribs')).toHaveLength(2);
    expect(screen.getAllByText('Wings')).toHaveLength(2);
  });

  /**
   * A stored profile carries all four names when a browser wrote it, and need
   * not otherwise: every one of them is optional where the smoke is stored, and
   * a name that was never written comes back missing rather than empty. The
   * kiosk is the one screen with nowhere to go when a render throws — no
   * reload, no back, and an operator with a cook running — so a missing name
   * has to be a name to fall back on rather than a blank screen in the garage.
   */
  it('keeps drawing when a stored profile carries no name for a probe', async () => {
    const kit = smokerKit();
    kit.api.seedProfile({
      chamberName: 'Big Pit',
      probe1Name: 'Brisket',
      probe3Name: 'Wings',
      notes: '',
      woodType: 'Hickory',
    } as SmokeProfile);
    renderHome(kit);

    await act(async () => {
      await flushPromises();
    });

    expect(screen.getByRole('img', { name: 'Temperature chart' })).toBeInTheDocument();
    // The unnamed line is still named in the legend, where there is no readout
    // beside it carrying the same name.
    expect(screen.getByText('probe 2')).toBeInTheDocument();
    expect(screen.getAllByText('Brisket')).toHaveLength(2);
  });

  it('falls back to default probe names when no profile is saved', async () => {
    const kit = smokerKit();
    kit.api.seedProfile(null);
    renderHome(kit);

    await act(async () => {
      await flushPromises();
    });

    expect(screen.getAllByText('Chamber')).toHaveLength(2);
    expect(screen.getAllByText('probe 1')).toHaveLength(2);
    expect(screen.getAllByText('probe 2')).toHaveLength(2);
    expect(screen.getAllByText('probe 3')).toHaveLength(2);
  });

  it('shows the stop-smoking action when the persisted state is already smoking', async () => {
    const kit = smokerKit();
    kit.api.seedSmoking(true);
    renderHome(kit);

    await act(async () => {
      await flushPromises();
    });

    expect(screen.getByText('Stop Smoking')).toBeInTheDocument();
  });

  it('applies an inbound remote smoke update (names and smoking) as the smoker role', async () => {
    const kit = smokerKit();
    renderHome(kit);
    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      kit.socket.injectSmokeUpdate({
        smoking: true,
        chamberName: 'Renamed Chamber',
        probe1Name: 'Renamed Probe 1',
        probe2Name: 'Renamed Probe 2',
        probe3Name: 'Renamed Probe 3',
      });
      await flushPromises();
    });

    expect(screen.getAllByText('Renamed Chamber')).toHaveLength(2);
    expect(screen.getAllByText('Renamed Probe 1')).toHaveLength(2);
    expect(screen.getByText('Stop Smoking')).toBeInTheDocument();
  });
});
