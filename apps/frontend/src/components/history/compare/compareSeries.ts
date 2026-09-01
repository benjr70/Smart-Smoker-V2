/**
 * A cook as the overlay chart wants it.
 *
 * The chart works in elapsed minutes and knows nothing of smokes, profiles or
 * stamp tones: it is handed readings, a length, a cook log already placed in
 * minutes, and the names this pitmaster gave the probes. Turning one of this
 * app's cooks into that is the app's business, and it is worth stating once —
 * both slots go through here, and the two cooks have to be measured the same
 * way or the overlay compares nothing.
 */
import type { CompareCookSeries, CompareStamp } from 'temperaturechart/src/CompareChart';
import type { CompareReading } from 'temperaturechart/src/compareGeometry';
import type { DesignPalette } from 'theme/src';
import { CompareCook } from '../../../api';
import { CookEvent, SmokeProfile, TempSample } from '../../../api/types';
import { toneColor } from '../../common/stampTones';
import { UNNAMED_COOK } from './cookLabels';

/** How many milliseconds a minute is. */
const MINUTE = 60_000;

/** A stored reading as the chart reads one: the same numbers, its own names. */
const readingOf = (sample: TempSample): CompareReading => ({
  date: sample.date,
  chamber: sample.chamberTemp,
  probe1: sample.probe1Temp,
  probe2: sample.probe2Temp,
  probe3: sample.probe3Temp,
});

/** When a reading was taken, or nothing when it cannot be placed in time. */
const momentOf = (sample: TempSample): number | null => {
  if (sample.date === null) return null;
  const moment = sample.date.getTime();
  return Number.isNaN(moment) ? null : moment;
};

/**
 * When the cook started.
 *
 * The derived timing is the truth where there is one, and the earliest reading
 * stands in where there is not: a cook logged before the backend derived
 * timings has no start on record, and placing its stamps against the clock's
 * zero would put every one of them hours before the plot begins.
 */
const startOf = (cook: CompareCook): number | null => {
  const derived = cook.timeline?.startedAt ?? null;
  if (derived !== null && !Number.isNaN(derived.getTime())) return derived.getTime();
  const moments = cook.series.map(momentOf).filter((one): one is number => one !== null);
  return moments.length === 0 ? null : Math.min(...moments);
};

/**
 * How long the cook ran, in minutes.
 *
 * The derived duration first, the span of the readings after it, and zero for a
 * cook with neither — which the chart reads as a cook with no length rather
 * than one that ran for the whole span of the plot.
 */
export const minutesOf = (cook: CompareCook): number => {
  const derived = cook.timeline?.durationMs ?? null;
  if (derived !== null && Number.isFinite(derived) && derived > 0) return derived / MINUTE;

  const moments = cook.series.map(momentOf).filter((one): one is number => one !== null);
  if (moments.length === 0) return 0;
  return (Math.max(...moments) - Math.min(...moments)) / MINUTE;
};

/** What this cook called the probe in each position. */
export const probeNamesOf = (profile: SmokeProfile): CompareCookSeries['probeNames'] => ({
  chamber: profile.chamberName,
  probe1: profile.probe1Name,
  probe2: profile.probe2Name,
  probe3: profile.probe3Name,
});

/**
 * The cook log, placed against this cook's own start and coloured by its tone.
 *
 * A stamp on a cook there is no start for cannot be placed on an elapsed axis
 * at all, so it is left off rather than drawn at hour zero of a cook it has
 * nothing to do with.
 */
export const stampsOf = (
  events: readonly CookEvent[],
  start: number | null,
  design: DesignPalette
): CompareStamp[] => {
  if (start === null) return [];
  return events
    .filter(event => event.at instanceof Date && !Number.isNaN(event.at.getTime()))
    .map(event => ({
      id: event._id,
      label: event.label,
      minutes: (event.at.getTime() - start) / MINUTE,
      color: toneColor(event.tone, design),
    }));
};

/** One slot's cook, ready for the overlay, in the colour that slot means. */
export const compareSeriesOf = (
  cook: CompareCook,
  color: string,
  design: DesignPalette
): CompareCookSeries => {
  // One start for the whole cook. The chart places the traces on it, the stamps
  // are measured from it and the length is measured from it — a trace drawn
  // from its own earliest reading instead would sit off the end marker and off
  // the stamps annotating it whenever the leading readings were clipped or
  // decimated away.
  const start = startOf(cook);
  return {
    color,
    // The chart's key names both cooks, and a cook nobody named is spelled
    // there the way it is spelled everywhere else on the screen.
    name: cook.name || UNNAMED_COOK,
    pts: cook.series.map(readingOf),
    mins: minutesOf(cook),
    startedAt: start,
    stamps: stampsOf(cook.events, start, design),
    probeNames: probeNamesOf(cook.smokeProfile),
  };
};
