/**
 * The series a live cook is drawn from.
 *
 * The hook is exercised over the session module's fakes — a frame pushed down
 * the fake socket is exactly what the backend pushes down a real one — so these
 * are assertions about what an operator's chart records during a cook, not about
 * how the recording is implemented.
 */
import { act, render } from '@testing-library/react';
import React from 'react';
import { SessionConfig, encodeEvents } from 'smoke-session/src';
import { SmokeSessionProvider } from 'smoke-session/src/react';
import { FakeCloudSocket, FakeSessionApi, SteppingClock } from 'smoke-session/src/testing';
import { ChartSample, DEFAULT_MAX_POINTS } from 'temperaturechart/src/chartGeometry';
import { useTemperatureSeries } from './useTemperatureSeries';

/**
 * The package's `flushPromises` uses `setImmediate`, absent from this app's
 * jsdom environment; a macrotask drains the store's startup promises just the
 * same.
 */
const flushPromises = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/** An inbound reading, as the backend frames it: temperatures as strings. */
const reading = (
  temps: { chamber?: string; probe1?: string; probe2?: string; probe3?: string },
  date: Date
): string =>
  encodeEvents({
    chamberName: 'Chamber',
    probe1Name: 'probe 1',
    probe2Name: 'probe 2',
    probe3Name: 'probe 3',
    probeTemp1: temps.probe1 ?? '0',
    probeTemp2: temps.probe2 ?? '0',
    probeTemp3: temps.probe3 ?? '0',
    chamberTemp: temps.chamber ?? '0',
    smoking: true,
    date,
  });

interface Kit {
  socket: FakeCloudSocket;
  api: FakeSessionApi;
  config: SessionConfig;
}

/** A monitor-role session over the fakes, smoking unless told otherwise. */
const kitFor = (smoking = true): Kit => {
  const socket = new FakeCloudSocket();
  const api = new FakeSessionApi().seedSmoking(smoking);
  return { socket, api, config: { role: 'monitor', socket, api, clock: new SteppingClock() } };
};

/**
 * The moments a cook was drawn at, for every frame that doubled back on itself.
 *
 * A cook only ever runs forwards, so a frame holding a reading at or before the
 * one in front of it is a frame no operator should ever be shown: the line
 * visibly folds back, and a hover lands on the wrong reading while it does.
 */
const doubledBack = (frames: ChartSample[][]): number[][] =>
  frames
    .map(frame => frame.map(sample => new Date(sample.date).getTime()))
    .filter(moments => moments.some((moment, at) => at > 0 && moment <= moments[at - 1]));

/**
 * The hook, live, under a session wired to the fakes.
 *
 * It is read through a component that does nothing but call it, which is how a
 * screen holds it; `result.current` is what that screen would have drawn on its
 * last render, and `frames` is every cook it was handed along the way — a chart
 * is drawn from each of them, so each of them has to be a cook.
 */
const renderSeries = async (kit: Kit) => {
  const result: { current: ChartSample[] } = { current: [] };
  const frames: ChartSample[][] = [];
  const Probe = (): JSX.Element => {
    result.current = useTemperatureSeries();
    frames.push(result.current);
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
  return { ...rendered, result, frames };
};

describe('a cook run with only some of its probes plugged in', () => {
  it('records the reading that arrives, rather than waiting for four probes', async () => {
    const kit = kitFor();
    const { result } = await renderSeries(kit);

    await act(async () => {
      kit.socket.injectEvents(
        reading({ chamber: '225', probe1: '145' }, new Date('2026-08-08T12:00:00.000Z'))
      );
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({
      ChamberTemp: 225,
      MeatTemp: 145,
      Meat2Temp: 0,
      Meat3Temp: 0,
    });
  });
});

describe('a screen opened part-way through a cook', () => {
  it('starts from the cook already recorded and carries on from there', async () => {
    const kit = kitFor();
    kit.api.seedTemps([
      {
        ChamberTemp: 210,
        MeatTemp: 120,
        Meat2Temp: 0,
        Meat3Temp: 0,
        date: new Date('2026-08-08T11:00:00.000Z'),
      },
      {
        ChamberTemp: 220,
        MeatTemp: 130,
        Meat2Temp: 0,
        Meat3Temp: 0,
        date: new Date('2026-08-08T11:30:00.000Z'),
      },
    ]);
    const { result } = await renderSeries(kit);

    expect(result.current).toHaveLength(2);

    await act(async () => {
      kit.socket.injectEvents(
        reading({ chamber: '225', probe1: '140' }, new Date('2026-08-08T12:00:00.000Z'))
      );
    });

    expect(result.current).toHaveLength(3);
    expect(result.current[2]).toMatchObject({ ChamberTemp: 225, MeatTemp: 140 });
  });
});

describe('a cook that runs long enough to outgrow the plot', () => {
  /** Push `count` readings, each its own arrival, a minute apart. */
  const cookFor = async (kit: Kit, count: number, from = 0): Promise<void> => {
    for (let minute = from; minute < from + count; minute += 1) {
      const at = new Date(Date.UTC(2026, 7, 8, 12, minute));
      await act(async () => {
        kit.socket.injectEvents(reading({ chamber: '225', probe1: '140' }, at));
      });
    }
  };

  it('draws no more points as it grows, however long it runs', async () => {
    const kit = kitFor();
    const { result } = await renderSeries(kit);

    await cookFor(kit, DEFAULT_MAX_POINTS + 60);
    const drawn = result.current.length;

    expect(drawn).toBe(DEFAULT_MAX_POINTS);

    await cookFor(kit, 120, DEFAULT_MAX_POINTS + 60);

    expect(result.current).toHaveLength(DEFAULT_MAX_POINTS);
  }, 30000);

  /**
   * A cook that runs long enough is compacted as it goes, so that a twelve-hour
   * smoke neither holds every reading it ever took nor re-thins all of them on
   * each new one. What is drawn afterwards is still the whole cook: it starts
   * when the smoke did, ends at the reading that just arrived, and the
   * temperatures in between are the ones the probes read.
   */
  it('still draws the whole run once what it holds has been compacted', async () => {
    const kit = kitFor();
    const { result } = await renderSeries(kit);
    const minutes = 1500;

    await cookFor(kit, minutes);

    expect(result.current).toHaveLength(DEFAULT_MAX_POINTS);
    const first = new Date(result.current[0].date).getTime();
    const last = new Date(result.current[result.current.length - 1].date).getTime();
    expect(first - Date.UTC(2026, 7, 8, 12, 0)).toBeLessThan(10 * 60_000);
    expect(Date.UTC(2026, 7, 8, 12, minutes - 1) - last).toBeLessThan(10 * 60_000);
    expect(result.current.every(sample => sample.ChamberTemp === 225)).toBe(true);
    expect(result.current.every(sample => sample.MeatTemp === 140)).toBe(true);
  }, 30000);

  /** Thinning is an average, so the readings themselves stay where they were. */
  it('keeps the cook spanning the whole time it ran for', async () => {
    const kit = kitFor();
    const { result } = await renderSeries(kit);

    await cookFor(kit, DEFAULT_MAX_POINTS + 60);

    const first = new Date(result.current[0].date).getTime();
    const last = new Date(result.current[result.current.length - 1].date).getTime();

    expect(last - first).toBeGreaterThan(340 * 60_000);
  }, 30000);
});

describe('the smoke being cleared out from under the screen', () => {
  it('empties the chart, so the next cook is not drawn on top of the last', async () => {
    const kit = kitFor();
    const { result } = await renderSeries(kit);

    await act(async () => {
      kit.socket.injectEvents(
        reading({ chamber: '225', probe1: '140' }, new Date('2026-08-08T12:00:00.000Z'))
      );
    });
    expect(result.current).toHaveLength(1);

    await act(async () => {
      kit.socket.injectClear();
      await flushPromises();
    });

    expect(result.current).toHaveLength(0);
  });
});

describe('a history re-fetch that already holds what this screen recorded', () => {
  it('never draws the re-fetched cook on top of the readings it replaces', async () => {
    const kit = kitFor();
    const { result, frames } = await renderSeries(kit);
    const at = new Date('2026-08-08T12:00:00.000Z');

    await act(async () => {
      kit.socket.injectEvents(reading({ chamber: '225', probe1: '140' }, at));
    });
    expect(result.current).toHaveLength(1);

    // The backend now serves the very reading this screen took down itself.
    kit.api.seedTemps([{ ChamberTemp: 225, MeatTemp: 140, Meat2Temp: 0, Meat3Temp: 0, date: at }]);
    await act(async () => {
      kit.socket.injectRefresh();
      await flushPromises();
    });

    expect(doubledBack(frames)).toEqual([]);
    expect(result.current).toHaveLength(1);
  });
});

describe('readings that arrive when no smoke is running', () => {
  it('records none of them, so the next cook starts on an empty chart', async () => {
    const kit = kitFor(false);
    const { result } = await renderSeries(kit);

    await act(async () => {
      kit.socket.injectEvents(reading({ chamber: '80' }, new Date('2026-08-08T12:00:00.000Z')));
      kit.socket.injectEvents(reading({ chamber: '95' }, new Date('2026-08-08T12:00:05.000Z')));
    });

    expect(result.current).toHaveLength(0);
  });
});
