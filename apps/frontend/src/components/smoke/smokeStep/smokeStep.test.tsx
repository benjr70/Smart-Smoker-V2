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
  StoredApplicationSettings,
} from '../../../api/fakeBackend';
import { DesignSurface, carbonLight, resolveDesignPalette } from '../../../theme';

// The package's `flushPromises` uses `setImmediate`, which is absent from the
// frontend's jsdom test environment; a `setTimeout(0)` macrotask drains the
// store's fire-and-forget startup/command promises just the same.
const flushPromises = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

// Mock Material-UI so the thin view can be driven and queried by simple test
// ids; all real behavior flows through the fake socket/api (the true boundary).
jest.mock('@mui/material', () => ({
  Grid: ({ children, container, item, xs, direction, className, sx, ...props }: any) => (
    <div data-testid="grid" className={className} {...props}>
      {children}
    </div>
  ),
  Autocomplete: ({ freeSolo, options, inputValue, onInputChange, renderInput, ...props }: any) => (
    <div
      data-testid="autocomplete"
      data-free-solo={freeSolo}
      data-options={JSON.stringify(options)}
    >
      <input
        data-testid="autocomplete-input"
        value={inputValue || ''}
        onChange={(e: any) => onInputChange && onInputChange(e, e.target.value)}
        placeholder="Wood Type"
      />
    </div>
  ),
  Button: ({ children, onClick, ...props }: any) => (
    <button data-testid="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Divider: ({ variant: _variant, ...props }: any) => <hr data-testid="divider" {...props} />,
  Box: ({ children, sx: _sx, ...props }: any) => <div {...props}>{children}</div>,
  Typography: ({ children, sx: _sx, variant: _variant, ...props }: any) => (
    <span {...props}>{children}</span>
  ),
  Input: ({ value, onChange, defaultValue: _dv, disableUnderline: _du, sx: _sx }: any) => (
    <input data-testid="input" value={value || ''} onChange={onChange} />
  ),
  // `inputProps` (MUI's escape hatch onto the inner input element, which is
  // where the fields' e2e test ids live) is swallowed rather than forwarded:
  // this stub is a flat `<input>`, so it has no inner element to model, and
  // spreading the object onto the DOM would only earn a React warning. Whether
  // those ids reach the element a browser types into is proven against real MUI
  // by the full-smoke e2e journey.
  TextField: ({ label, value, onChange, multiline, rows, inputProps: _ip, ...props }: any) => (
    <input
      data-testid="text-field"
      data-label={label}
      value={value || ''}
      onChange={onChange}
      data-multiline={multiline}
      data-rows={rows}
      {...props}
    />
  ),
}));

// The chart itself is not stubbed: it is plain React SVG now, so what it draws
// from the session is assertable here rather than being taken on trust from the
// props it was handed.

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
 * The step's layout grid is imported straight from Material-UI rather than
 * through the barrel this file mocks, so it is a real component and reads the
 * theme: the readouts are painted from the probe colours the design carries.
 * Wrapping the way the application root wraps its tree hands them over.
 */
function renderView(kit = harness(), backend: FakeBackend = createFakeBackend()) {
  const utils = render(
    <ApiClientProvider client={createApiClient(backend)}>
      <DesignSurface>
        <SmokeSessionProvider config={kit.config}>
          <SmokeStepView nextButton={nextButton} />
        </SmokeSessionProvider>
      </DesignSurface>
    </ApiClientProvider>
  );
  return { ...utils, ...kit };
}

/** The four lines the chart draws, in the order it draws them. */
const seriesPaths = (container: HTMLElement): SVGPathElement[] =>
  Array.from(container.querySelectorAll<SVGPathElement>('path[data-series]'));

/** The dashed target lines the chart rules across the plot. */
const targetLines = (container: HTMLElement): SVGLineElement[] =>
  Array.from(container.querySelectorAll<SVGLineElement>('line[data-target]'));

/** The chart colours the smoke screen draws under in a test, which is light. */
const chartColours = resolveDesignPalette(carbonLight).chart;

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

    const chamberInput = screen.getAllByTestId('input')[0];
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

    const inputs = () => screen.getAllByTestId('input');
    fireEvent.change(inputs()[1], { target: { value: 'Point' } });
    fireEvent.change(inputs()[2], { target: { value: 'Flat' } });
    fireEvent.change(inputs()[3], { target: { value: 'Ambient' } });

    expect(inputs()[1]).toHaveValue('Point');
    expect(inputs()[2]).toHaveValue('Flat');
    expect(inputs()[3]).toHaveValue('Ambient');
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
    const chamberInput = screen.getAllByTestId('input')[0];
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
    expect(screen.getAllByTestId('input')[0]).toHaveValue('My Local Name');
  });

  test('leaving the step saves the current profile draft exactly once', async () => {
    const { api, unmount } = renderView();

    await act(async () => {
      await flushPromises();
    });

    // Edit the free-text draft fields (wood type + notes).
    fireEvent.change(screen.getByTestId('autocomplete-input'), { target: { value: 'Cherry' } });
    fireEvent.change(screen.getByTestId('text-field'), { target: { value: 'wrap at 165' } });

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
        records: {
          'smoke-1': {
            startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            finishedAt: null,
            durationMs: null,
            peakChamber: null,
            peakMeat: null,
            targetTemp: null,
          },
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
