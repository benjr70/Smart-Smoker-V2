import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SmokeStep, SmokeStepView } from './smokeStep';
import { SmokeSessionProvider } from 'smoke-session/src/react';
import { SessionConfig } from 'smoke-session/src';
import { encodeEvents } from 'smoke-session/src';
import { FakeCloudSocket, FakeSessionApi, SteppingClock } from 'smoke-session/src/testing';

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
  Input: ({ value, onChange, defaultValue: _dv, disableUnderline: _du, sx: _sx }: any) => (
    <input data-testid="input" value={value || ''} onChange={onChange} />
  ),
  TextField: ({ label, value, onChange, multiline, rows, ...props }: any) => (
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

// Mock the D3 TempChart: it renders SVG through d3 which jsdom cannot exercise;
// the view's contract is that it forwards the snapshot fields as props.
jest.mock('temperaturechart/src/tempChart', () => ({
  __esModule: true,
  default: ({ ChamberTemp, ChamberName, smoking, initData }: any) => (
    <div
      data-testid="temp-chart"
      data-chamber-temp={ChamberTemp}
      data-chamber-name={ChamberName}
      data-smoking={smoking ? 'true' : 'false'}
      data-init-data={JSON.stringify(initData)}
    />
  ),
}));

// The composition root opens a real cloud socket and pairs the store with the
// production API client. Automock both boundaries — the cloud-socket adapter
// factory (which owns the only socket.io import) and the default API client — so
// the host test asserts the wiring without touching a network. Implementations
// are (re)installed in each test's beforeEach because CRA runs `resetMocks`.
jest.mock('smoke-session/src/adapters/cloud-socket');
jest.mock('../../../api');

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

/** A frozen `events` frame carrying the given chamber temperature. */
function eventsFrame(chamberTemp: string): string {
  return encodeEvents({
    chamberName: 'Chamber',
    probe1Name: 'probe 1',
    probe2Name: 'probe 2',
    probe3Name: 'probe 3',
    probeTemp1: '0',
    probeTemp2: '0',
    probeTemp3: '0',
    chamberTemp,
    smoking: false,
    date: new Date('2026-07-18T12:00:00.000Z'),
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

/** Render the view under a live Provider wired to the fake kit. */
function renderView(kit = harness()) {
  const utils = render(
    <SmokeSessionProvider config={kit.config}>
      <SmokeStepView nextButton={nextButton} />
    </SmokeSessionProvider>
  );
  return { ...utils, ...kit };
}

describe('SmokeStepView', () => {
  test('renders a new chamber temperature from an inbound events frame', async () => {
    const { socket } = renderView();

    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      socket.injectEvents(eventsFrame('213'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('temp-chart')).toHaveAttribute('data-chamber-temp', '213');
    });
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

  test('a refresh signal reloads the chart baseline', async () => {
    const kit = harness();
    kit.api.seedTemps([
      { ChamberTemp: 1, MeatTemp: 1, Meat2Temp: 1, Meat3Temp: 1, date: new Date() },
    ]);
    const { socket, api } = renderView(kit);

    await act(async () => {
      await flushPromises();
    });

    // A newer baseline is now available; a refresh must re-pull it.
    api.seedTemps([
      { ChamberTemp: 2, MeatTemp: 2, Meat2Temp: 2, Meat3Temp: 2, date: new Date() },
      { ChamberTemp: 3, MeatTemp: 3, Meat2Temp: 3, Meat3Temp: 3, date: new Date() },
    ]);

    await act(async () => {
      socket.injectRefresh();
      await flushPromises();
    });

    await waitFor(() => {
      const initData = JSON.parse(
        screen.getByTestId('temp-chart').getAttribute('data-init-data') || '[]'
      );
      expect(initData).toHaveLength(2);
    });
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

    render(<SmokeStep nextButton={nextButton} />);
    await act(async () => {
      await flushPromises();
    });

    expect(createCloudSocketAdapter).toHaveBeenCalledWith('ws://cloud.example');
    expect(screen.getByTestId('temp-chart')).toBeInTheDocument();
    expect(screen.getByTestId('next-button')).toBeInTheDocument();
  });

  test('defaults the socket URL to empty string when WS_URL is unset', async () => {
    render(<SmokeStep nextButton={nextButton} />);
    await act(async () => {
      await flushPromises();
    });

    expect(createCloudSocketAdapter).toHaveBeenCalledWith('');
  });
});
