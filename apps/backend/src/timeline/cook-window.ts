import { TimelineReading, momentOf } from './timeline.derive';

/** The stretch of time a cook actually ran, as its readings tell it. */
export interface CookWindow {
  /** The cook's first reading. */
  startedAt: Date;
  /** Its last reading before the silence that ended it. */
  finishedAt: Date;
}

/**
 * The contiguous window a series' cook ran in: from its first dated reading to
 * the last one before the first silence longer than `gapMs`.
 *
 * A session nobody ended goes on collecting readings for as long as it stays
 * current, so the box being fired up weeks later lands in it — and a cook whose
 * length is read from the two ends of such a series is reported as having run
 * for the fortnight between them. What separates the cook from the pollution is
 * silence: readings arrive every few seconds while a cook runs, and a gap of
 * hours in the middle of one does not happen. The first such gap is therefore
 * where the cook stopped, and everything past it belongs to something else.
 *
 * Only the first block is answered, deliberately: the later blocks of the
 * archive this exists to heal are ambient power-ons and a short grill firing,
 * not cooks, and inventing session records for them is a different decision
 * from stating honestly when the recorded one ran.
 *
 * Pure, and given its readings rather than a collection to read, so the rule is
 * exercised against fixtures rather than against a database.
 */
export const cookWindow = (
  readings: TimelineReading[],
  gapMs: number,
): CookWindow | null => {
  // Undated rows are dropped rather than placed: a reading that cannot say when
  // it was taken cannot be told from one on either side of a gap. Sorted
  // because a window cut from rows in storage order would cut at whichever
  // pair happened to be adjacent there.
  const moments = readings
    .map(momentOf)
    .filter((moment): moment is Date => moment !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  if (moments.length === 0) {
    return null;
  }
  // Walked by index rather than over `moments.slice(1)`: a series here is the
  // whole archive of one cook — a hundred thousand rows and more — and copying
  // it to skip its first element is a copy this can simply not make.
  let finishedAt = moments[0];
  for (let index = 1; index < moments.length; index += 1) {
    if (moments[index].getTime() - finishedAt.getTime() > gapMs) {
      break;
    }
    finishedAt = moments[index];
  }
  return { startedAt: moments[0], finishedAt };
};
