import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Home } from './home';
import { SessionConfig, decodeEvents } from 'smoke-session/src';
import { SmokeSessionProvider } from 'smoke-session/src/react';
import {
  FakeCloudSocket,
  FakeDeviceFeed,
  FakeSessionApi,
  FakeWifiStatus,
  SteppingClock,
} from 'smoke-session/src/testing';

// The package's flushPromises leans on node's setImmediate, absent in the CRA
// jsdom test env; a setTimeout(0) drain settles the store's fire-and-forget
// startup loads and command promises just the same.
const flushPromises = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

// The chart is a heavy D3 leaf; stub it to a readout of the temps it receives.
jest.mock('temperaturechart/src/tempChart', () => {
  return function MockTempChart(props: any) {
    return (
      <div data-testid="temp-chart">
        <div data-testid="chart-chamber">{props.ChamberTemp}</div>
        <div data-testid="chart-meat">{props.MeatTemp}</div>
        <div data-testid="chart-meat2">{props.Meat2Temp}</div>
        <div data-testid="chart-meat3">{props.Meat3Temp}</div>
      </div>
    );
  };
});

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
  return { config, socket, api, deviceFeed, wifi };
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
    expect(screen.getByTestId('chart-chamber')).toHaveTextContent('225');
    expect(screen.getByTestId('chart-meat')).toHaveTextContent('185');
    expect(screen.getByTestId('chart-meat2')).toHaveTextContent('190');

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

    expect(screen.getByText('Big Pit')).toBeInTheDocument();
    expect(screen.getByText('Brisket')).toBeInTheDocument();
    expect(screen.getByText('Ribs')).toBeInTheDocument();
    expect(screen.getByText('Wings')).toBeInTheDocument();
  });

  it('falls back to default probe names when no profile is saved', async () => {
    const kit = smokerKit();
    kit.api.seedProfile(null);
    renderHome(kit);

    await act(async () => {
      await flushPromises();
    });

    expect(screen.getByText('Chamber')).toBeInTheDocument();
    expect(screen.getByText('probe 1')).toBeInTheDocument();
    expect(screen.getByText('probe 2')).toBeInTheDocument();
    expect(screen.getByText('probe 3')).toBeInTheDocument();
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

    expect(screen.getByText('Renamed Chamber')).toBeInTheDocument();
    expect(screen.getByText('Renamed Probe 1')).toBeInTheDocument();
    expect(screen.getByText('Stop Smoking')).toBeInTheDocument();
  });
});
