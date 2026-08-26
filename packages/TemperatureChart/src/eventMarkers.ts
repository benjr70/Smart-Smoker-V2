/**
 * Where the cook log is drawn on the chart.
 *
 * A logged event is a moment and a word: this module turns each one into a
 * place on the plot, the row its bubble sits in so that two taps a minute apart
 * do not print over each other, and the letter that bubble carries. It also
 * answers which marker a finger is resting on.
 *
 * Nothing here draws anything and nothing here holds state, which is what lets
 * the geometry of a crowded cook be asserted on without rendering one.
 */

/** One logged event, as the chart is handed it. */
export interface ChartEvent {
  /** The event's own identity, carried through so the drawing keys off it. */
  id: string;
  /** What the stamp is called; the marker shows its first letter. */
  label: string;
  /** The moment it was logged, in any shape a date arrives in. */
  at: Date | string | number;
  /** The colour to draw it in, already resolved by the caller from its tone. */
  color: string;
}

/** One event as it is drawn: a place, a row, a letter and a colour. */
export interface EventMarker {
  id: string;
  label: string;
  letter: string;
  color: string;
  /** Where along the plot it sits. */
  x: number;
  /** Which row its bubble is in — 0 unless it was crowded onto the second. */
  row: number;
  /** The moment it stands for, so the drawing can order and compare markers. */
  at: number;
}

/** The stretch of the cook the chart is currently drawing, in epoch millis. */
export interface DrawnWindow {
  from: number;
  to: number;
  /**
   * How far outside that stretch an event may fall and still be drawn, at the
   * edge it fell past. The window's ends are made of stored readings, and the
   * pit is only written down every so often, so a stamp tapped in the opening
   * seconds of a cook — or in the moments before it was stopped — is outside
   * the window by an accident of sampling rather than by belonging elsewhere.
   * Left out, it would sit in the cook log with nothing on the chart to match.
   */
  grace?: number;
}

/**
 * How close two bubbles may sit before the later one drops to a second row.
 * A bubble is 12 across, so anything under this is already overlapping ink.
 */
export const MARKER_STAGGER_GAP = 14;

/**
 * How many rows of bubbles a crowded stretch may spread over before it starts
 * again at the top. Three keeps the busiest minute of a cook legible while
 * still leaving the plot below it mostly plot.
 */
export const MARKER_MAX_ROWS = 3;

/** What a marker with nothing to say for itself shows. */
const NO_LETTER = '•';

/** The one letter a marker carries: the stamp's initial. */
export const markerLetter = (label: string): string => {
  const written = label.trim();
  return written === '' ? NO_LETTER : written.charAt(0).toUpperCase();
};

/**
 * Which row a bubble goes in, given where the last bubble in each row was put.
 *
 * The first row with room for it, so a run of taps walks down the rows instead
 * of flipping between two of them — three taps in the same half-minute put the
 * third back on top of the first if each one only looks at the one before it.
 * When no row has room the least crowded one takes it: rows run out before a
 * determined pitmaster does, and something has to be drawn.
 */
const rowFor = (place: number, lastInRow: readonly number[]): number => {
  for (let row = 0; row < MARKER_MAX_ROWS; row += 1) {
    const neighbour = lastInRow[row];
    if (neighbour === undefined || place - neighbour >= MARKER_STAGGER_GAP) return row;
  }

  let roomiest = 0;
  for (let row = 1; row < MARKER_MAX_ROWS; row += 1) {
    if ((lastInRow[row] as number) < (lastInRow[roomiest] as number)) roomiest = row;
  }
  return roomiest;
};

/**
 * The markers for one cook log, in the order they happened.
 *
 * Events well outside the drawn window are left out rather than pinned to an
 * edge: a marker drawn where its moment is not is a lie about the cook, and the
 * window is the caller's statement of what the plot currently covers. Events
 * just outside it are another matter — see {@link DrawnWindow.grace}.
 */
export const placeMarkers = (
  events: readonly ChartEvent[],
  x: (moment: number) => number,
  window: DrawnWindow
): EventMarker[] => {
  const grace = window.grace ?? 0;
  const drawn = events
    .map(event => ({ event, at: new Date(event.at).getTime() }))
    .filter(({ at }) => Number.isFinite(at) && at >= window.from - grace && at <= window.to + grace)
    .sort((one, other) => one.at - other.at);

  // Where the last bubble in each row was put, which is what a new one has to
  // clear to join that row.
  const lastInRow: number[] = [];
  return drawn.map(({ event, at }) => {
    // Drawn at its own moment, unless the grace let it in from just outside,
    // in which case it is drawn at the edge it came in over.
    const place = x(Math.min(window.to, Math.max(window.from, at)));
    const row = rowFor(place, lastInRow);
    lastInRow[row] = place;
    return {
      id: event.id,
      label: event.label,
      letter: markerLetter(event.label),
      color: event.color,
      x: place,
      row,
      at,
    };
  });
};

/**
 * The marker a touch is resting on, or nothing when the nearest one is further
 * off than the reader could have meant.
 *
 * A tolerance is asked for rather than assumed, because how near counts as near
 * depends on how tightly the cook's readings are packed — see
 * {@link sampleWidth}.
 */
export const nearestEvent = (
  markers: readonly EventMarker[],
  x: number,
  tolerance: number
): EventMarker | undefined => {
  let nearest: EventMarker | undefined;
  let closest = Number.POSITIVE_INFINITY;
  markers.forEach(marker => {
    const distance = Math.abs(marker.x - x);
    if (distance <= tolerance && distance < closest) {
      closest = distance;
      nearest = marker;
    }
  });
  return nearest;
};

/** The two ends of the plot a cook is drawn between. */
export interface PlotSpan {
  left: number;
  right: number;
}

/**
 * How wide one reading of the cook is drawn: the tolerance a touch is judged
 * against, so that "near a marker" means the same thing on a long cook as on a
 * short one. A cook of a single reading is treated as the whole plot wide,
 * because it is drawn across the whole plot.
 */
export const sampleWidth = (count: number, plot: PlotSpan): number =>
  (plot.right - plot.left) / Math.max(1, count - 1);

/**
 * The narrowest a touch may be judged by: a bubble is 12 across, and a mark the
 * reader can plainly see has to be tappable.
 */
export const MIN_TOUCH_TOLERANCE = 12;

/**
 * How near a finger has to be to a marker to be resting on it.
 *
 * One reading of the cook, except on cooks whose readings are packed tighter
 * than a fingertip: a twelve-hour brisket thinned onto a phone puts its
 * readings about a pixel apart, and a tolerance of a pixel means the stamp is
 * never named however carefully the marker is tapped.
 */
export const touchTolerance = (count: number, plot: PlotSpan): number =>
  Math.max(MIN_TOUCH_TOLERANCE, sampleWidth(count, plot));
