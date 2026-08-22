/**
 * How the Stats screen writes numbers down.
 *
 * The backend hands over raw milliseconds, pounds and scores; every decision
 * about how those read — the thousands separator, the unit, how an absent
 * figure is admitted — is made here, once, so the hero cards and the grid
 * cannot disagree with each other or with the history screens.
 */
import { NOT_RECORDED, formatCookDuration } from '../common/timeFormat';

export { NOT_RECORDED };

/** A count with its thousands separated: `1,031`. */
export const formatCount = (value: number): string => value.toLocaleString('en-US');

/**
 * A length of time in the vocabulary the history screens already use —
 * `128h 30m` — or an em-dash for a length nothing recorded.
 */
export const formatDuration = (ms: number | null): string => formatCookDuration(ms);

/** Weight as the screen says it: `412.4 lbs`, or an em-dash without one. */
export const formatPounds = (pounds: number | null): string =>
  pounds === null ? NOT_RECORDED : `${formatCount(pounds)} lbs`;

/**
 * A score out of ten, to one decimal — `8.6` — or an em-dash when no cook has
 * been rated. Zero is never printed here: the backend leaves an unrated archive
 * null rather than scoring it nothing.
 */
export const formatScore = (score: number | null): string =>
  score === null ? NOT_RECORDED : score.toFixed(1);

/**
 * A chamber temperature the way the smoke screens read one — `287°F`, whole
 * degrees, because a tenth of a degree of pit heat is noise.
 *
 * There is no absent case: a temperature nobody recorded is a record nobody
 * holds, and the record row says that rather than formatting a missing number.
 */
export const formatTemperature = (degrees: number): string =>
  `${formatCount(Math.round(degrees))}°F`;

/** `1 cook` / `4 cooks`: a count and the noun it agrees with. */
export const formatPlural = (count: number, noun: string): string =>
  `${formatCount(count)} ${count === 1 ? noun : `${noun}s`}`;

/** A plain count, or an em-dash for a figure the archive does not have. */
export const formatNumber = (value: number | null): string =>
  value === null ? NOT_RECORDED : formatCount(value);
