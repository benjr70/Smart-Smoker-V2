/**
 * The series the touchscreen's chart is drawn from.
 *
 * The hook is exercised over the session module's fakes with the kiosk's own
 * wiring — a frame pushed down the fake device feed is exactly the line the
 * microcontroller writes down the serial port — so these are assertions about
 * what the chart at the smoker records during a cook, not about how it records
 * it.
 */
import { act, render } from '@testing-library/react';
import React from 'react';
import { SessionConfig } from 'smoke-session/src';
import { SmokeSessionProvider, useSmokeSession } from 'smoke-session/src/react';
import {
  FakeCloudSocket,
  FakeDeviceFeed,
  FakeSessionApi,
  FakeWifiStatus,
  SteppingClock,
} from 'smoke-session/src/testing';
import { ChartSample, DEFAULT_MAX_POINTS } from 'temperaturechart/src/chartGeometry';
import { useTemperatureSeries } from './useTemperatureSeries';

/**
 * The package's `flushPromises` uses `setImmediate`, absent from this app's
 * jsdom environment; a macrotask drains the store's startup promises just the
 * same.
 */
const flushPromises = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/** A reading off the serial port, as the microcontroller writes it. */
const reading = (temps: {
  chamber?: string;
  probe1?: string;
  probe2?: string;
  probe3?: string;
}): string =>
  JSON.stringify({
    Chamber: temps.chamber ?? '0',
    Meat: temps.probe1 ?? '0',
    Meat2: temps.probe2 ?? '0',
    Meat3: temps.probe3 ?? '0',
  });

interface Kit {
  socket: FakeCloudSocket;
  api: FakeSessionApi;
  deviceFeed: FakeDeviceFeed;
  clock: SteppingClock;
  config: SessionConfig;
}

/** A smoker-role session over the fakes, smoking unless told otherwise. */
const kitFor = (smoking = true): Kit => {
  const socket = new FakeCloudSocket();
  const api = new FakeSessionApi().seedSmoking(smoking);
  const deviceFeed = new FakeDeviceFeed();
  const clock = new SteppingClock();
  return {
    socket,
    api,
    deviceFeed,
    clock,
    config: {
      role: 'smoker',
      socket,
      api,
      clock,
      deviceFeed,
      wifi: { port: new FakeWifiStatus(), throttleMs: 0 },
    },
  };
};

/**
 * The hook, live, under a session wired to the kiosk's fakes. It is read
 * through a component that does nothing but call it, which is how the home
 * screen holds it.
 */
const renderSeries = async (kit: Kit) => {
  const result: { current: ChartSample[] } = { current: [] };
  /** Re-reading the stored cook, which is what returning from wifi does. */
  const reread: { current: () => Promise<void> } = { current: async () => undefined };
  const Probe = (): JSX.Element => {
    const session = useSmokeSession();
    reread.current = () => session.refreshInitialTemps();
    result.current = useTemperatureSeries();
    return <div data-testid="probe" />;
  };

  const rendered = render(
    <SmokeSessionProvider config={kit.config}>
      <Probe />
    </SmokeSessionProvider>
  );
  await act(async () => {
    await flushPromises();
  });
  return { ...rendered, result, reread };
};

/** One reading off the device, a minute after the last one. */
const cook = async (kit: Kit, temps: Parameters<typeof reading>[0]): Promise<void> => {
  kit.clock.step(60_000);
  await act(async () => {
    kit.deviceFeed.injectReading(reading(temps));
    await flushPromises();
  });
};

describe('a cook run at the smoker with only some of its probes plugged in', () => {
  it('records the reading that arrives, rather than waiting for four probes', async () => {
    const kit = kitFor();
    const { result } = await renderSeries(kit);

    await cook(kit, { chamber: '225', probe1: '145' });

    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({
      ChamberTemp: 225,
      MeatTemp: 145,
      Meat2Temp: 0,
      Meat3Temp: 0,
    });
  });
});

describe('a touchscreen switched on part-way through a cook', () => {
  it('starts from the cook already recorded and carries on from there', async () => {
    const kit = kitFor();
    kit.api.seedTemps([
      {
        ChamberTemp: 210,
        MeatTemp: 120,
        Meat2Temp: 0,
        Meat3Temp: 0,
        date: new Date('2026-07-14T11:00:00.000Z'),
      },
      {
        ChamberTemp: 220,
        MeatTemp: 130,
        Meat2Temp: 0,
        Meat3Temp: 0,
        date: new Date('2026-07-14T11:30:00.000Z'),
      },
    ]);
    const { result } = await renderSeries(kit);

    expect(result.current).toHaveLength(2);

    await cook(kit, { chamber: '225', probe1: '140' });

    expect(result.current).toHaveLength(3);
    expect(result.current[2]).toMatchObject({ ChamberTemp: 225, MeatTemp: 140 });
  });

  /**
   * Leaving the wifi screen re-reads the stored cook, which by then already
   * holds the readings this screen took down itself while it was away. Drawn on
   * top of each other they would double the cook back on itself — a line that
   * visibly folds over, and a hover that lands on the wrong reading.
   */
  it('never draws a re-read cook on top of the readings it replaces', async () => {
    const kit = kitFor();
    const { result, reread } = await renderSeries(kit);

    await cook(kit, { chamber: '225', probe1: '140' });
    expect(result.current).toHaveLength(1);

    // The backend now serves the very reading this screen took down itself.
    const recorded = result.current[0];
    kit.api.seedTemps([{ ...recorded, date: new Date(recorded.date) }]);
    await act(async () => {
      await reread.current();
      await flushPromises();
    });

    expect(result.current).toHaveLength(1);
  });
});

describe('a cook that runs long enough to outgrow the plot', () => {
  it('draws no more points as it grows, however long it runs', async () => {
    const kit = kitFor();
    const { result } = await renderSeries(kit);

    for (let minute = 0; minute < DEFAULT_MAX_POINTS + 60; minute += 1) {
      await cook(kit, { chamber: '225', probe1: '140' });
    }

    expect(result.current).toHaveLength(DEFAULT_MAX_POINTS);

    for (let minute = 0; minute < 120; minute += 1) {
      await cook(kit, { chamber: '225', probe1: '140' });
    }

    expect(result.current).toHaveLength(DEFAULT_MAX_POINTS);
  }, 60000);
});

describe('readings the device takes when no smoke is running', () => {
  it('records none of them, so the next cook starts on an empty chart', async () => {
    const kit = kitFor(false);
    const { result } = await renderSeries(kit);

    await cook(kit, { chamber: '80' });
    await cook(kit, { chamber: '95' });

    expect(result.current).toHaveLength(0);
  });
});
