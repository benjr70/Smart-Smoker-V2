import React from 'react';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SmokeStep, SmokeStepView } from './smokeStep';
import { SmokeSessionProvider } from 'smoke-session/src/react';
import { SessionConfig } from 'smoke-session/src';
import { encodeEvents } from 'smoke-session/src';
import { FakeCloudSocket, FakeSessionApi, SteppingClock } from 'smoke-session/src/testing';
import { plotBoxOf, plotEdges } from 'temperaturechart/src/chartGeometry';
import { ApiClientProvider, createApiClient } from '../../../api';
import {
  createFakeBackend,
  FakeBackend,
  NO_CURRENT_TIMELINE,
  StoredApplicationSettings,
} from '../../../api/fakeBackend';
import { DesignSurface, carbonLight, resolveDesignPalette } from '../../../theme';

// The package's `flushPromises` uses `setImmediate`, which is absent from the
// frontend's jsdom test environment; a `setTimeout(0)` macrotask drains the
// store's fire-and-forget startup/command promises just the same.
const flushPromises = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

// Nothing of the user interface is stubbed. Material-UI is the library the step
// is written in, not a boundary it talks across, and a suite that replaced it
// with hand-written stand-ins could only assert on the stand-ins — which is how
// the readouts' colours, the start control's two appearances and the wood
// picker's suggestion list all became unassertable here. The chart is real for
// the same reason: it is plain React SVG, so what it draws from the session is
// read off the document rather than taken on trust from the props it was given.
//
// The fields are addressed by the test ids the step puts on the elements a
// browser actually types into (`smoke-chamber-name-input` and friends) — the
// same ids the e2e journeys use, so this suite and those agree on what the
// controls are.

// The composition root opens a real cloud socket and pairs the store with the
// production API client. Mock both boundaries — the cloud-socket adapter factory
// (which owns the only socket.io import) and the default API client — so the
// host test asserts the wiring without touching a network. Implementations are
// (re)installed in each test's beforeEach because CRA runs `resetMocks`.
//
// Only the production-client factory is replaced, not the whole API module: the
// step reads its notification settings through the injection seam, so the
// provider and its hook have to be the real ones for a test to be able to hand
// the view a fake-backend-backed client.
jest.mock('smoke-session/src/adapters/cloud-socket');
jest.mock('../../../api', () => ({
  ...jest.requireActual('../../../api'),
  getDefaultApiClient: jest.fn(),
}));

const nextButton = <button data-testid="next-button">Next</button>;

/** An inert cloud-socket port: never delivers a frame, records nothing. */
function inertCloudPort() {
  const noop = () => undefined;
  const noopSub = () => noop;
  return {
    onEvents: noopSub,
    onSmokeUpdate: noopSub,
    onClear: noopSub,
    onRefresh: noopSub,
    onConnectionChange: noopSub,
    emitSmokeUpdate: noop,
    emitClear: noop,
    emitEvents: noop,
    emitRefresh: noop,
    connected: false,
    close: noop,
  };
}

/** A minimal API client covering only the monitor-role reads/writes. */
function fakeApiClient() {
  return {
    smokeProfile: {
      getCurrent: jest.fn().mockResolvedValue({
        chamberName: 'Chamber',
        probe1Name: 'probe 1',
        probe2Name: 'probe 2',
        probe3Name: 'probe 3',
        notes: '',
        woodType: '',
      }),
      saveCurrent: jest.fn().mockResolvedValue(undefined),
    },
    state: {
      get: jest.fn().mockResolvedValue({ smokeId: 'x', smoking: false }),
      toggleSmoking: jest.fn().mockResolvedValue({ smokeId: 'x', smoking: true }),
    },
    temps: { getCurrent: jest.fn().mockResolvedValue([]) },
  };
}

/**
 * A frozen `events` frame carrying the given temperatures. The probes default
 * to zero for the frames that only care about the chamber.
 */
function eventsFrame(
  chamberTemp: string,
  probeTemps: [string, string, string] = ['0', '0', '0'],
  secondsIn = 0
): string {
  return encodeEvents({
    chamberName: 'Chamber',
    probe1Name: 'probe 1',
    probe2Name: 'probe 2',
    probe3Name: 'probe 3',
    probeTemp1: probeTemps[0],
    probeTemp2: probeTemps[1],
    probeTemp3: probeTemps[2],
    chamberTemp,
    smoking: false,
    date: new Date(new Date('2026-07-18T12:00:00.000Z').getTime() + secondsIn * 1000),
  });
}

/** Wire a monitor-role config over the shared fake kit (no sockets, no HTTP). */
function harness(): { config: SessionConfig; socket: FakeCloudSocket; api: FakeSessionApi } {
  const socket = new FakeCloudSocket();
  const api = new FakeSessionApi();
  const clock = new SteppingClock();
  const config: SessionConfig = { role: 'monitor', socket, api, clock };
  return { config, socket, api };
}

/**
 * Render the view under a live Provider wired to the fake kit, and over a client
 * backed by the in-memory backend the step reads its settings from.
 *
 * {@link DesignSurface} is what carries the design's tokens into the subtree, so
 * the step is painted here the way it is painted in the application: the probe
 * colours, the surfaces and the accent are the real ones, and a test can ask
 * what colour a reading is in.
 */
function renderView(kit = harness(), backend: FakeBackend = createFakeBackend()) {
  const utils = render(
    <ApiClientProvider client={createApiClient(backend)}>
      <DesignSurface>
        <SmokeSessionProvider config={kit.config}>
          <SmokeStepView nextButton={nextButton} cookEventsSubscription={inertCookEvents()} />
        </SmokeSessionProvider>
      </DesignSurface>
    </ApiClientProvider>
  );
  return { ...utils, ...kit };
}

/**
 * An inert cook-log announcement channel: subscribes to nothing, exactly as
 * {@link inertCloudPort} stands in for the session's own socket. The card is
 * otherwise real — it reads and writes the log over the fake backend.
 */
function inertCookEvents() {
  return { subscribe: () => () => undefined };
}

/** The four lines the chart draws, in the order it draws them. */
const seriesPaths = (container: HTMLElement): SVGPathElement[] =>
  Array.from(container.querySelectorAll<SVGPathElement>('path[data-series]'));

/** The dashed target lines the chart rules across the plot. */
const targetLines = (container: HTMLElement): SVGLineElement[] =>
  Array.from(container.querySelectorAll<SVGLineElement>('line[data-target]'));

/** The palette the smoke screen is painted in under test, which is the light one. */
const designColours = resolveDesignPalette(carbonLight, 'light');

/** The chart colours the smoke screen draws under in a test. */
const chartColours = designColours.chart;

/** The colour each reading is identified by, in the same scheme. */
const probeColours = designColours.probes;

/**
 * A stored settings document with the given probes watched at the given
 * temperatures — the shape the settings page saves, keyed by slot and unnamed.
 */
const settingsWatching = (watched: Record<string, number>): Partial<StoredApplicationSettings> => ({
  probeTarget: {
    enabled: true,
    probes: ['probe1', 'probe2', 'probe3'].map(slot => ({
      slot,
      enabled: watched[slot] !== undefined,
      target: watched[slot] ?? 203,
      targetSource: watched[slot] === undefined ? ('default' as const) : ('user' as const),
    })),
  },
});

describe('the chart on the smoke screen', () => {
  test('draws a line per probe, named as the operator named it', async () => {
    const kit = harness();
    kit.api.seedSmoking(true).seedProfile({
      chamberName: 'Offset',
      probe1Name: 'Brisket Flat',
      probe2Name: 'Brisket Point',
      probe3Name: 'Ribs',
      notes: '',
      woodType: '',
    });
    const { container, socket } = renderView(kit);

    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      socket.injectEvents(eventsFrame('213', ['145', '92', '78']));
    });
    await act(async () => {
      socket.injectEvents(eventsFrame('218', ['150', '95', '80'], 60));
    });

    expect(seriesPaths(container)).toHaveLength(4);
    seriesPaths(container).forEach(path => expect(path.getAttribute('d')).toBeTruthy());
    ['Offset', 'Brisket Flat', 'Brisket Point', 'Ribs'].forEach(name =>
      expect(screen.getByText(name)).toBeInTheDocument()
    );
  });

  /**
   * The chart and the cook log are one screen: what the pitmaster stamped is
   * drawn on the curve it explains, live, in the stamp's own tone.
   */
  test('marks what has been logged on the cook it happened to', async () => {
    const kit = harness();
    kit.api.seedSmoking(true);
    const backend = createFakeBackend({
      state: { smokeId: 'smoke-1', smoking: true },
      cookEvents: {
        current: [
          {
            _id: 'event-1',
            smokeId: 'smoke-1',
            stampKey: 'wrap',
            label: 'Wrapped',
            tone: 'p1',
            at: '2026-07-18T12:00:30.000Z',
            chamberTemp: 243,
          } as never,
        ],
      },
    });
    const { container, socket } = renderView(kit, backend);

    await act(async () => {
      await flushPromises();
    });
    await act(async () => {
      socket.injectEvents(eventsFrame('213', ['145', '92', '78']));
    });
    await act(async () => {
      socket.injectEvents(eventsFrame('218', ['150', '95', '80'], 60));
    });

    await waitFor(() =>
      expect(container.querySelector('circle[data-event-marker="event-1"]')).toBeInTheDocument()
    );
    expect(container.querySelector('circle[data-event-marker="event-1"]')).toHaveAttribute(
      'fill',
      probeColours.probe1
    );
    expect(container.querySelector('text[data-event-letter="event-1"]')).toHaveTextContent('W');
  });

  test('falls back to a default name for a probe nobody named', async () => {
    const kit = harness();
    kit.api.seedSmoking(true).seedProfile({
      chamberName: '',
      probe1Name: '',
      probe2Name: '  ',
      probe3Name: '',
      notes: '',
      woodType: '',
    });
    const { container, socket } = renderView(kit);

    await act(async () => {
      await flushPromises();
    });
    await act(async () => {
      socket.injectEvents(eventsFrame('213', ['145', '92', '78']));
    });
    await act(async () => {
      socket.injectEvents(eventsFrame('218', ['150', '95', '80'], 60));
    });

    ['Chamber', 'Probe 1', 'Probe 2', 'Probe 3'].forEach(name =>
      expect(screen.getByText(name)).toBeInTheDocument()
    );

    // The same names label the readings under a finger on the plot.
    fireEvent(
      container.querySelector('svg') as SVGSVGElement,
      new MouseEvent('pointermove', { bubbles: true, clientX: 193 })
    );
    const card = container.querySelector('[data-hover-card]') as unknown as HTMLElement;

    ['Chamber', 'Probe 1', 'Probe 2', 'Probe 3'].forEach(name =>
      expect(within(card).getByText(name)).toBeInTheDocument()
    );
  });
});

describe('the target lines on the smoke screen', () => {
  test('rules a dashed line per watched probe, in that probe’s colour, at its target', async () => {
    const backend = createFakeBackend({
      appSettings: { settings: settingsWatching({ probe1: 203, probe2: 165 }) },
    });
    const kit = harness();
    kit.api.seedSmoking(true);
    const { container, socket } = renderView(kit, backend);

    await act(async () => {
      await flushPromises();
    });
    await act(async () => {
      socket.injectEvents(eventsFrame('213', ['145', '92', '78']));
    });
    await act(async () => {
      socket.injectEvents(eventsFrame('218', ['150', '95', '80'], 60));
    });

    await waitFor(() => expect(targetLines(container)).toHaveLength(2));
    const drawn = targetLines(container);
    expect(drawn.map(line => line.getAttribute('data-target'))).toEqual(['probe1', 'probe2']);
    expect(drawn[0]).toHaveAttribute('stroke', chartColours.probe1);
    expect(drawn[1]).toHaveAttribute('stroke', chartColours.probe2);
    drawn.forEach(line => expect(line.getAttribute('stroke-dasharray')).toBeTruthy());
    // Each line says what it is, so a reader can tell 203 from 165 at a glance.
    expect(screen.getByText('TARGET 203°')).toBeInTheDocument();
    expect(screen.getByText('TARGET 165°')).toBeInTheDocument();
  });

  test('draws nothing for probes nobody is watching, nor for the chamber range', async () => {
    const backend = createFakeBackend({
      appSettings: {
        settings: {
          // A fire being watched, and no meat: the range the chamber is held
          // inside is not a target and belongs on no chart.
          chamber: { enabled: true, low: 225, high: 275 },
          ...settingsWatching({}),
        },
      },
    });
    const kit = harness();
    kit.api.seedSmoking(true);
    const { container, socket } = renderView(kit, backend);

    await act(async () => {
      await flushPromises();
    });
    await act(async () => {
      socket.injectEvents(eventsFrame('213', ['145', '92', '78']));
    });
    await act(async () => {
      socket.injectEvents(eventsFrame('218', ['150', '95', '80'], 60));
    });

    // The cook is on the chart; only the dashed lines are absent.
    expect(seriesPaths(container)).toHaveLength(4);
    expect(targetLines(container)).toHaveLength(0);
    expect(screen.queryByText(/TARGET/)).not.toBeInTheDocument();
  });

  test('draws the cook without target lines when the settings cannot be read', async () => {
    const backend = createFakeBackend({
      appSettings: { settings: settingsWatching({ probe1: 203 }) },
    });
    backend.injectFault({ method: 'get', path: 'appSettings', status: 503 });
    const kit = harness();
    kit.api.seedSmoking(true);
    const { container, socket } = renderView(kit, backend);

    await act(async () => {
      await flushPromises();
    });
    await act(async () => {
      socket.injectEvents(eventsFrame('213', ['145', '92', '78']));
    });
    await act(async () => {
      socket.injectEvents(eventsFrame('218', ['150', '95', '80'], 60));
    });

    // The cook is what the screen is for, and it is still on the screen.
    expect(seriesPaths(container)).toHaveLength(4);
    seriesPaths(container).forEach(path => expect(path.getAttribute('d')).toBeTruthy());
    expect(targetLines(container)).toHaveLength(0);
  });

  test('keeps a target above the cook so far on the plot', async () => {
    const backend = createFakeBackend({
      appSettings: { settings: settingsWatching({ probe1: 203 }) },
    });
    const kit = harness();
    kit.api.seedSmoking(true);
    const { container, socket } = renderView(kit, backend);

    await act(async () => {
      await flushPromises();
    });
    // A cook that has only just been lit: every reading on the chart, chamber
    // included, is far below the temperature the meat is being taken to.
    await act(async () => {
      socket.injectEvents(eventsFrame('92', ['41', '0', '0']));
    });
    await act(async () => {
      socket.injectEvents(eventsFrame('104', ['46', '0', '0'], 60));
    });

    await waitFor(() => expect(targetLines(container)).toHaveLength(1));
    const plot = plotEdges(plotBoxOf('mobile'));
    const y = Number(targetLines(container)[0].getAttribute('y1'));
    expect(y).toBeGreaterThanOrEqual(plot.top);
    expect(y).toBeLessThanOrEqual(plot.bottom);
  });
});

describe('the shape of the step', () => {
  test('is the design’s four cards, under the status bar, in the design’s order', async () => {
    renderView();

    await act(async () => {
      await flushPromises();
    });

    // Everything the step is made of, in the order it is read down the screen.
    // Stated as the whole list rather than as separate presence checks, because
    // the order is the design's and a card is as easy to insert in the wrong
    // place as to leave out: the estimate belongs under the status bar and
    // above the readings, where the question it answers is asked.
    // Queried by id rather than walked: Testing Library answers in document
    // order, which is the order being asserted.
    const parts = screen
      .getAllByTestId(/^smoke-status-bar$|-card$/)
      .map(part => part.getAttribute('data-testid'));

    expect(parts).toEqual([
      'smoke-status-bar',
      'smoke-completion-card',
      'smoke-temps-card',
      'smoke-chart-card',
      // The cook log reads after the chart: it explains the shape of the plot
      // above it.
      'cook-log-card',
      'smoke-details-card',
    ]);
  });
});

describe('the estimate on the step', () => {
  /** A cook the backend says has reached its target, watched on probe 1. */
  const backendWithFinishedMeat = () =>
    createFakeBackend({
      state: { smokeId: 'smoke-1', smoking: true },
      appSettings: { settings: settingsWatching({ probe1: 203 }) },
      timeline: {
        current: {
          ...NO_CURRENT_TIMELINE,
          startedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
          estimate: {
            state: 'done',
            eta: null,
            hoursRemaining: 0,
            ratePerHour: 1.2,
            progressPercent: 100,
            startTemp: 45,
            targetTemp: 203,
          },
        },
      },
    });

  /**
   * The elapsed clock and the estimate are two halves of one answer, and the
   * backend derives that answer from three collections on every call. The step
   * asks for it once: two hooks each polling the running cook would double the
   * work the server does for a screen that is open for the length of a cook.
   */
  test('asks for the running cook once, for both the clock and the estimate', async () => {
    const backend = backendWithFinishedMeat();
    renderView(harness(), backend);

    await waitFor(() =>
      expect(screen.getByTestId('completion-headline')).toHaveTextContent('Ready now')
    );
    await act(async () => {
      await flushPromises();
    });

    expect(backend.requests.filter(request => request.path === 'timeline/current')).toHaveLength(1);
    // And the clock above the card is drawn from that same read.
    expect(screen.getByTestId('smoke-status-bar')).toHaveTextContent('08:00:00');
  });

  test('shows the running cook’s estimate as the backend answers it', async () => {
    renderView(harness(), backendWithFinishedMeat());

    await waitFor(() =>
      expect(screen.getByTestId('completion-headline')).toHaveTextContent('Ready now')
    );
  });

  /**
   * Reaching the target is a thing to be told, not a thing to be acted on: a
   * pitmaster building bark keeps cooking past it, so nothing advances the
   * wizard, finishes the smoke or puts the fire out on the app's own initiative.
   */
  test('a cook that is done is reported and nothing more', async () => {
    const backend = backendWithFinishedMeat();
    renderView(harness(), backend);

    await waitFor(() =>
      expect(screen.getByTestId('completion-headline')).toHaveTextContent('Ready now')
    );
    await act(async () => {
      await flushPromises();
    });

    // The step is still the step: every card is where it was, and the control
    // still offers to stop the cook rather than having stopped it.
    expect(screen.getByTestId('smoke-temps-card')).toBeInTheDocument();
    expect(screen.getByTestId('next-button')).toBeInTheDocument();
    // Nothing was written: no finish, no session change, no settings save. The
    // screen only ever read.
    expect(backend.requests.filter(request => request.method !== 'get')).toEqual([]);
  });
});

describe('the temperature rows', () => {
  /** Each channel, and the probe colour it is identified by. */
  const channels: [string, keyof typeof probeColours][] = [
    ['chamber', 'chamber'],
    ['probe1', 'probe1'],
    ['probe2', 'probe2'],
    ['probe3', 'probe3'],
  ];

  test.each(channels)(
    'marks the %s row with a dot in its own colour, beside a name in the same colour',
    async channel => {
      const { socket } = renderView();

      await act(async () => {
        await flushPromises();
      });
      await act(async () => {
        socket.injectEvents(eventsFrame('213', ['145', '92', '78']));
      });

      const row = await screen.findByTestId(`smoke-${channel}-row`);
      // The dot and the name carry the same colour, because between them they
      // are the one thing that says which probe this row is: a dot in one
      // colour beside a name in another would identify two probes.
      expect(within(row).getByTestId(`smoke-${channel}-dot`)).toHaveStyle({
        backgroundColor: probeColours[channel],
      });
      expect(within(row).getByTestId(`smoke-${channel}-name-input`)).toHaveStyle({
        color: probeColours[channel],
      });
    }
  );

  test('reads every channel in Fahrenheit, each value in its own row', async () => {
    const { socket } = renderView();

    await act(async () => {
      await flushPromises();
    });
    await act(async () => {
      socket.injectEvents(eventsFrame('213', ['145', '92', '78']));
    });

    const readings = await Promise.all(
      channels.map(async ([channel]) => {
        const row = await screen.findByTestId(`smoke-${channel}-row`);
        return within(row).getByTestId(`smoke-${channel}-temp`).textContent;
      })
    );

    // The unit rides with the number rather than heading the column, so a row
    // read on its own still says what it is: 213°F, not a bare 213.
    //
    // This text is a contract, not a detail: the full-smoke journey waits on
    // these readouts to prove the whole pipeline is delivering frames, and it
    // reads the temperature out of exactly this element. Its half of the
    // contract is pinned by `e2e/src/pageObjects/readouts.test.mts`, and the
    // two move together.
    expect(readings).toEqual(['213°F', '145°F', '92°F', '78°F']);
  });

  /**
   * The probe colours are held to the large-text contrast threshold and no
   * lower — the palette's own contrast suite says so in as many words, because
   * two of the light ones are chart colours first and do not clear the ordinary
   * threshold on a white card. Anything painted in one of them has to be set
   * large and bold, so both the name and the reading are.
   */
  test.each(channels)('sets the %s row large and bold, as its colour requires', async channel => {
    const { socket } = renderView();

    await act(async () => {
      await flushPromises();
    });
    await act(async () => {
      socket.injectEvents(eventsFrame('213', ['145', '92', '78']));
    });

    const row = await screen.findByTestId(`smoke-${channel}-row`);
    [
      within(row).getByTestId(`smoke-${channel}-name-input`),
      within(row).getByTestId(`smoke-${channel}-temp`),
    ].forEach(painted => {
      // WCAG counts text large from 14pt — 18.66px — when it is bold.
      expect(parseFloat(getComputedStyle(painted).fontSize)).toBeGreaterThanOrEqual(18.66);
      expect(parseInt(getComputedStyle(painted).fontWeight, 10)).toBeGreaterThanOrEqual(700);
    });
  });

  test('renaming a probe in its row is what gets saved when the step is left', async () => {
    const { api, unmount } = renderView();

    await act(async () => {
      await flushPromises();
    });

    fireEvent.change(screen.getByTestId('smoke-probe1-name-input'), {
      target: { value: 'Brisket Flat' },
    });

    await act(async () => {
      unmount();
      await flushPromises();
    });

    // The rename reaches the profile the step has always saved on the way out —
    // the row is a new way to type the name, not a new place to keep it.
    expect(api.calls.find(call => call.method === 'saveProfile')?.args[0]).toMatchObject({
      probe1Name: 'Brisket Flat',
      chamberName: 'Chamber',
    });
  });

  test('gathers the rows into one card, ruled off from each other', async () => {
    renderView();

    const card = await screen.findByTestId('smoke-temps-card');
    channels.forEach(([channel]) =>
      expect(within(card).getByTestId(`smoke-${channel}-row`)).toBeInTheDocument()
    );
    // Three rules for four rows: the dividers separate the readings from each
    // other, they do not fence the card's own edges.
    expect(within(card).getAllByRole('separator')).toHaveLength(3);
  });
});

/**
 * The one control on the step that changes the world: it lights the cook, and
 * it puts it out. The design gives its two states two appearances, because the
 * cost of pressing it by mistake is not the same in both.
 */
describe('the start and stop control', () => {
  test('offers the cook in the accent while nothing is running', async () => {
    renderView();

    await act(async () => {
      await flushPromises();
    });

    const control = screen.getByTestId('smoke-start-button');
    expect(control).toHaveTextContent('Start Smoking');
    expect(control).toHaveStyle({ backgroundColor: designColours.accent });
  });

  test('turns into a danger outline once the cook is running', async () => {
    const { socket } = renderView();

    await act(async () => {
      await flushPromises();
    });

    fireEvent.click(screen.getByTestId('smoke-start-button'));
    await act(async () => {
      await flushPromises();
    });

    const control = screen.getByTestId('smoke-start-button');
    expect(control).toHaveTextContent('Stop Smoking');
    // Outlined, not filled: stopping a cook is not the thing the screen is
    // inviting, so it is drawn as the quieter of the two — and in the danger
    // colour, because it is the destructive one.
    expect(control).toHaveStyle({
      color: designColours.danger,
      borderColor: designColours.danger,
    });
    expect(control).not.toHaveStyle({ backgroundColor: designColours.accent });
    // The state the button is drawn from is the session's, not a local guess:
    // the same flip is what the status bar reads.
    expect(socket.emittedSmokeUpdates.at(-1)?.smoking).toBe(true);
    expect(screen.getByTestId('smoke-status-label')).toHaveTextContent('Smoking');
  });
});

/**
 * The wood is a picker in the design and a free-text field in the product, and
 * it has to stay both: the list is what almost every cook picks from, and the
 * field is what stops an unusual one being impossible to record.
 */
describe('the wood picker', () => {
  test('opens like a select, on the design’s list of woods', async () => {
    renderView();

    await act(async () => {
      await flushPromises();
    });

    // The affordance that makes it read as a select rather than as a text box:
    // something to press that shows the list.
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    const offered = screen.getAllByRole('option').map(option => option.textContent);
    expect(offered).toEqual(['Hickory', 'Post Oak', 'Pecan', 'Cherry', 'Apple', 'Mesquite']);
  });

  test('takes a wood nobody listed, and saves it with the rest of the draft', async () => {
    const { api, unmount } = renderView();

    await act(async () => {
      await flushPromises();
    });

    fireEvent.change(screen.getByTestId('smoke-wood-type-input'), {
      target: { value: 'Grapevine' },
    });

    await act(async () => {
      unmount();
      await flushPromises();
    });

    expect(api.calls.find(call => call.method === 'saveProfile')?.args[0]).toMatchObject({
      woodType: 'Grapevine',
    });
  });
});

describe('the chart card', () => {
  test('heads the plot with what it is, and keeps its legend under it in the same card', async () => {
    const { container } = renderView();

    const card = await screen.findByTestId('smoke-chart-card');
    expect(within(card).getByText('TEMPERATURE HISTORY')).toBeInTheDocument();

    const plot = within(card).getByRole('img', { name: 'Temperature chart' });
    const swatches = card.querySelectorAll('[data-legend-swatch]');
    expect(swatches).toHaveLength(4);
    // The legend belongs to the plot above it, so it is inside the same card
    // and after it — a key printed above a graph names lines nobody has seen
    // yet.
    expect(plot.compareDocumentPosition(swatches[0])).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    // And there is exactly one plot on the screen: the card holds the chart,
    // it does not sit beside a second copy of it.
    expect(container.querySelectorAll('svg[role="img"]')).toHaveLength(1);
  });
});

describe('SmokeStepView', () => {
  test('shows each inbound temperature on its own readout, chamber and three probes', async () => {
    const { socket } = renderView();

    await act(async () => {
      await flushPromises();
    });

    // Four distinct values, so a readout wired to the wrong probe cannot pass.
    await act(async () => {
      socket.injectEvents(eventsFrame('213', ['145', '92', '78']));
    });

    await waitFor(() => {
      expect(screen.getByTestId('smoke-chamber-temp')).toHaveTextContent('213');
    });
    expect(screen.getByTestId('smoke-probe1-temp')).toHaveTextContent('145');
    expect(screen.getByTestId('smoke-probe2-temp')).toHaveTextContent('92');
    expect(screen.getByTestId('smoke-probe3-temp')).toHaveTextContent('78');
  });

  test('editing the chamber name broadcasts the full five-field smokeUpdate', async () => {
    const { socket } = renderView();

    await act(async () => {
      await flushPromises();
    });

    const chamberInput = screen.getByTestId('smoke-chamber-name-input');
    fireEvent.change(chamberInput, { target: { value: 'Offset' } });

    expect(chamberInput).toHaveValue('Offset');
    expect(socket.emittedSmokeUpdates).toEqual([
      {
        smoking: false,
        chamberName: 'Offset',
        probe1Name: 'probe 1',
        probe2Name: 'probe 2',
        probe3Name: 'probe 3',
      },
    ]);
  });

  test('editing each probe name dispatches its own targeted rename', async () => {
    const { socket } = renderView();

    await act(async () => {
      await flushPromises();
    });

    const nameOf = (probe: string) => screen.getByTestId(`smoke-${probe}-name-input`);
    fireEvent.change(nameOf('probe1'), { target: { value: 'Point' } });
    fireEvent.change(nameOf('probe2'), { target: { value: 'Flat' } });
    fireEvent.change(nameOf('probe3'), { target: { value: 'Ambient' } });

    expect(nameOf('probe1')).toHaveValue('Point');
    expect(nameOf('probe2')).toHaveValue('Flat');
    expect(nameOf('probe3')).toHaveValue('Ambient');
    // The last broadcast carries every accumulated rename in the five-field frame.
    expect(socket.emittedSmokeUpdates.at(-1)).toEqual({
      smoking: false,
      chamberName: 'Chamber',
      probe1Name: 'Point',
      probe2Name: 'Flat',
      probe3Name: 'Ambient',
    });
  });

  test('an inbound smokeUpdate flips smoking but never clobbers a name being edited', async () => {
    const { socket } = renderView();

    await act(async () => {
      await flushPromises();
    });

    // The user is mid-edit on the chamber name locally.
    const chamberInput = screen.getByTestId('smoke-chamber-name-input');
    fireEvent.change(chamberInput, { target: { value: 'My Local Name' } });

    // A remote smokeUpdate arrives carrying a different name and smoking=true.
    await act(async () => {
      socket.injectSmokeUpdate({
        smoking: true,
        chamberName: 'Remote Name',
        probe1Name: 'r1',
        probe2Name: 'r2',
        probe3Name: 'r3',
      });
    });

    // Smoking flipped, but the locally edited name is preserved.
    await waitFor(() => {
      expect(screen.getByText('Stop Smoking')).toBeInTheDocument();
    });
    expect(screen.getByTestId('smoke-chamber-name-input')).toHaveValue('My Local Name');
  });

  test('leaving the step saves the current profile draft exactly once', async () => {
    const { api, unmount } = renderView();

    await act(async () => {
      await flushPromises();
    });

    // Edit the free-text draft fields (wood type + notes).
    fireEvent.change(screen.getByTestId('smoke-wood-type-input'), { target: { value: 'Cherry' } });
    fireEvent.change(screen.getByTestId('smoke-notes-input'), { target: { value: 'wrap at 165' } });

    await act(async () => {
      unmount();
      await flushPromises();
    });

    expect(api.countCalls('saveProfile')).toBe(1);
    const saved = api.calls.find(call => call.method === 'saveProfile');
    expect(saved?.args[0]).toMatchObject({ woodType: 'Cherry', notes: 'wrap at 165' });
  });

  test('the smoking button toggles persisted state and broadcasts the update', async () => {
    const { socket, api } = renderView();

    await act(async () => {
      await flushPromises();
    });

    expect(screen.getByText('Start Smoking')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Start Smoking'));
    await act(async () => {
      await flushPromises();
    });

    expect(api.countCalls('toggleSmoking')).toBe(1);
    expect(socket.emittedSmokeUpdates).toHaveLength(1);
    expect(socket.emittedSmokeUpdates[0].smoking).toBe(true);
    expect(await screen.findByText('Stop Smoking')).toBeInTheDocument();
  });

  test('the start/stop control is addressable by a stable id and labels the smoking state', async () => {
    const { socket } = renderView();

    await act(async () => {
      await flushPromises();
    });

    // The control's label *is* the state it offers, so a journey that stops a
    // cook reads the stopped state off this one element rather than off the
    // absence of another.
    expect(screen.getByTestId('smoke-start-button')).toHaveTextContent('Start Smoking');

    await act(async () => {
      socket.injectSmokeUpdate({
        smoking: true,
        chamberName: 'Chamber',
        probe1Name: 'probe 1',
        probe2Name: 'probe 2',
        probe3Name: 'probe 3',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('smoke-start-button')).toHaveTextContent('Stop Smoking');
    });
  });

  test('a refresh signal reloads the chart baseline', async () => {
    const noon = new Date('2026-07-18T12:00:00.000Z');
    const kit = harness();
    kit.api.seedTemps([{ ChamberTemp: 1, MeatTemp: 1, Meat2Temp: 1, Meat3Temp: 1, date: noon }]);
    const { container, socket, api } = renderView(kit);

    await act(async () => {
      await flushPromises();
    });

    // One reading is a dot, not a line: nothing has been drawn between moments.
    const chamberLine = (): string =>
      container.querySelector('path[data-series="chamber"]')?.getAttribute('d') ?? '';
    expect(chamberLine()).not.toMatch(/[LC]/);

    // A newer baseline is now available; a refresh must re-pull it.
    api.seedTemps([
      { ChamberTemp: 2, MeatTemp: 2, Meat2Temp: 2, Meat3Temp: 2, date: noon },
      {
        ChamberTemp: 3,
        MeatTemp: 3,
        Meat2Temp: 3,
        Meat3Temp: 3,
        date: new Date(noon.getTime() + 60_000),
      },
    ]);

    await act(async () => {
      socket.injectRefresh();
      await flushPromises();
    });

    // The reloaded history is what the chart now draws: two moments, so a line.
    await waitFor(() => expect(chamberLine()).toMatch(/[LC]/));
  });
});

describe('SmokeStep composition root', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createCloudSocketAdapter } = require('smoke-session/src/adapters/cloud-socket') as {
    createCloudSocketAdapter: jest.Mock;
  };
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getDefaultApiClient } = require('../../../api') as { getDefaultApiClient: jest.Mock };

  beforeEach(() => {
    // CRA resets mocks before each test, so (re)install implementations here.
    createCloudSocketAdapter.mockReturnValue(inertCloudPort());
    getDefaultApiClient.mockReturnValue(fakeApiClient());
    delete process.env.WS_URL;
  });

  test('opens the cloud socket at WS_URL and renders the view under the Provider', async () => {
    process.env.WS_URL = 'ws://cloud.example';

    render(
      <ApiClientProvider client={createApiClient(createFakeBackend())}>
        <DesignSurface>
          <SmokeStep nextButton={nextButton} />
        </DesignSurface>
      </ApiClientProvider>
    );
    await act(async () => {
      await flushPromises();
    });

    expect(createCloudSocketAdapter).toHaveBeenCalledWith('ws://cloud.example');
    expect(screen.getByRole('img', { name: 'Temperature chart' })).toBeInTheDocument();
    expect(screen.getByTestId('next-button')).toBeInTheDocument();
  });

  /**
   * The injection seam is the root's to honour: a step rendered with a cook-log
   * channel must use that one. A root that dropped the prop would fall back to
   * opening a second websocket of its own — in every test that renders the
   * wizard, and behind every screen that means to hand one in.
   */
  test('hands the injected cook-log channel down to the view', async () => {
    const listeners: ((events: unknown[]) => void)[] = [];
    const subscription = {
      subscribe: (listener: (events: unknown[]) => void) => {
        listeners.push(listener);
        return () => undefined;
      },
    };

    render(
      <ApiClientProvider client={createApiClient(createFakeBackend())}>
        <DesignSurface>
          <SmokeStep nextButton={nextButton} cookEventsSubscription={subscription} />
        </DesignSurface>
      </ApiClientProvider>
    );
    await act(async () => {
      await flushPromises();
    });

    expect(listeners).toHaveLength(1);

    await act(async () => {
      listeners[0]([
        {
          _id: 'event-root',
          smokeId: 'smoke-1',
          stampKey: 'wrap',
          label: 'Wrapped',
          tone: 'p1',
          at: '2026-08-25T13:00:00.000Z',
          chamberTemp: 250,
        },
      ]);
      await flushPromises();
    });

    expect(within(screen.getByTestId('cook-event-row')).getByText('Wrapped')).toBeInTheDocument();
  });

  test('defaults the socket URL to empty string when WS_URL is unset', async () => {
    render(
      <ApiClientProvider client={createApiClient(createFakeBackend())}>
        <DesignSurface>
          <SmokeStep nextButton={nextButton} />
        </DesignSurface>
      </ApiClientProvider>
    );
    await act(async () => {
      await flushPromises();
    });

    expect(createCloudSocketAdapter).toHaveBeenCalledWith('');
  });

  test('closes the cloud socket when the step unmounts (no leaked connection)', async () => {
    const port = inertCloudPort();
    const close = jest.fn();
    createCloudSocketAdapter.mockReturnValue({ ...port, close });

    const { unmount } = render(
      <ApiClientProvider client={createApiClient(createFakeBackend())}>
        <DesignSurface>
          <SmokeStep nextButton={nextButton} />
        </DesignSurface>
      </ApiClientProvider>
    );
    await act(async () => {
      await flushPromises();
    });

    expect(close).not.toHaveBeenCalled();

    await act(async () => {
      unmount();
      await flushPromises();
    });

    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('SmokeStepView — the cook status bar', () => {
  /** A session whose cook has been running for two hours, as the backend has it. */
  const backendWithRunningCook = () =>
    createFakeBackend({
      state: { smokeId: 'smoke-1', smoking: true },
      timeline: {
        current: {
          ...NO_CURRENT_TIMELINE,
          startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        },
      },
    });

  test('the step carries a status bar clocked from the start the backend recorded', async () => {
    renderView(harness(), backendWithRunningCook());

    await waitFor(() =>
      expect(screen.getByTestId('smoke-elapsed-clock')).not.toHaveTextContent('00:00:00')
    );
    // Two hours in, however many seconds have passed since the seed was built.
    expect(screen.getByTestId('smoke-elapsed-clock').textContent).toMatch(/^0[12]:\d\d:\d\d$/);
  });

  test('the bar states the session smoking flag, not a guess of its own', async () => {
    const kit = harness();
    renderView(kit, backendWithRunningCook());
    await act(async () => {
      await flushPromises();
    });

    expect(screen.getByTestId('smoke-status-label')).toHaveTextContent('Paused');

    // Pressing Start Smoking flips the persisted flag through the session.
    fireEvent.click(screen.getByTestId('smoke-start-button'));
    await act(async () => {
      await flushPromises();
    });

    expect(screen.getByTestId('smoke-status-label')).toHaveTextContent('Smoking');
  });
});

/**
 * Lighting the smoker over a cook the backend already stopped by itself.
 *
 * A session whose cook carries a finish stamp is one nobody pressed End Smoke
 * on: the backend stopped it when its readings dried up and left it current so
 * the wizard can still be walked. Starting a new cook on top of it would append
 * a second cook's readings to the first one's series, which is the very
 * pollution the auto-stop exists to undo — so the step asks first.
 */
describe('SmokeStepView — starting a cook over an auto-stopped one', () => {
  /** A cook the backend auto-stopped: started, finished, and still current. */
  const autoStoppedBackend = () =>
    createFakeBackend({
      state: { smokeId: 'smoke-1', smoking: false },
      timeline: {
        current: {
          ...NO_CURRENT_TIMELINE,
          startedAt: '2026-08-20T12:00:00.000Z',
          finishedAt: '2026-08-20T21:30:00.000Z',
        },
      },
    });

  test('asks before lighting the smoker, and lights nothing until it is answered', async () => {
    const kit = harness();
    renderView(kit, autoStoppedBackend());
    await act(async () => {
      await flushPromises();
    });

    fireEvent.click(screen.getByTestId('smoke-start-button'));
    await act(async () => {
      await flushPromises();
    });

    expect(screen.getByTestId('stale-cook-dialog')).toBeInTheDocument();
    // Nothing has been flipped: the session is exactly as it was, and the
    // control still offers the cook the user asked for.
    expect(kit.api.countCalls('toggleSmoking')).toBe(0);
    expect(screen.getByTestId('smoke-start-button')).toHaveTextContent('Start Smoking');
  });

  test('one tap finishes the previous cook, starts a fresh session and lights it', async () => {
    const kit = harness();
    const backend = autoStoppedBackend();
    renderView(kit, backend);
    await act(async () => {
      await flushPromises();
    });

    fireEvent.click(screen.getByTestId('smoke-start-button'));
    await act(async () => {
      await flushPromises();
    });
    fireEvent.click(screen.getByTestId('stale-cook-confirm'));
    await act(async () => {
      await flushPromises();
    });
    // The recovery outlives one turn of the event loop: the session the
    // pre-smoke save creates is not the current one until the backend has
    // linked it, and the fire is not lit until it is.
    await waitFor(() => expect(kit.api.countCalls('toggleSmoking')).toBe(1));

    // The existing finish flow ran — archive, then let the state go of it —
    // and a blank pre-smoke created the session that takes its place.
    const done = backend.requests.filter(
      request =>
        request.path === 'smoke/finish' ||
        request.path === 'state/clearSmoke' ||
        request.path === 'presmoke'
    );
    expect(done.map(request => request.path)).toEqual([
      'smoke/finish',
      'state/clearSmoke',
      'presmoke',
    ]);
    // Nothing is sent with the finish: the time the cook really ended is the
    // backdated stamp the backend already wrote, and this flow does not move it.
    expect(done[0].body).toBeUndefined();
    // And the state points at the session that took the archived cook's place.
    expect(backend.store.state).toEqual({ smokeId: 'smoke-next', smoking: false });
    await waitFor(() =>
      expect(screen.getByTestId('smoke-start-button')).toHaveTextContent('Stop Smoking')
    );
    // The question has been answered, so it goes (once the dialog's own closing
    // transition has run).
    await waitFor(() => expect(screen.queryByTestId('stale-cook-dialog')).not.toBeInTheDocument());
  });
  test('declining changes nothing at all — no cook, no session, no smoke', async () => {
    const kit = harness();
    const backend = autoStoppedBackend();
    renderView(kit, backend);
    await act(async () => {
      await flushPromises();
    });

    fireEvent.click(screen.getByTestId('smoke-start-button'));
    await act(async () => {
      await flushPromises();
    });
    fireEvent.click(screen.getByTestId('stale-cook-cancel'));
    await act(async () => {
      await flushPromises();
    });

    expect(kit.api.countCalls('toggleSmoking')).toBe(0);
    expect(
      backend.requests.filter(request => request.method !== 'get').map(request => request.path)
    ).toEqual([]);
    expect(backend.store.state).toEqual({ smokeId: 'smoke-1', smoking: false });
    expect(screen.getByTestId('smoke-start-button')).toHaveTextContent('Start Smoking');
    await waitFor(() => expect(screen.queryByTestId('stale-cook-dialog')).not.toBeInTheDocument());
  });

  test('a cook with no finish stamp is lit straight away, as it always was', async () => {
    const kit = harness();
    renderView(
      kit,
      createFakeBackend({
        state: { smokeId: 'smoke-1', smoking: false },
        timeline: { current: { ...NO_CURRENT_TIMELINE, startedAt: '2026-08-23T12:00:00.000Z' } },
      })
    );
    await act(async () => {
      await flushPromises();
    });

    fireEvent.click(screen.getByTestId('smoke-start-button'));
    await act(async () => {
      await flushPromises();
    });

    expect(screen.queryByTestId('stale-cook-dialog')).not.toBeInTheDocument();
    expect(kit.api.countCalls('toggleSmoking')).toBe(1);
    await waitFor(() =>
      expect(screen.getByTestId('smoke-start-button')).toHaveTextContent('Stop Smoking')
    );
  });
  /**
   * Putting a cook out cannot pollute anything, so it is never asked about —
   * not even on the session that would be asked about on the way in.
   */
  test('never asks on the way out of a cook', async () => {
    const kit = harness();
    kit.api.seedSmoking(true);
    renderView(kit, autoStoppedBackend());
    await act(async () => {
      await flushPromises();
    });

    fireEvent.click(screen.getByTestId('smoke-start-button'));
    await act(async () => {
      await flushPromises();
    });

    expect(screen.queryByTestId('stale-cook-dialog')).not.toBeInTheDocument();
    expect(kit.api.countCalls('toggleSmoking')).toBe(1);
  });

  /**
   * A stamp that cannot be read is not evidence of one. A backend that is down
   * — or too old to answer the route — leaves the control doing what it did
   * before this guard existed rather than standing between a pitmaster and
   * their fire.
   */
  test('lights the cook anyway when the stamp cannot be read', async () => {
    const kit = harness();
    const backend = autoStoppedBackend();
    backend.injectFault({ method: 'get', path: 'timeline/current', status: 503 });
    renderView(kit, backend);
    await act(async () => {
      await flushPromises();
    });

    fireEvent.click(screen.getByTestId('smoke-start-button'));
    await act(async () => {
      await flushPromises();
    });

    expect(screen.queryByTestId('stale-cook-dialog')).not.toBeInTheDocument();
    expect(kit.api.countCalls('toggleSmoking')).toBe(1);
  });

  /**
   * The recovery is three writes, and the first of them can fail. Nothing is
   * claimed to have happened when it does: the question stays on screen,
   * because it is still the question to answer.
   */
  test('keeps asking when the previous cook could not be finished', async () => {
    const kit = harness();
    const backend = autoStoppedBackend();
    renderView(kit, backend);
    await act(async () => {
      await flushPromises();
    });

    fireEvent.click(screen.getByTestId('smoke-start-button'));
    await act(async () => {
      await flushPromises();
    });
    backend.injectFault({ method: 'post', path: 'smoke/finish', status: 503 });
    fireEvent.click(screen.getByTestId('stale-cook-confirm'));
    await act(async () => {
      await flushPromises();
    });

    expect(screen.getByTestId('stale-cook-dialog')).toBeInTheDocument();
    // The session is untouched: nothing was archived, so nothing is cleared and
    // no cook is lit over it.
    expect(backend.store.state).toEqual({ smokeId: 'smoke-1', smoking: false });
    expect(kit.api.countCalls('toggleSmoking')).toBe(0);
    // And the answer can simply be given again.
    expect(screen.getByTestId('stale-cook-confirm')).not.toBeDisabled();
  });
  /**
   * Dismissing the question by any route is the same answer as Keep session:
   * the only thing that changes anything is choosing to.
   */
  test('escaping the question declines it', async () => {
    const kit = harness();
    const backend = autoStoppedBackend();
    renderView(kit, backend);
    await act(async () => {
      await flushPromises();
    });

    fireEvent.click(screen.getByTestId('smoke-start-button'));
    await act(async () => {
      await flushPromises();
    });
    fireEvent.keyDown(screen.getByTestId('stale-cook-dialog'), { key: 'Escape', code: 'Escape' });
    await act(async () => {
      await flushPromises();
    });

    await waitFor(() => expect(screen.queryByTestId('stale-cook-dialog')).not.toBeInTheDocument());
    expect(kit.api.countCalls('toggleSmoking')).toBe(0);
    expect(backend.requests.filter(request => request.method !== 'get')).toEqual([]);
  });

  /**
   * The backend answers the pre-smoke save before the smoke it creates has been
   * linked to the state, so for a beat there is no current cook at all — and a
   * toggle sent into that beat acts on nothing: it flips no flag, says nothing,
   * and leaves a pitmaster who pressed Start looking at a cold smoker.
   */
  test('lights the fire only on a session the backend has made current', async () => {
    const kit = harness();
    const backend = autoStoppedBackend();
    // Which cook the state named at the moment the fire was lit, which is the
    // whole question: a session, or the gap where one was about to be.
    let currentWhenLit: string | undefined | null = null;
    const lightTheFire = kit.api.toggleSmoking.bind(kit.api);
    kit.api.toggleSmoking = () => {
      currentWhenLit = backend.store.state?.smokeId;
      return lightTheFire();
    };
    renderView(kit, backend);
    await act(async () => {
      await flushPromises();
    });

    fireEvent.click(screen.getByTestId('smoke-start-button'));
    await act(async () => {
      await flushPromises();
    });
    fireEvent.click(screen.getByTestId('stale-cook-confirm'));
    await waitFor(() => expect(kit.api.countCalls('toggleSmoking')).toBe(1));

    expect(currentWhenLit).toBe('smoke-next');
  });

  /**
   * And when the session never becomes the current one, nothing is claimed to
   * have happened: no fire is lit over a cook that may not exist, and the
   * question is still there to be answered again.
   */
  test('lights nothing when the new session never becomes current', async () => {
    const kit = harness();
    const backend = autoStoppedBackend();
    renderView(kit, backend);
    await act(async () => {
      await flushPromises();
    });

    fireEvent.click(screen.getByTestId('smoke-start-button'));
    await act(async () => {
      await flushPromises();
    });
    // The state cannot be read for as long as the recovery is willing to wait,
    // so whether the session was created is a question with no answer.
    backend.injectFault({ method: 'get', path: 'state', status: 503 });
    fireEvent.click(screen.getByTestId('stale-cook-confirm'));

    await waitFor(() => expect(screen.getByTestId('stale-cook-confirm')).not.toBeDisabled(), {
      timeout: 3000,
    });
    expect(kit.api.countCalls('toggleSmoking')).toBe(0);
    expect(screen.getByTestId('stale-cook-dialog')).toBeInTheDocument();
  });

  /**
   * The step is not remounted by the recovery, and what it is holding is what it
   * saves when it is left — so the archived cook's description has to be let go
   * of deliberately, or the next cook silently inherits notes nobody typed for
   * it.
   */
  test('describes the new cook from scratch, and saves it that way', async () => {
    const kit = harness();
    kit.api.seedProfile({
      chamberName: 'Offset',
      probe1Name: 'probe 1',
      probe2Name: 'probe 2',
      probe3Name: 'probe 3',
      notes: 'Wrapped at 165, pulled at 203',
      woodType: 'Hickory',
    });
    const backend = autoStoppedBackend();
    const { unmount } = renderView(kit, backend);
    await act(async () => {
      await flushPromises();
    });

    fireEvent.click(screen.getByTestId('smoke-start-button'));
    await act(async () => {
      await flushPromises();
    });
    fireEvent.click(screen.getByTestId('stale-cook-confirm'));
    await waitFor(() => expect(kit.api.countCalls('toggleSmoking')).toBe(1));

    expect(screen.getByTestId('smoke-notes-input')).toHaveValue('');
    expect(screen.getByTestId('smoke-wood-type-input')).toHaveValue('');

    // Leaving the step is what writes the description down, and what it writes
    // is the new cook's own — not a word of the cook that was archived.
    unmount();
    await act(async () => {
      await flushPromises();
    });
    const saved = kit.api.calls.filter(call => call.method === 'saveProfile').pop();
    expect(saved?.args[0]).toMatchObject({ notes: '', woodType: '' });
  });
});

/**
 * The cook log lives on this step and only on this step: a stamp is something
 * done to a cook that is running, so the card is not offered before one starts
 * or after it is over (see the pre-smoke and post-smoke steps, which render no
 * such card).
 */
describe('the cook log on the smoke screen', () => {
  test('offers the stamps under the chart, and lists what has been logged', async () => {
    const kit = harness();
    kit.api.seedSmoking(true);
    const backend = createFakeBackend({ state: { smokeId: 'smoke-1', smoking: true } });
    renderView(kit, backend);

    await act(async () => {
      await flushPromises();
    });

    // Under the chart, where the design puts it — the plot is what the log
    // explains. Testing Library answers in document order, which is the order
    // being asserted here.
    expect(
      screen
        .getAllByTestId(/^smoke-chart-card$|^cook-log-card$/)
        .map(card => card.getAttribute('data-testid'))
    ).toEqual(['smoke-chart-card', 'cook-log-card']);

    fireEvent.click(screen.getByTestId('cook-stamp-wrap'));
    await act(async () => {
      await flushPromises();
    });

    expect(
      backend.requests.some(request => request.method === 'post' && request.path === 'cook-events')
    ).toBe(true);
    await screen.findByTestId('cook-event-row');
    expect(within(screen.getByTestId('cook-event-row')).getByText('Wrapped')).toBeInTheDocument();
  });

  test('will not stamp a cook that is not running', async () => {
    const kit = harness();
    kit.api.seedSmoking(false);
    renderView(kit, createFakeBackend({ state: { smokeId: 'smoke-1', smoking: false } }));

    await act(async () => {
      await flushPromises();
    });

    expect(screen.getByTestId('cook-stamp-wood')).toBeDisabled();
  });
});
