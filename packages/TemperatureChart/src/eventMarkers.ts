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
}

/**
 * How close two bubbles may sit before the later one drops to a second row.
 * A bubble is 12 across, so anything under this is already overlapping ink.
 */
export const MARKER_STAGGER_GAP = 14;

/** What a marker with nothing to say for itself shows. */
const NO_LETTER = '•';

/** The one letter a marker carries: the stamp's initial. */
export const markerLetter = (label: string): string => {
  const written = label.trim();
  return written === '' ? NO_LETTER : written.charAt(0).toUpperCase();
};

/**
 * The markers for one cook log, in the order they happened.
 *
 * Events outside the drawn window are left out rather than pinned to an edge:
 * a marker drawn where its moment is not is a lie about the cook, and the
 * window is the caller's statement of what the plot currently covers.
 */
export const placeMarkers = (
  events: readonly ChartEvent[],
  x: (moment: number) => number,
  window: DrawnWindow
): EventMarker[] => {
  const drawn = events
    .map(event => ({ event, at: new Date(event.at).getTime() }))
    .filter(({ at }) => Number.isFinite(at) && at >= window.from && at <= window.to)
    .sort((one, other) => one.at - other.at);

  let previous: EventMarker | undefined;
  return drawn.map(({ event, at }) => {
    const place = x(at);
    // Crowded markers take turns on the second row rather than every crowded
    // one moving down: a run of taps then reads as two legible rows instead of
    // one row of ink and one blob under it.
    const row =
      previous !== undefined && place - previous.x < MARKER_STAGGER_GAP ? 1 - previous.row : 0;
    const marker: EventMarker = {
      id: event.id,
      label: event.label,
      letter: markerLetter(event.label),
      color: event.color,
      x: place,
      row,
      at,
    };
    previous = marker;
    return marker;
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
