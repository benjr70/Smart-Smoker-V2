import { DEFAULT_AUTO_STOP_IDLE_HOURS } from './app-settings.schema';

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * The settings document as the auto-stop threshold is read from it:
 * structurally, so the read survives a document written before the auto-stop
 * block existed, or one hydrated against a schema that does not declare it.
 */
export interface StoredAutoStopSettings {
  autoStop?: { idleHours?: number | null } | null;
}

/**
 * How long a cook's readings may be silent before the silence is taken to be
 * the end of it, in milliseconds, from a stored settings document.
 *
 * One function rather than one per reader: the live auto-stop and the legacy
 * cook-window backfill both cut a series at this threshold, and two readings of
 * the same setting that guard it differently would let the two disagree about
 * what "the cook is over" means — a stored `0`, a negative, or a `NaN` (a hand
 * edit, a restored backup, a direct write; the DTO's validation only covers the
 * API path) would make the backfill call every second reading a gap and stamp
 * whole legacy cooks as zero-length while the live stop went on using 6h.
 *
 * Anything that is not a positive finite number of hours — missing, null, or
 * nonsense — reads as the shipped default rather than as nothing, which would
 * compare as "never silent".
 */
export const idleThresholdMsOf = (stored: unknown): number => {
  const hours = (stored as StoredAutoStopSettings | null)?.autoStop?.idleHours;
  return (
    (typeof hours === 'number' && isFinite(hours) && hours > 0
      ? hours
      : DEFAULT_AUTO_STOP_IDLE_HOURS) * MS_PER_HOUR
  );
};
