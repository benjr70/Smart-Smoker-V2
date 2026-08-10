import { useEffect, useState } from 'react';

/** What a clock with nothing to count from reads. */
const ZERO = '00:00:00';

/** Milliseconds in each unit the clock is written in. */
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * A span of milliseconds written as `HH:MM:SS`.
 *
 * Hours are not wrapped at 24: a cook that runs overnight is thirteen hours
 * long, not one hour long, and the number of hours is the only part of this
 * clock anybody reads at a glance.
 */
export function formatElapsed(elapsedMs: number): string {
  const elapsed = Math.max(elapsedMs, 0);
  const hours = Math.floor(elapsed / HOUR);
  const minutes = Math.floor((elapsed % HOUR) / MINUTE);
  const seconds = Math.floor((elapsed % MINUTE) / SECOND);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * How long the cook has been going, as a ticking `HH:MM:SS` string.
 *
 * Computed from the recorded start against the current time rather than
 * accumulated in the component, so the clock is right the instant it mounts:
 * a phone that reloads mid-cook, or is opened for the first time six hours in,
 * shows six hours rather than starting again from zero. The interval only
 * decides how often the same subtraction is redone.
 *
 * **Elapsed here is wall time since the stamp, always — pausing the smoker does
 * not pause it.** There are two possible meanings of "elapsed" and only one of
 * them can be true at a time: time since the cook started, or time the smoker
 * spent actually running. This hook is the first, because the stamp is the only
 * thing it reads and a clock that must survive a page reload can only be
 * recomputed from a stamp. Excluding paused time would need paused spans
 * recorded on the cook, which nothing stores.
 *
 * Freezing the display while paused and then recomputing on resume would be
 * neither meaning: the number would sit still through a half-hour pause and
 * then jump half an hour in one frame. So the clock goes on counting whether or
 * not the smoker is lit, and stops only when there is no cook to count — the
 * caller passes `null` once the cook is over, and the clock reads zero.
 *
 * Shared rather than local to a screen because the web status bar and the
 * touchscreen header show the same clock, and two implementations of it would
 * be two chances to disagree about what "elapsed" means.
 */
export function useElapsed(startedAt: Date | null | undefined): string {
  const startedMs = startedAt ? startedAt.getTime() : null;
  const [elapsed, setElapsed] = useState<string>(() =>
    startedMs === null ? ZERO : formatElapsed(Date.now() - startedMs)
  );

  useEffect(() => {
    if (startedMs === null) {
      setElapsed(ZERO);
      return undefined;
    }
    const show = () => setElapsed(formatElapsed(Date.now() - startedMs));
    show();
    const timer = setInterval(show, SECOND);
    return () => clearInterval(timer);
  }, [startedMs]);

  return elapsed;
}
