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
  let finishedAt = moments[0];
  for (const moment of moments.slice(1)) {
    if (moment.getTime() - finishedAt.getTime() > gapMs) {
      break;
    }
    finishedAt = moment;
  }
  return { startedAt: moments[0], finishedAt };
};

/**
 * The hottest chamber reading inside a window, or `null` where the rows in it
 * hold nothing readable.
 *
 * Bounded, because that is the whole point of the window: the stray firing of
 * the box that follows an unended cook can easily be hotter than the cook was —
 * a grill run wide open reads 400°F where a brisket smoke sat at 225°F — and
 * the peak stamped on the cook must be a fact about the cook.
 *
 * Readings are stored as strings, and one that is not a number (blank, `n/a`)
 * is passed over rather than read as a zero, which is the same rule the grouped
 * peak aggregation applies with its `$convert`.
 */
export const peakChamberIn = (
  readings: TimelineReading[],
  window: CookWindow,
): number | null => {
  const peaks = readings
    .filter((row) => {
      const moment = momentOf(row);
      return (
        moment !== null &&
        moment >= window.startedAt &&
        moment <= window.finishedAt
      );
    })
    .map((row) =>
      String(row.ChamberTemp ?? '').trim() === ''
        ? Number.NaN
        : Number(row.ChamberTemp),
    )
    .filter((value) => Number.isFinite(value));
  return peaks.length === 0 ? null : Math.max(...peaks);
};
