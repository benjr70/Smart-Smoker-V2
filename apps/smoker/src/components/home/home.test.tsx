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
import { carbonDark } from 'theme/src';
import { ProbeTargetSetting } from '../../api';

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

/**
 * A stand-in for the settings the panel reads its targets out of, answering a
 * different set of rows on each read so a test can change what is configured
 * between one read and the next — which is the only way the touchscreen ever
 * sees a target change.
 */
function fakeProbeTargets(...rounds: ProbeTargetSetting[][]) {
  const port = {
    reads: 0,
    get: async (): Promise<ProbeTargetSetting[]> => {
      const rows = rounds[Math.min(port.reads, rounds.length - 1)] ?? [];
      port.reads += 1;
      return rows;
    },
  };
  return port;
}

/**
 * A stand-in for the same settings, answered by hand one read at a time, so a
 * test can hold a read in flight across the moment a cook starts — the one
 * moment the panel has two reads of its own on the go at once.
 */
function heldProbeTargets() {
  const held: Array<{
    resolve: (rows: ProbeTargetSetting[]) => void;
    reject: (error: Error) => void;
  }> = [];
  return {
    /** How many reads the panel has asked for so far, answered or not. */
    get reads(): number {
      return held.length;
    },
    get: (): Promise<ProbeTargetSetting[]> =>
      new Promise<ProbeTargetSetting[]>((resolve, reject) => {
        held.push({ resolve, reject });
      }),
    /** Let the n-th read (counting from nought) come back with these rows. */
    answer: async (read: number, rows: ProbeTargetSetting[]): Promise<void> => {
      await act(async () => {
        held[read].resolve(rows);
        await flushPromises();
      });
    },
    /** Let the n-th read come back as an unreachable cloud. */
    fail: async (read: number): Promise<void> => {
      await act(async () => {
        held[read].reject(new Error('the panel cannot reach the cloud'));
        await flushPromises();
      });
    },
  };
}

/** A watched probe, at the temperature its meat is done at. */
const watching = (slot: string, target: number): ProbeTargetSetting => ({
  slot,
  enabled: true,
  target,
});

function renderHome(kit: SmokerKit, probeTargets = fakeProbeTargets([])) {
  return render(
    <SmokeSessionProvider config={kit.config}>
      <Home probeTargets={probeTargets} />
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
   * The chart takes the width its card gives it — the right-hand ~60% of the
   * panel, beside the reading column — and its own height from the shape it
   * draws in, so that shape is what decides whether the plot, its title, and
   * the legend naming the four lines are all on the screen at once. jsdom lays
   * nothing out, so the card's share of the panel is stated here and the
   * plot's drawn height is derived from its own aspect at that share.
   */
  describe('drawn in the card the panel gives it', () => {
    const PANEL = { width: 800, height: 480 };
    /** The top bar and the page's own padding and gaps above the cards. */
    const TOP_BAR = 92;
    /** The chart card's share of the row (the reading column takes 38%). */
    const CARD_SHARE = 0.62;
    /** The card's title row, the legend under the plot, and the card padding. */
    const CARD_CHROME = 72;
    /** The room left down the panel for the plot itself. */
    const ROOM = PANEL.height - TOP_BAR - CARD_CHROME;

    /** How tall the plot comes out, drawn at the width its card gives it. */
    const drawnHeight = (plot: SVGSVGElement): number => {
      const [, , width, height] = (plot.getAttribute('viewBox') ?? '')
        .split(' ')
        .map(Number) as number[];
      return (PANEL.width * CARD_SHARE * height) / width;
    };

    it('fills the width of its card and still leaves its legend on the screen', async () => {
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
      // ...it comes out short enough for the title above it and the legend
      // under it to be on the 480px panel with it...
      expect(drawnHeight(plot)).toBeLessThanOrEqual(ROOM);
      // ...and tall enough to be using the room its card was left, rather than
      // a strip of it letterboxed over a blank band of card.
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

/**
 * The dashed lines the operator reads the cook against: how far each meat is
 * from done, without walking inside to open the settings page.
 *
 * The panel is a display for a decision made elsewhere, so what it draws is
 * whatever the settings said when it last read them — at boot, and again the
 * moment a cook is started. Nothing arrives mid-cook.
 */
describe('the targets on the touchscreen chart', () => {
  const targetLines = (container: HTMLElement): SVGLineElement[] =>
    Array.from(container.querySelectorAll<SVGLineElement>('line[data-target]'));

  /** A cook with two probes in the meat and the third not plugged in. */
  const cook = async (kit: SmokerKit): Promise<void> => {
    for (const chamber of ['225', '230']) {
      kit.clock.step(60_000);
      await act(async () => {
        kit.deviceFeed.injectReading(reading(chamber, '185', '190', '0'));
        await flushPromises();
      });
    }
  };

  it('rules a dashed line per watched probe, in that probe’s colour', async () => {
    const kit = smokerKit();
    kit.api.seedSmoking(true);
    const { container } = renderHome(
      kit,
      fakeProbeTargets([
        watching('probe1', 203),
        watching('probe2', 165),
        // Configured but not watched: the operator is not cooking to it.
        { slot: 'probe3', enabled: false, target: 195 },
      ])
    );
    await act(async () => {
      await flushPromises();
    });
    await cook(kit);

    const drawn = targetLines(container);
    expect(drawn.map(line => line.getAttribute('data-target'))).toEqual(['probe1', 'probe2']);
    expect(drawn[0]).toHaveAttribute('stroke', carbonDark.chart.probe1);
    expect(drawn[1]).toHaveAttribute('stroke', carbonDark.chart.probe2);
    drawn.forEach(line => expect(line.getAttribute('stroke-dasharray')).toBeTruthy());
    expect(screen.getByText('TARGET 203°')).toBeInTheDocument();
    expect(screen.getByText('TARGET 165°')).toBeInTheDocument();
  });

  /**
   * The panel ships mounted under `React.StrictMode` (`src/index.tsx`), so the
   * development build mounts every screen twice — effect, cleanup, effect —
   * before an operator sees anything. A switch-on read that is only made on the
   * first of those two passes is a read whose answer is thrown away by the
   * cleanup between them, and the panel comes up with no dashed lines on it at
   * all until somebody starts a cook.
   */
  it('reads the targets at switch-on even when the screen is mounted twice', async () => {
    const kit = smokerKit();
    // A panel switched on to a cook that is already on the backend and not
    // running: it draws the stored cook straight away, and nothing else happens
    // afterwards to make it read the settings a second time.
    kit.api.seedSmoking(false).seedTemps([
      {
        ChamberTemp: 210,
        MeatTemp: 120,
        Meat2Temp: 0,
        Meat3Temp: 0,
        date: new Date('2026-08-09T11:00:00.000Z'),
      },
      {
        ChamberTemp: 220,
        MeatTemp: 130,
        Meat2Temp: 0,
        Meat3Temp: 0,
        date: new Date('2026-08-09T11:01:00.000Z'),
      },
    ]);
    const settings = fakeProbeTargets([watching('probe1', 203)]);
    const { container } = render(
      <React.StrictMode>
        <SmokeSessionProvider config={kit.config}>
          <Home probeTargets={settings} />
        </SmokeSessionProvider>
      </React.StrictMode>
    );
    await act(async () => {
      await flushPromises();
    });

    expect(targetLines(container)).toHaveLength(1);
    expect(screen.getByText('TARGET 203°')).toBeInTheDocument();
  });

  it('reads the settings again when a cook is started, and never during one', async () => {
    const kit = smokerKit();
    kit.api.seedSmoking(false);
    // The target is raised on a phone while the panel sits at the smoker.
    const settings = fakeProbeTargets([watching('probe1', 195)], [watching('probe1', 210)]);
    const { container } = renderHome(kit, settings);
    await act(async () => {
      await flushPromises();
    });

    // Read once when the panel was switched on, with no cook to draw it against.
    expect(settings.reads).toBe(1);

    fireEvent.click(screen.getByTestId('smoker-start-button'));
    await act(async () => {
      await flushPromises();
    });

    // Starting the cook is when the panel looks again...
    expect(settings.reads).toBe(2);
    await cook(kit);
    // ...and what it draws is what the settings said then, not at switch-on.
    expect(screen.getByText('TARGET 210°')).toBeInTheDocument();
    expect(screen.queryByText('TARGET 195°')).not.toBeInTheDocument();

    // It does not look again while that cook runs, however long it runs.
    await cook(kit);
    expect(settings.reads).toBe(2);
    expect(targetLines(container)).toHaveLength(1);

    // Stopping is not a moment to read — nothing is being cooked to a target —
    // and the cook after it is, so every cook gets the settings as they stand.
    fireEvent.click(screen.getByTestId('smoker-start-button'));
    await act(async () => {
      await flushPromises();
    });
    expect(settings.reads).toBe(2);

    fireEvent.click(screen.getByTestId('smoker-start-button'));
    await act(async () => {
      await flushPromises();
    });
    expect(settings.reads).toBe(3);
  });

  it('keeps drawing the cook when the settings cannot be read', async () => {
    const kit = smokerKit();
    kit.api.seedSmoking(true);
    const unreachable = {
      reads: 0,
      get: async (): Promise<ProbeTargetSetting[]> => {
        unreachable.reads += 1;
        throw new Error('the panel cannot reach the cloud');
      },
    };
    const { container } = renderHome(kit, unreachable);
    await act(async () => {
      await flushPromises();
    });
    await cook(kit);

    // No dashed lines, and the cook itself still drawn: the operator is at the
    // smoker, and a chart is worth more than an error.
    expect(unreachable.reads).toBeGreaterThan(0);
    expect(targetLines(container)).toHaveLength(0);
    expect(container.querySelector('path[data-series="chamber"]')).not.toHaveAttribute('d', '');
  });

  /**
   * A panel switched on into a cook has two reads on the go within the same
   * second: the switch-on read, and the one the cook starting asks for. Whatever
   * of the two comes back is what the operator gets — the settings do not stop
   * being the settings because the second request was the one that timed out.
   */
  it('keeps the targets the switch-on read fetched when the cook’s own read fails', async () => {
    const kit = smokerKit();
    kit.api.seedSmoking(false);
    const settings = heldProbeTargets();
    const { container } = renderHome(kit, settings);
    await act(async () => {
      await flushPromises();
    });
    // Switched on, and the switch-on read still out at the cloud.
    expect(settings.reads).toBe(1);

    fireEvent.click(screen.getByTestId('smoker-start-button'));
    await act(async () => {
      await flushPromises();
    });
    expect(settings.reads).toBe(2);

    // The switch-on read lands, late — after the cook was started — and the
    // cook's own read never lands at all.
    await settings.answer(0, [watching('probe1', 203)]);
    await settings.fail(1);
    await cook(kit);

    expect(targetLines(container)).toHaveLength(1);
    expect(screen.getByText('TARGET 203°')).toBeInTheDocument();
  });

  /**
   * The same two reads, both answered, and the older of them slower. What the
   * cook was started against is the newer answer, and a switch-on read wandering
   * in behind it does not get to move the lines back to what they were before
   * the operator pressed start.
   */
  it('does not let a late switch-on read undo what the cook was started with', async () => {
    const kit = smokerKit();
    kit.api.seedSmoking(false);
    const settings = heldProbeTargets();
    const { container } = renderHome(kit, settings);
    await act(async () => {
      await flushPromises();
    });

    fireEvent.click(screen.getByTestId('smoker-start-button'));
    await act(async () => {
      await flushPromises();
    });

    // The cook's read comes back first, with the target as it stands...
    await settings.answer(1, [watching('probe1', 210)]);
    // ...and the switch-on read, with the target as it was, comes back after.
    await settings.answer(0, [watching('probe1', 195)]);
    await cook(kit);

    expect(targetLines(container)).toHaveLength(1);
    expect(screen.getByText('TARGET 210°')).toBeInTheDocument();
    expect(screen.queryByText('TARGET 195°')).not.toBeInTheDocument();
  });

  it('draws no target for a probe nobody is watching', async () => {
    const kit = smokerKit();
    kit.api.seedSmoking(true);
    const { container } = renderHome(kit, fakeProbeTargets([]));
    await act(async () => {
      await flushPromises();
    });
    await cook(kit);

    expect(targetLines(container)).toHaveLength(0);
    expect(screen.queryByText(/TARGET/)).not.toBeInTheDocument();
  });
});

/**
 * The mock's top bar: the brand mark, the state said as a pill, the cook's age
 * while one is running, and the two controls. What is asserted is what an
 * operator reads from across a garage — which state the pill claims, and
 * whether the clock counts the cook rather than the screen.
 */
describe('the top bar', () => {
  it('reads IDLE with no active smoke, and offers to start', async () => {
    const kit = smokerKit();
    kit.api.seedSmoking(false);
    renderHome(kit);
    await act(async () => {
      await flushPromises();
    });

    expect(screen.getByText('SMART SMOKER')).toBeInTheDocument();
    const pill = screen.getByTestId('smoker-status-pill');
    expect(pill).toHaveTextContent('IDLE');
    expect(pill).toHaveAttribute('data-smoking', 'false');
    expect(screen.getByText('No active smoke')).toBeInTheDocument();
    expect(screen.queryByTestId('smoker-elapsed-clock')).not.toBeInTheDocument();
    expect(screen.getByText('Start Smoking')).toBeInTheDocument();
  });

  it('reads SMOKING with the elapsed clock while a cook runs', async () => {
    const kit = smokerKit();
    kit.api.seedSmoking(true).seedCookStart(new Date());
    renderHome(kit);
    await act(async () => {
      await flushPromises();
    });

    const pill = screen.getByTestId('smoker-status-pill');
    expect(pill).toHaveTextContent('SMOKING');
    expect(pill).toHaveAttribute('data-smoking', 'true');
    expect(screen.getByText('ELAPSED')).toBeInTheDocument();
    expect(screen.getByTestId('smoker-elapsed-clock')).toBeInTheDocument();
    expect(screen.queryByText('No active smoke')).not.toBeInTheDocument();
    expect(screen.getByText('Stop Smoking')).toBeInTheDocument();
  });

  /**
   * The clock is derived from the recorded start against the current time, so
   * a panel switched on (or restarted) six hours into a cook shows six hours —
   * not the age of its own screen. The stamp is seeded two hours old, and the
   * clock has to say so the moment it mounts.
   */
  it('derives the elapsed clock from the recorded stamp, so it survives a restart', async () => {
    const kit = smokerKit();
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    kit.api.seedSmoking(true).seedCookStart(new Date(Date.now() - TWO_HOURS));
    renderHome(kit);
    await act(async () => {
      await flushPromises();
    });

    expect(screen.getByTestId('smoker-elapsed-clock')).toHaveTextContent(/^02:00:0\d$/);
  });

  it('paints the wifi glyph green connected and red disconnected', async () => {
    const kit = smokerKit();
    renderHome(kit);
    await act(async () => {
      await flushPromises();
    });

    // Defaults to connected before any probe answers. The colour is set on the
    // control and the glyph inherits it, so the control is what is asserted.
    expect(screen.getByLabelText('wifi connected')).toHaveStyle({ color: carbonDark.success });
    expect(screen.getByTestId('WifiIcon')).toBeInTheDocument();

    kit.wifi.setStatus(false);
    await act(async () => {
      kit.socket.setConnected(true);
      kit.deviceFeed.injectReading(reading('225', '185', '190', '0'));
      await flushPromises();
    });

    expect(screen.getByLabelText('wifi disconnected')).toHaveStyle({ color: carbonDark.danger });
    expect(screen.getByTestId('WifiOffIcon')).toBeInTheDocument();
  });
});

/**
 * The left column of the mock: the chamber said once and large, and the three
 * probes as a colour-coded list — the colours being the same tokens the chart
 * draws those probes' lines in, which is the whole map between the list and
 * the graph beside it.
 */
describe('the reading cards', () => {
  it('shows the chamber as a hero card, named and coloured as the chamber', async () => {
    const kit = smokerKit();
    renderHome(kit);
    await act(async () => {
      kit.deviceFeed.injectReading(reading('225', '185', '190', '0'));
      await flushPromises();
    });

    const hero = screen.getByTestId('smoker-chamber-card');
    expect(within(hero).getByText('Chamber')).toHaveStyle({ color: carbonDark.probes.chamber });
    expect(within(hero).getByTestId('smoker-chamber-temp')).toHaveTextContent('225');
  });

  it('lists the three probes with their dots, values and dividers', async () => {
    const kit = smokerKit();
    renderHome(kit);
    await act(async () => {
      kit.deviceFeed.injectReading(reading('225', '185', '190', '0'));
      await flushPromises();
    });

    const list = screen.getByTestId('smoker-probe-card');
    expect(within(list).getByText('probe 1')).toBeInTheDocument();
    expect(within(list).getByText('185')).toBeInTheDocument();
    expect(within(list).getByText('190')).toBeInTheDocument();
    (['probe1', 'probe2', 'probe3'] as const).forEach(probe => {
      expect(within(list).getByTestId(`smoker-${probe}-dot`)).toHaveStyle({
        backgroundColor: carbonDark.probes[probe],
      });
    });
    // Between the rows only: the card's own border ends the list at both ends.
    expect(within(list).getAllByRole('separator')).toHaveLength(2);
  });
});

/**
 * The chart's card says what the picture is of and over how long, which is
 * what makes a graph with no numbers under a finger self-explanatory.
 */
describe('the chart card', () => {
  it('is titled, and says what window of the cook it shows', async () => {
    const kit = smokerKit();
    kit.api.seedSmoking(true);
    renderHome(kit);
    await act(async () => {
      await flushPromises();
    });

    const card = screen.getByTestId('smoker-chart-card');
    expect(within(card).getByText('TEMPERATURE HISTORY')).toBeInTheDocument();
    // Nothing plotted yet: the card claims no span it does not show.
    expect(within(card).getByTestId('smoker-chart-window')).toHaveTextContent('LIVE');

    for (const chamber of ['225', '230', '228']) {
      kit.clock.step(60_000);
      await act(async () => {
        kit.deviceFeed.injectReading(reading(chamber, '185', '190', '0'));
        await flushPromises();
      });
    }

    // Three readings a minute apart span two minutes.
    expect(within(card).getByTestId('smoker-chart-window')).toHaveTextContent('LAST 2M');
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
