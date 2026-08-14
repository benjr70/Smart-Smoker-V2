/**
 * How the history screens write about time.
 *
 * One vocabulary for the list card, the detail header and the section grids:
 * lengths read `6h 20m`, moments read `9:15 AM`, days read `Apr 20, 2026` —
 * and anything not on record reads as an em-dash, because `0h 00m` would be a
 * claim about the cook rather than an admission about the record.
 */

/** What every unknown reads as, across the history screens. */
export const NOT_RECORDED = '—';

/** Milliseconds in the units a cook is talked about in. */
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * How long the cook ran, in the design's `6h 20m`.
 *
 * A cook whose length is not known — a session finished before the timestamps
 * existed, or one with no readings to derive it from — is tagged with an
 * em-dash.
 */
export const formatCookDuration = (durationMs: number | null): string => {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) {
    return NOT_RECORDED;
  }
  const hours = Math.floor(durationMs / HOUR);
  const minutes = Math.floor((durationMs % HOUR) / MINUTE);
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
};

/** A moment as a 12-hour clock reading — `9:15 AM` — or an em-dash without one. */
export const formatClockTime = (moment: Date | null): string => {
  if (moment === null) return NOT_RECORDED;
  return moment.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

/** A day the way the history cards write one — `Apr 20, 2026` — or an em-dash. */
export const formatDateLabel = (moment: Date | null): string => {
  if (moment === null) return NOT_RECORDED;
  return moment.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/** The shape the wizard's rest-time field records: `HH:MM`. */
const REST_TIME = /^(\d{1,2}):(\d{2})$/;

/**
 * The rest, humanized: the wizard records `01:30` and the design reads
 * `1h 30m`. A rest under an hour drops the empty hours. Anything that is not
 * the wizard's shape was typed by hand into an older record and is shown as it
 * was written; a blank is an em-dash.
 */
export const formatRestTime = (restTime: string): string => {
  const written = restTime.trim();
  if (written === '') return NOT_RECORDED;
  const match = REST_TIME.exec(written);
  if (match === null) return written;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
};
