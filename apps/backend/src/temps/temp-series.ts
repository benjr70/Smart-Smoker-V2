import { Temp } from './temps.schema';

/**
 * One moment of a cook as a chart reads it: a time, and a reading per probe
 * that is either a temperature or nothing at all.
 */
export interface TempSample {
  date: string | null;
  chamberTemp: number | null;
  probe1Temp: number | null;
  probe2Temp: number | null;
  probe3Temp: number | null;
}

/**
 * A stored reading, as a number or as nothing.
 *
 * Readings are stored as the strings the device sent, and two of those strings
 * are not temperatures: anything unparseable, and the `0` a probe reads while
 * it is unplugged. Zero degrees is not a temperature any cook reaches, and a
 * chart that plots it draws a line along the floor and squashes the cook into
 * the top of the plot — so an unplugged probe reports nothing rather than cold.
 */
const readingOf = (stored: string | undefined | null): number | null => {
  const reading = Number.parseFloat(stored ?? '');
  if (Number.isNaN(reading) || reading === 0) {
    return null;
  }
  return reading;
};

/** A stored row as a chart sample. */
export const sampleOf = (row: Temp): TempSample => ({
  date: timeOf(row) === null ? null : new Date(row.date).toISOString(),
  chamberTemp: readingOf(row.ChamberTemp),
  probe1Temp: readingOf(row.MeatTemp),
  probe2Temp: readingOf(row.Meat2Temp),
  probe3Temp: readingOf(row.Meat3Temp),
});

/**
 * When a row was taken, or `null` when it cannot be placed in time — the
 * archive holds undated rows, and a bucket of them is dated to nothing rather
 * than to the epoch.
 */
const timeOf = (row: Temp): number | null => {
  const at = new Date(row.date).getTime();
  return Number.isNaN(at) ? null : at;
};

/** The probe readings of a sample, by the name each is answered under. */
const PROBES = [
  'chamberTemp',
  'probe1Temp',
  'probe2Temp',
  'probe3Temp',
] as const;

type Probe = (typeof PROBES)[number];

/** The mean of the reported values, or `null` when nothing was reported. */
const meanOf = (values: (number | null)[]): number | null => {
  const reported = values.filter(
    (value): value is number => value !== null && !Number.isNaN(value),
  );
  if (reported.length === 0) {
    return null;
  }
  return reported.reduce((total, value) => total + value, 0) / reported.length;
};

/**
 * One bucket of readings as a single sample.
 *
 * Each probe is averaged over the readings that probe itself reported, because
 * the nothing an unplugged probe reports is not a temperature to average in —
 * a probe plugged in halfway through a bucket would otherwise be pulled toward
 * a number nothing ever read. The sample is dated to the middle of the moments
 * it stands for, and to nothing when none of them were dated.
 */
const meanSample = (bucket: Temp[]): TempSample => {
  const samples = bucket.map(sampleOf);
  const readings = Object.fromEntries(
    PROBES.map((probe) => [probe, meanOf(samples.map((one) => one[probe]))]),
  ) as Record<Probe, number | null>;
  const times = bucket.map(timeOf).filter((at): at is number => at !== null);
  const at = meanOf(times);

  return {
    date: at === null ? null : new Date(Math.round(at)).toISOString(),
    ...readings,
  };
};

/**
 * How many points a cook is thinned to when the caller does not say, and the
 * range a caller may ask for. Enough points that the curve of a stall is still
 * visible; few enough that a twelve-hour cook is not tens of thousands of path
 * segments over the wire. The same default the chart itself thins to.
 */
export const DEFAULT_POINTS = 300;
export const MIN_POINTS = 1;
export const MAX_POINTS = 2000;

/**
 * The size a request is served at.
 *
 * A size out of range is answered rather than refused: the caller asked for a
 * chart, and the nearest chart this endpoint will draw is a better answer than
 * an error. Fractional and missing sizes fall back the same way.
 */
export const pointsAsked = (points?: number): number => {
  if (points === undefined || points === null || Number.isNaN(points)) {
    return DEFAULT_POINTS;
  }
  return Math.min(MAX_POINTS, Math.max(MIN_POINTS, Math.floor(points)));
};

/**
 * A cook thinned to at most `points` samples, each the mean of the readings it
 * stands in for.
 *
 * Averaging rather than sampling keeps the line honest: a cook that wobbles as
 * the lid opens keeps the shape of that wobble instead of it landing on, or
 * missing, whichever reading a sampling rule happened to pick. Buckets are runs
 * of the series as it was read, which is the order it was cooked in — the
 * stored read already sorts it — so a bucket stands for moments that sat
 * together.
 *
 * This lives here, in the backend, rather than being borrowed from the chart
 * package: the API is not a chart, and a server that imports a browser
 * component to answer a request takes on its dependencies and its release
 * cadence for the sake of twelve lines of arithmetic.
 */
export const decimateSeries = (rows: Temp[], points: number): TempSample[] => {
  if (rows.length === 0) {
    return [];
  }
  if (rows.length <= points) {
    return rows.map(sampleOf);
  }

  const buckets: Temp[][] = Array.from({ length: points }, () => []);
  rows.forEach((row, at) =>
    buckets[Math.floor((at * points) / rows.length)].push(row),
  );

  return buckets.filter((bucket) => bucket.length > 0).map(meanSample);
};
