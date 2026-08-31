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
  const times = bucket.map(timeOf);
  // A bucket that holds a single undated row is dated to nothing, even if its
  // neighbours in the bucket are dated: a mean of the rows that happen to carry
  // a time would stamp readings this module has already refused to place in
  // time (see `timeOf`) with a real timestamp. Buckets are built so this does
  // not arise — dated and undated rows are thinned apart — and the rule is
  // written here so that it cannot arise if that ever changes.
  const at = times.every((one): one is number => one !== null)
    ? meanOf(times)
    : null;

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
 * A run of rows split into at most `points` buckets, where `position` places
 * each row on a 0-to-1 line and empty buckets are dropped.
 */
const bucketed = (
  rows: Temp[],
  points: number,
  position: (row: Temp, at: number) => number,
): Temp[][] => {
  const buckets: Temp[][] = Array.from({ length: points }, () => []);
  rows.forEach((row, at) => {
    const slot = Math.floor(position(row, at) * points);
    buckets[Math.min(points - 1, Math.max(0, slot))].push(row);
  });
  return buckets.filter((bucket) => bucket.length > 0);
};

/**
 * A cook's dated rows thinned to at most `points` samples, bucketed by when
 * each reading was taken rather than by where it sits in the array.
 *
 * The chart these points feed plots against elapsed time, so the buckets have
 * to divide time. A cook whose device dropped offline for two hours has its
 * readings piled either side of that gap; split by position, every bucket holds
 * the same number of rows but stands for a wildly different stretch of the cook
 * — four minutes here, two hours there — and two such cooks overlaid in Compare
 * Cooks line up against the wrong elapsed times. Split by time, a bucket always
 * means the same width of cook, and the gap simply comes back as buckets with
 * nothing in them, which is the truth about it.
 */
const datedPoints = (
  rows: Temp[],
  // The time of each row, positionally: `times[at]` is when `rows[at]` was
  // taken. Read by the caller, which is where the dated rows are told from the
  // undated ones, so nothing here has to ask again what may be missing.
  times: number[],
  points: number,
): Temp[][] => {
  // Spread-based min/max are not used — a long cook is tens of thousands of
  // readings, which is enough arguments to overflow the stack.
  const first = times.reduce((low, at) => Math.min(low, at), times[0]);
  const last = times.reduce((high, at) => Math.max(high, at), times[0]);
  const span = last - first;
  // Readings that all landed on the same instant divide no time at all, so
  // they stand for one moment and are answered as one point.
  if (span === 0) {
    return [rows];
  }
  return bucketed(rows, points, (_row, at) => (times[at] - first) / span);
};

/**
 * A share of a point budget proportional to how much of the cook a run of rows
 * is, and never less than one point for a run that has any rows at all.
 */
const shareOf = (rows: Temp[], of: number, points: number): number =>
  rows.length === 0 ? 0 : Math.max(1, Math.round((rows.length * points) / of));

/**
 * A cook thinned to about `points` samples, each the mean of the readings it
 * stands in for.
 *
 * Averaging rather than sampling keeps the line honest: a cook that wobbles as
 * the lid opens keeps the shape of that wobble instead of it landing on, or
 * missing, whichever reading a sampling rule happened to pick.
 *
 * Undated rows are thinned apart from dated ones. The archive holds readings
 * stored without a date; they cannot be placed on a time axis at all, so they
 * cannot share a bucket with readings that can — folded together, a bucket of
 * them would be handed the dated rows' timestamp and quietly claim to have been
 * taken then. They are bucketed among themselves, in the order they were
 * recorded, and answered dated to nothing.
 *
 * This lives here, in the backend, rather than being borrowed from the chart
 * package: the API is not a chart, and a server that imports a browser
 * component to answer a request takes on its dependencies and its release
 * cadence for the sake of a few lines of arithmetic.
 */
export const decimateSeries = (rows: Temp[], points: number): TempSample[] => {
  if (rows.length === 0) {
    return [];
  }
  if (rows.length <= points) {
    return rows.map(sampleOf);
  }

  const undated: Temp[] = [];
  const dated: Temp[] = [];
  const times: number[] = [];
  rows.forEach((row) => {
    const at = timeOf(row);
    if (at === null) {
      undated.push(row);
      return;
    }
    dated.push(row);
    times.push(at);
  });

  // The budget is split between the two runs by how much of the cook each is,
  // and a run that has any rows at all is worth at least one point: a handful
  // of undated rows must not silently vanish from a long cook, and neither must
  // the cook itself from a mostly-undated one. A cook that holds both is
  // therefore answered with one point more than a single-point request asked
  // for, which is why the endpoint promises about that many points.
  const undatedShare = shareOf(undated, rows.length, points);
  const datedShare = Math.max(1, points - undatedShare);

  return [
    ...(undated.length
      ? bucketed(undated, undatedShare, (_row, at) => at / undated.length)
      : []),
    ...(dated.length ? datedPoints(dated, times, datedShare) : []),
  ].map(meanSample);
};
