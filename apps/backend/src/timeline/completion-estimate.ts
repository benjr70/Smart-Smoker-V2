/**
 * When the meat will be done: the projection behind the Estimated Completion
 * card, as one pure function over readings and settings.
 */

/** One primary-probe reading: the moment it was taken and what it read, °F. */
export interface EstimateReading {
  date: Date;
  temp: number;
}

/** Everything the projection is made from. */
export interface EstimateInput {
  /** The cook's primary-probe readings so far, oldest first. */
  readings: EstimateReading[];
  /** The temperature the meat is done at, or `null` when no probe is watched. */
  target: number | null;
  /** Whether the cook is running right now. */
  smoking: boolean;
  /** The moment the estimate is made for. */
  now: Date;
  /**
   * What this user's past cooks of the same meat climbed at, °F/hr, or `null`
   * when there is no such history — see `history-rate.ts`.
   */
  historicalRate?: number | null;
}

/** The projection, as every client reads it. */
export interface CompletionEstimate {
  state: 'warming' | 'ok' | 'stalled' | 'paused' | 'done' | null;
  eta: Date | null;
  hoursRemaining: number | null;
  ratePerHour: number | null;
  progressPercent: number | null;
  startTemp: number | null;
  targetTemp: number | null;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * How far back the live rate is read, in minutes.
 *
 * By timestamp rather than by a count of rows: readings are stored irregularly
 * (every eleventh socket message), so "the last N readings" is a window of
 * unknown and varying length — and a rate is a temperature over a *time*.
 */
export const LIVE_WINDOW_MINUTES = 30;

/** The readings taken within the live window ending at `now`. */
const inWindow = (
  readings: EstimateReading[],
  now: Date,
): EstimateReading[] => {
  const from = now.getTime() - LIVE_WINDOW_MINUTES * 60_000;
  return readings.filter((row) => row.date.getTime() >= from);
};

/**
 * The least-squares climb rate, °F/hr, over the given readings — or `null`
 * when they carry no rate: readings that all landed in the same instant say
 * nothing about how fast anything is moving, and a line through them is a
 * division by zero rather than a steep climb.
 */
const slopePerHour = (readings: EstimateReading[]): number | null => {
  const meanHours =
    readings.reduce((sum, row) => sum + row.date.getTime(), 0) /
    readings.length /
    HOUR_MS;
  const meanTemp =
    readings.reduce((sum, row) => sum + row.temp, 0) / readings.length;
  const covariance = readings.reduce(
    (sum, row) =>
      sum + (row.date.getTime() / HOUR_MS - meanHours) * (row.temp - meanTemp),
    0,
  );
  const variance = readings.reduce(
    (sum, row) => sum + (row.date.getTime() / HOUR_MS - meanHours) ** 2,
    0,
  );
  return variance > 0 ? covariance / variance : null;
};

/**
 * The climb, °F/hr, below which a cook is judged to be stalling rather than
 * merely slow. A brisket's stall is a plateau, not a crawl.
 */
export const STALL_RATE = 1.5;

/** How long the cook has been recording readings, in minutes. */
const dataMinutes = (readings: EstimateReading[], now: Date): number =>
  readings.length === 0
    ? 0
    : (now.getTime() - readings[0].date.getTime()) / 60_000;

/**
 * How much of the window the readings in it actually span, in minutes.
 *
 * How far apart the readings are, not how long the cook has been going: a cook
 * five hours old whose window holds two readings thirty seconds apart has
 * thirty seconds of evidence about its current rate, and weighting that as a
 * full window would project the next eight hours from half a minute of probe.
 */
const windowMinutes = (window: EstimateReading[]): number =>
  window.length < 2
    ? 0
    : (window[window.length - 1].date.getTime() - window[0].date.getTime()) /
      60_000;

/**
 * Whether the cook has plateaued.
 *
 * Judged only once half an hour of readings exist, because a cook that has been
 * on the heat for ten minutes has a flat probe for the ordinary reason — the
 * meat has not started moving yet — and calling that a stall would greet every
 * cook with the stall message before it began.
 */
const stalled = (rate: number | null, minutes: number): boolean =>
  rate !== null && minutes >= LIVE_WINDOW_MINUTES && rate < STALL_RATE;

/**
 * The rate the finish is projected from: what the probe is doing now, weighted
 * against what this user's past cooks of the same meat did.
 *
 * The live rate earns its full weight as the readings behind it come to span
 * the whole window, so a rate read off a few minutes of a probe still settling
 * — or off two readings that happen to sit close together — leans on history
 * instead, and a cook with a full half hour of readings is projected from
 * itself alone.
 *
 * Only the ETA is blended. The state is judged from the live rate, so history
 * can neither hide a real stall nor invent an early one.
 */
const blended = (
  live: number | null,
  historical: number | null,
  minutes: number,
): number | null => {
  if (historical === null) {
    return live;
  }
  if (live === null) {
    return historical;
  }
  const weight = Math.min(1, Math.max(minutes, 0) / LIVE_WINDOW_MINUTES);
  return weight * live + (1 - weight) * historical;
};

/**
 * Whether the meat has reached what it is done at.
 *
 * Judged over the whole series rather than the latest reading alone, so the
 * card does not flicker back out of "Ready now" on the next reading that
 * wobbles a degree under: a probe that has touched its target has cooked the
 * meat, and nothing about a later 202°F un-cooks it.
 */
const reachedTarget = (
  readings: EstimateReading[],
  target: number | null,
): boolean => target !== null && readings.some((row) => row.temp >= target);

/**
 * How far the meat has come, as a percentage of the climb it was set.
 *
 * Anchored at the cook's own first reading rather than at any round number, so
 * the bar measures this piece of meat's journey: a brisket going in at 38°F out
 * of the fridge has further to travel than one that sat out for an hour, and
 * both should read empty at the start and full at the target.
 */
const progressOf = (
  startTemp: number | null,
  current: number | null,
  target: number,
): number | null => {
  if (startTemp === null || current === null || target <= startTemp) {
    return null;
  }
  const fraction = (current - startTemp) / (target - startTemp);
  return Math.min(Math.max(fraction, 0), 1) * 100;
};

/**
 * A projection carrying only what is known — every other field empty rather
 * than missing, so clients read one shape whatever the state.
 */
const partial = (
  known: Partial<CompletionEstimate> & Pick<CompletionEstimate, 'state'>,
): CompletionEstimate => ({
  eta: null,
  hoursRemaining: null,
  ratePerHour: null,
  progressPercent: null,
  startTemp: null,
  targetTemp: null,
  ...known,
});

/** How the cook is going, and when it will be over. */
export function estimateCompletion(input: EstimateInput): CompletionEstimate {
  const { readings, target, now } = input;
  if (target === null) {
    // Nothing is being aimed at, so there is nothing to project: the clients
    // read the empty state as "watch a probe in Settings", which is a different
    // thing to say than "still calculating".
    return partial({ state: null });
  }
  const startTemp = readings.length > 0 ? readings[0].temp : null;
  const current =
    readings.length > 0 ? readings[readings.length - 1].temp : null;
  const known = {
    startTemp,
    targetTemp: target,
    progressPercent: progressOf(startTemp, current, target),
  };
  if (reachedTarget(readings, target)) {
    return partial({
      ...known,
      state: 'done',
      eta: now,
      hoursRemaining: 0,
      progressPercent: 100,
    });
  }
  const window = inWindow(readings, now);
  const cookMinutes = dataMinutes(readings, now);
  // Fewer than two readings in the window is no rate at all: one point is a
  // temperature, not a climb.
  const liveRate = window.length >= 2 ? slopePerHour(window) : null;
  const rate = blended(
    liveRate,
    input.historicalRate ?? null,
    windowMinutes(window),
  );
  const going = { ...known, ratePerHour: rate };
  if (!input.smoking) {
    // Ahead of "warming", because a cook off the heat is paused whether or not
    // it had gathered enough data first, and "Calculating" would promise a
    // number that is not coming.
    return partial({ ...going, state: 'paused' });
  }
  if (window.length < 2 || rate === null) {
    // No rate from the probe, and none from the user's past cooks either:
    // nothing honest can be said about a finish yet.
    return partial({ ...known, state: 'warming' });
  }
  if (stalled(liveRate, cookMinutes)) {
    return partial({ ...going, state: 'stalled' });
  }
  if (rate <= 0) {
    // Not yet a stall — too early to call one — but a rate of nothing projects
    // no finish either, and an infinite one on the card is worse than none.
    return partial({ ...going, state: 'ok' });
  }
  const hoursRemaining = (target - current) / rate;
  return partial({
    ...going,
    state: 'ok',
    eta: new Date(now.getTime() + hoursRemaining * HOUR_MS),
    hoursRemaining,
  });
}
