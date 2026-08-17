import { EstimateReading } from './completion-estimate';
import { SmokeTimeline } from './timeline.dto';

/**
 * One recorded reading, as the temps collection stores one: four probe values
 * kept as strings, and the moment they were taken.
 *
 * Typed structurally rather than as the `Temp` document so the derivation can
 * be exercised with plain objects — and so it never depends on the Mongoose
 * model it happens to be fed from.
 */
export interface TimelineReading {
  date?: Date | null;
  ChamberTemp?: string | number | null;
  MeatTemp?: string | number | null;
  Meat2Temp?: string | number | null;
  Meat3Temp?: string | number | null;
}

/**
 * The half of a smoke this derivation reads: the stamps it may carry and
 * whether the cook is over.
 */
export interface TimelineSmoke {
  startedAt?: Date | null;
  finishedAt?: Date | null;
  targetTemp?: number | null;
  /** True once the cook has been finished (`SmokeStatus.Complete`). */
  complete: boolean;
}

/** The three probes a piece of meat can be on. */
export const MEAT_FIELDS = ['MeatTemp', 'Meat2Temp', 'Meat3Temp'] as const;

/** Every field of a reading that carries a temperature. */
export const TEMP_FIELDS = ['ChamberTemp', ...MEAT_FIELDS] as const;

/** A stored reading as the number it claims to be, or `null` when it is not one. */
const asReading = (
  value: string | number | null | undefined,
): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const reading = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(reading) ? reading : null;
};

/** Which stored field carries each probe slot's readings. */
const SLOT_FIELDS: Record<string, keyof TimelineReading> = {
  probe1: 'MeatTemp',
  probe2: 'Meat2Temp',
  probe3: 'Meat3Temp',
};

/**
 * The stored field a watched probe's readings are under, or `undefined` for a
 * slot nothing is recorded under. Exported so a reader asking the store about
 * one probe names the same field this derivation reads it from.
 */
export const probeField = (
  slot: string | null | undefined,
): keyof TimelineReading | undefined => (slot ? SLOT_FIELDS[slot] : undefined);

/**
 * One probe's readings, dated and above zero, from `from` onwards.
 *
 * Anchored at the cook's start rather than at the first row of the series
 * because a session is set up while the meat is still being trimmed: the probe
 * sitting on the counter at room temperature is not where this cook began, and
 * a progress bar measuring from it would open the cook part-full.
 *
 * Zero is dropped for the same reason the first meat reading of a past cook is
 * (see {@link firstMeatReading}): a probe that is unplugged, or not yet pushed
 * into the meat, records zero, and zero is not a temperature anything took. Kept,
 * it would anchor the climb at 0°F and read the moment the probe goes in as a
 * hundred-and-fifty-degree jump — half an hour of which projects a finish minutes
 * away — while a probe left out all cook would read as no progress for ever.
 */
export const probeSeries = (
  readings: TimelineReading[],
  slot: string | null | undefined,
  from: Date | null,
): EstimateReading[] => {
  const field = probeField(slot);
  if (!field) {
    return [];
  }
  return readings
    .map((row) => ({
      date: momentOf(row),
      temp: asReading(row[field] as string | number | null | undefined),
    }))
    .filter(
      (row): row is EstimateReading =>
        row.date !== null &&
        row.temp !== null &&
        row.temp > 0 &&
        (from === null || row.date >= from),
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime());
};

/**
 * The first meat reading a cook recorded, °F — whichever probe the meat was on
 * — or `null` when it recorded none. Where that cook's climb started.
 */
export const firstMeatReading = (
  readings: TimelineReading[],
): number | null => {
  for (const row of readings) {
    for (const field of MEAT_FIELDS) {
      const value = asReading(row[field]);
      if (value !== null && value > 0) {
        return value;
      }
    }
  }
  return null;
};

/** The highest of the given fields across the whole series, or `null` if none read. */
const peakOf = (
  readings: TimelineReading[],
  fields: readonly (keyof TimelineReading)[],
): number | null =>
  readings.reduce<number | null>((peak, row) => {
    return fields.reduce<number | null>((highest, field) => {
      const value = asReading(row[field] as string | number | null | undefined);
      if (value === null) {
        return highest;
      }
      return highest === null || value > highest ? value : highest;
    }, peak);
  }, null);

/**
 * A valid moment from a reading, or `null` when the row carries no usable date.
 *
 * Exported so the cheap end-of-series reads answer "is this row dated?" with
 * the same rule the full derivation uses: a list card and a detail screen
 * disagreeing about the same cook is worse than either answer alone.
 */
export const momentOf = (row: TimelineReading): Date | null => {
  const date = row.date ? new Date(row.date) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

/** The earliest and latest moments in the series, `null` when it has none. */
const spanOf = (
  readings: TimelineReading[],
): { first: Date | null; last: Date | null } =>
  readings.reduce<{ first: Date | null; last: Date | null }>(
    (span, row) => {
      const moment = momentOf(row);
      if (!moment) {
        return span;
      }
      return {
        first: span.first === null || moment < span.first ? moment : span.first,
        last: span.last === null || moment > span.last ? moment : span.last,
      };
    },
    { first: null, last: null },
  );

/**
 * How long a cook ran, given whatever is known of its two ends.
 *
 * Never negative: a clock corrected mid-cook can leave a finish before its
 * start, and a negative duration on a history card is worse than none — so the
 * two crossing over reads as an instant, not as a cook that ran backwards.
 */
export const durationBetween = (
  startedAt: Date | null,
  finishedAt: Date | null,
): number | null =>
  startedAt && finishedAt
    ? Math.max(finishedAt.getTime() - startedAt.getTime(), 0)
    : null;

/**
 * A smoke's timing, as facts where they were recorded and as inference where
 * they were not.
 *
 * Duration and the two peaks are derived rather than stored because they are
 * restatements of the temperature series: storing them would be storing a
 * second, forkable copy of the same cook, and every reader would then have to
 * decide which of the two to believe.
 *
 * A stamped smoke always wins over the series. A cook recorded before the
 * stamps existed has no start of its own, so its first reading stands in for
 * one; the same cook's last reading stands in for a finish, but only once it is
 * over — a running cook has not finished, and a series that merely stops
 * arriving must never be reported as one that did.
 *
 * Nothing here invents a number: a smoke with no readings and no stamps derives
 * nothing and answers `null` throughout, which is what the screens render as an
 * em-dash.
 */
export function deriveTimeline(
  smoke: TimelineSmoke,
  readings: TimelineReading[],
): SmokeTimeline {
  const span = spanOf(readings);
  const startedAt = smoke.startedAt ?? span.first;
  const finishedAt =
    smoke.finishedAt ?? (smoke.complete ? span.last : null) ?? null;
  return {
    startedAt: startedAt ?? null,
    finishedAt,
    durationMs: durationBetween(startedAt ?? null, finishedAt),
    peakChamber: peakOf(readings, ['ChamberTemp']),
    peakMeat: peakOf(readings, MEAT_FIELDS),
    targetTemp: smoke.targetTemp ?? null,
  };
}
