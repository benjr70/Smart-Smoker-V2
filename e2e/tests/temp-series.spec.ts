import { expect, test } from '@playwright/test';
import { BackendFixture } from '../src/api/backend-fixture';
import { FetchTransport } from '../src/api/http-transport';
import { resolveUrls } from '../src/config/urls';

/**
 * A cook that starts hot and cools, so its peak is its *first* reading — the
 * one shape that tells a peak counting every reading from one that counts all
 * but the first. The climbing cook the fixture seeds by default cannot.
 */
const HOT_START = [
  { chamber: 268, meat: 70 },
  { chamber: 232, meat: 120 },
  { chamber: 240, meat: 165 },
];

/** The hottest chamber of the cook above: its first reading. */
const PEAK_CHAMBER = 268;

/**
 * Every reading of a cook, read back from a real store.
 *
 * A series is named after its own first reading, and that reading used to be
 * written before the id existed and so carried none — while every read of a
 * series asks the store for it by `tempsId`. So each of them silently dropped
 * reading one: the live chart, the stored series, the timeline's readings and
 * the peak scans (issue #755). Only a real Mongo can be asked whether a stored
 * reading answers that query, which is why this lives here rather than in the
 * backend's unit specs.
 *
 * Deliberately untagged, so it runs only in the `hermetic` project: it counts
 * the readings of a series, and nothing but a stack this run owns can promise
 * that no other writer is appending to the cook it just seeded.
 */
test('temp series: a cook reads back every reading, the first one included', async () => {
  const backend = new FetchTransport(resolveUrls().backend);
  const fixture = new BackendFixture();
  const seeded = await fixture.seedCompletedSmoke({
    label: 'series',
    cook: HOT_START,
  });

  try {
    const smoke = await backend.get<{ tempsId?: string }>(`/api/smoke/${seeded.smokeId}`);
    const seriesId = String(smoke.tempsId ?? '');
    expect(seriesId, 'the seeded cook must have recorded a series').not.toBe('');

    // The stored series, as history and the smoker app read it.
    const stored = await backend.get<unknown[]>(`/api/temps/${seriesId}`);
    expect(stored).toHaveLength(HOT_START.length);

    // The same series as a chart draws it, in the order it was cooked.
    const chart = await backend.get<{ chamberTemp: number | null }[]>(
      `/api/temps/${seriesId}/series`
    );
    expect(chart.map(sample => sample.chamberTemp)).toEqual(
      HOT_START.map(reading => reading.chamber)
    );

    // The timeline's peak is derived from the cook's readings on every read,
    // so it reports the first reading only if that reading is in the series.
    const timeline = await backend.get<{ peakChamber: number | null }>(
      `/api/timeline/${seeded.smokeId}`
    );
    expect(timeline.peakChamber).toBe(PEAK_CHAMBER);
  } finally {
    await fixture.cleanup();
  }
});
