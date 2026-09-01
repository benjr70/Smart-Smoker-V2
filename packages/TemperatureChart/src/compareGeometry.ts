/**
 * Every measurement the compare chart makes.
 *
 * Two cooks are almost never lit at the same time of day, so the comparison is
 * drawn against hours elapsed rather than the clock: what a pitmaster is
 * comparing is how fast each cook climbed, and a clock axis would put a morning
 * brisket and an evening one on opposite ends of the plot with no overlap to
 * read. That single change of axis is why this module exists beside
 * `chartGeometry` rather than inside it — the single-cook chart is drawn in
 * time and stays that way.
 *
 * As with the single-cook chart, nothing here touches the DOM or holds state:
 * a domain, a path string or the positions a cook ran are values a test can
 * simply assert on.
 */
import { ScaleLinear, scaleLinear } from 'd3-scale';
import { curveCardinal, curveLinear, line } from 'd3-shape';
import { PlotBox, SERIES_KEYS, SeriesKey, Y_PADDING, Y_STEP, plotEdges } from './chartGeometry';

/**
 * One reading of every probe at a moment, as a stored cook comes back.
 *
 * Every value is nullable because every one of them can genuinely be missing: a
 * probe that was never plugged in reports nothing rather than zero degrees, and
 * the archive holds rows that cannot be placed in time at all.
 */
export interface CompareReading {
  date: Date | string | number | null;
  chamber: number | null;
  probe1: number | null;
  probe2: number | null;
  probe3: number | null;
}

/** The same reading, placed against the start of its own cook. */
export interface ElapsedReading {
  /** How long into the cook it was taken, in minutes. */
  minutes: number;
  chamber: number | null;
  probe1: number | null;
  probe2: number | null;
  probe3: number | null;
}

/** One position's sample out of a reading. */
export const sampleOf = (reading: ElapsedReading, position: SeriesKey): number | null =>
  reading[position];

/**
 * Whether a cook ran a probe in a position at all.
 *
 * A position is run when it reported anything: the backend already answers an
 * unplugged probe as nothing rather than as zero degrees, so a single reading
 * is the whole of the evidence. This is what decides both which chips the
 * screen can offer and which cook's name a key row carries, so it is asked of
 * the readings rather than of the profile — a cook whose probe was named and
 * then never plugged in did not run that position.
 */
export const ranIn = (points: readonly ElapsedReading[], position: SeriesKey): boolean =>
  points.some(point => sampleOf(point, position) !== null);

/**
 * The positions worth offering: the ones at least one of the cooks ran, in the
 * order they are drawn.
 *
 * A chip for a position neither cook ran is a chip that can only ever draw an
 * empty plot, so the row of chips is as narrow as the comparison itself.
 */
export const availablePositions = (cooks: readonly (readonly ElapsedReading[])[]): SeriesKey[] =>
  SERIES_KEYS.filter(position => cooks.some(points => ranIn(points, position)));

/** One cook as the plot draws it: where its readings are, and where it ended. */
export interface CompareRun {
  points: readonly ElapsedReading[];
  /** How long the cook ran, in minutes — where its end marker is ruled. */
  mins: number;
}

/** The shortest axis a comparison is drawn against, so a cook always has one. */
export const MIN_SPAN_MINUTES = 60;

/**
 * How far along the axis reaches: the longer of the two cooks.
 *
 * The span is the longer cook's, not each cook's own, which is the whole point
 * of the overlay — a four-hour cook drawn against the same axis as a nine-hour
 * one stops well short of the right-hand edge, and that stopping short is the
 * comparison. It is taken from the readings as well as from the recorded
 * duration, because a cook whose duration was never derived would otherwise be
 * drawn off the end of the plot.
 */
export const compareSpanMinutes = (runs: readonly CompareRun[]): number => {
  const ends = runs.flatMap(run => [
    Number.isFinite(run.mins) ? run.mins : 0,
    run.points.length > 0 ? run.points[run.points.length - 1].minutes : 0,
  ]);
  return Math.max(MIN_SPAN_MINUTES, ...ends);
};

/** The axis shown when there is nothing on the plot to scale to. */
export const EMPTY_Y_DOMAIN: [number, number] = [0, 100];

/**
 * The temperature axis for the pair: both cooks' readings, in the positions
 * given, padded and rounded outward the way the single-cook chart rounds its
 * own.
 *
 * The positions given are the ones the plot can offer rather than the ones
 * currently drawn — see `CompareChart`, which hands it the whole chip row. A
 * domain that followed the chips would move the axis and every remaining trace
 * under the reader's eye each time one was pressed, and two glances at the same
 * plot would not be comparable.
 */
export const compareYDomain = (
  runs: readonly CompareRun[],
  positions: readonly SeriesKey[]
): [number, number] => {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;

  runs.forEach(run =>
    run.points.forEach(point =>
      positions.forEach(position => {
        const sample = sampleOf(point, position);
        if (sample === null || !Number.isFinite(sample)) return;
        low = Math.min(low, sample);
        high = Math.max(high, sample);
      })
    )
  );

  if (low > high) return EMPTY_Y_DOMAIN;
  return [
    Math.floor((low - Y_PADDING) / Y_STEP) * Y_STEP,
    Math.ceil((high + Y_PADDING) / Y_STEP) * Y_STEP,
  ];
};

/** What each position is called on the chips and down the key. */
export const POSITION_LABEL: Record<SeriesKey, string> = {
  chamber: 'Chamber',
  probe1: 'Probe 1',
  probe2: 'Probe 2',
  probe3: 'Probe 3',
};

/**
 * The dash each position is drawn with.
 *
 * Colour already means the cook, so it cannot also mean the probe: with four
 * positions and two cooks there are eight lines that can be on the plot at
 * once, and a dash is the encoding left that survives being overlaid.
 */
export const POSITION_DASH: Record<SeriesKey, string> = {
  chamber: '4,3',
  probe1: '',
  probe2: '7,3',
  probe3: '1.5,3',
};

/** How heavily each position is drawn, weighted towards the money probe. */
export const POSITION_WIDTH: Record<SeriesKey, number> = {
  chamber: 1.4,
  probe1: 2.4,
  probe2: 1.8,
  probe3: 1.4,
};

/**
 * How solidly each position is drawn.
 *
 * The first probe is the one a cook is judged by, so it is drawn at full
 * strength and everything else is held a little behind it.
 */
export const POSITION_OPACITY: Record<SeriesKey, number> = {
  chamber: 0.7,
  probe1: 1,
  probe2: 0.7,
  probe3: 0.7,
};

/**
 * The positions a comparison opens on: the pit and the money probe.
 *
 * Two lines per cook is what a phone-sized plot reads well at; the rest are a
 * chip away for a reader who wants them.
 */
export const DEFAULT_POSITIONS: readonly SeriesKey[] = ['chamber', 'probe1'];

/**
 * The box the comparison is drawn in.
 *
 * There is one shape rather than the single-cook chart's three: the comparison
 * is a phone screen's card, and the kiosk — which is where the other two shapes
 * are for — does not compare cooks. It is a little taller for its width than
 * the review card's, because two cooks' worth of lines need the vertical room
 * to be told apart.
 */
export const COMPARE_BOX: PlotBox = {
  width: 360,
  height: 210,
  margin: { top: 14, right: 10, bottom: 26, left: 40 },
};

/** The two scales that turn an elapsed reading into a place on the plot. */
export interface CompareScales {
  /** Minutes into the cook, across the plot. */
  x: ScaleLinear<number, number>;
  /** Temperature, up it. */
  y: ScaleLinear<number, number>;
}

/**
 * The scales for the pair in one box: hours elapsed across the plot,
 * temperature up it.
 *
 * Both cooks share both scales — that sharing is the comparison. The x scale is
 * linear over minutes rather than a time scale over moments, so that two cooks
 * lit twelve hours apart are drawn on top of each other from their own starts.
 */
export const compareScales = (
  runs: readonly CompareRun[],
  positions: readonly SeriesKey[],
  box: PlotBox = COMPARE_BOX
): CompareScales => {
  const edges = plotEdges(box);
  return {
    x: scaleLinear()
      .domain([0, compareSpanMinutes(runs)])
      .range([edges.left, edges.right]),
    y: scaleLinear().domain(compareYDomain(runs, positions)).range([edges.bottom, edges.top]),
  };
};

/**
 * One cook's line for one position, as an SVG path.
 *
 * The chamber is smoothed and the meat probes are drawn straight, for the same
 * reasons the single-cook chart does it: a chamber swings with every lid
 * opening and its shape is what matters, while a curve through a meat probe's
 * readings would invent an overshoot it never had. A position that stopped
 * reporting breaks the line rather than dragging it to the floor, and one the
 * cook never ran draws nothing at all.
 */
export const comparePath = (
  points: readonly ElapsedReading[],
  position: SeriesKey,
  scales: CompareScales
): string => {
  const drawn = line<ElapsedReading>()
    .defined(point => {
      const sample = sampleOf(point, position);
      return sample !== null && Number.isFinite(sample);
    })
    .x(point => scales.x(point.minutes))
    .y(point => scales.y(sampleOf(point, position) ?? 0))
    .curve(position === 'chamber' ? curveCardinal : curveLinear);

  return drawn([...points]) ?? '';
};

/** How many hour labels fit under the plot before they start to crowd. */
const HOUR_LABELS = 5;

/**
 * The hours the chart writes under the plot.
 *
 * Every hour is labelled while there is room for it and every second, third or
 * fourth once there is not, so that the labels stay whole hours: "0h 1h 2h" is
 * read at a glance, where a divide-the-span-in-five rule would write 2.4h.
 */
export const hourTicks = (spanMinutes: number): number[] => {
  const hours = Math.max(0, spanMinutes) / 60;
  const step = Math.max(1, Math.ceil(hours / HOUR_LABELS));
  const ticks: number[] = [];
  for (let hour = 0; hour <= hours; hour += step) ticks.push(hour);
  return ticks;
};

/** How many milliseconds a minute is, which is the whole of the conversion. */
const MINUTE = 60_000;

/** A moment as a number, or nothing when it is not one that can be read. */
export const momentValue = (value: Date | string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const moment = new Date(value).getTime();
  return Number.isNaN(moment) ? null : moment;
};

/** A reading's moment, or nothing when it carries none that can be read. */
const momentOf = (reading: CompareReading): number | null => momentValue(reading.date);

/**
 * A cook's readings placed against its own start, oldest first.
 *
 * The start is the caller's where it has one, because the caller is the only
 * one that knows it: the app derives a cook's start, its length and the moment
 * of every stamp from the same timeline, and a chart that re-derived zero from
 * its own readings would put the traces on a different origin from the end
 * marker and the stamp rail drawn beside them — a cook whose leading rows were
 * clipped or decimated away starts, as far as its readings go, some minutes
 * after it started.
 *
 * Where no start is given the earliest reading stands in, rather than the first
 * in the array: a stored cook comes back in whatever order the database found
 * its rows in — newest-first, in practice — and a cook measured from its last
 * reading would be drawn entirely to the left of zero. Readings that cannot be
 * placed in time are dropped rather than dated to the epoch, which would
 * stretch the axis from this cook's few hours to the decades since 1970.
 */
export const elapsedPoints = (
  readings: readonly CompareReading[],
  startedAt: Date | string | number | null = null
): ElapsedReading[] => {
  const dated = readings
    .map(reading => ({ reading, moment: momentOf(reading) }))
    .filter((one): one is { reading: CompareReading; moment: number } => one.moment !== null)
    .sort((one, other) => one.moment - other.moment);

  if (dated.length === 0) return [];
  const start = momentValue(startedAt) ?? dated[0].moment;

  return dated.map(({ reading, moment }) => ({
    minutes: (moment - start) / MINUTE,
    chamber: reading.chamber,
    probe1: reading.probe1,
    probe2: reading.probe2,
    probe3: reading.probe3,
  }));
};

/**
 * How far into a cook a moment is, as the readout writes it.
 *
 * Hours and whole minutes rather than decimal hours: a pitmaster reads a cook
 * in the units they set timers in, and "4h 05m" is a time where "4.09h" is a
 * number. The minutes are padded so that a finger dragged across the plot does
 * not have the readout jitter in width as it passes each ten-minute mark.
 */
export const formatElapsed = (minutes: number): string => {
  const total = Math.max(0, Math.round(minutes));
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`;
};

/**
 * How often a cook was reporting at all, in minutes: the middle gap between
 * consecutive readings, or nothing when there are not two to measure between.
 *
 * The middle gap rather than the average, because a cook's readings are thinned
 * by the caller and interrupted by restarts: one four-hour hole would drag an
 * average out to where it says nothing about how densely the cook was logged.
 * Measured over the whole cook rather than per position, so that a probe which
 * only ever reported once is still held to the cadence the cook was running at.
 *
 * Takes the readings in the order `elapsedPoints` leaves them, oldest first.
 */
const readingCadence = (points: readonly ElapsedReading[]): number | null => {
  const gaps: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const gap = points[index].minutes - points[index - 1].minutes;
    if (Number.isFinite(gap) && gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return null;
  const sorted = [...gaps].sort((one, other) => one - other);
  return sorted[Math.floor(sorted.length / 2)];
};

/**
 * How many of the cook's own reading intervals a sample still stands for.
 *
 * A reading speaks for the minutes around it, but only for so long: a probe
 * unplugged half an hour into a nine-hour cook stopped saying anything after
 * that, and a readout that kept quoting its last temperature would have the
 * plot claim a probe is live hours after it went quiet — while the trace beside
 * it correctly breaks. A few intervals' grace rather than one, so that a
 * position which dropped a row or two is still read across the hole.
 */
export const STALE_GAP_FACTOR = 3;

/**
 * The reading nearest a scrubbed minute that actually reported a position, so
 * long as the scrub is still within reach of it.
 *
 * Asked per position rather than per reading, because the two cooks report
 * unevenly: a probe plugged in late, or one that dropped out for a few rows,
 * leaves readings that carry a chamber and nothing else, and reading straight
 * off the nearest row would blank a probe that was cooking happily either side
 * of it.
 *
 * Out of reach is measured against the cook's own cadence rather than a fixed
 * number of minutes: a cook logged every fifteen seconds and one thinned to a
 * reading an hour are both read the way they were recorded. A cook with a
 * single reading has no cadence to be judged against and is read wherever it is
 * scrubbed, since one reading is the whole of what it has to say.
 */
const nearestReading = (
  points: readonly ElapsedReading[],
  position: SeriesKey,
  minutes: number
): ElapsedReading | null => {
  let nearest: ElapsedReading | null = null;
  let distance = Number.POSITIVE_INFINITY;
  points.forEach(point => {
    if (sampleOf(point, position) === null) return;
    const away = Math.abs(point.minutes - minutes);
    if (away >= distance) return;
    distance = away;
    nearest = point;
  });

  const cadence = readingCadence(points);
  if (cadence !== null && distance > cadence * STALE_GAP_FACTOR) return null;
  return nearest;
};

/** What a cook read on a position at a scrubbed minute, or nothing. */
export const nearestSample = (
  points: readonly ElapsedReading[],
  position: SeriesKey,
  minutes: number
): number | null => {
  const point = nearestReading(points, position, minutes);
  return point === null ? null : sampleOf(point, position);
};

/** Where the sample a scrub is reading sits on the plot, for the dot on it. */
export const nearestPoint = (
  points: readonly ElapsedReading[],
  position: SeriesKey,
  minutes: number,
  scales: CompareScales
): { x: number; y: number } | null => {
  const point = nearestReading(points, position, minutes);
  const sample = point === null ? null : sampleOf(point, position);
  if (point === null || sample === null) return null;
  return { x: scales.x(point.minutes), y: scales.y(sample) };
};

/** Where on the screen the chart is drawn, as the browser measures it. */
export interface CompareBounds {
  left: number;
  width: number;
}

/**
 * The minute of the cooks under a pointer.
 *
 * The plot is drawn at whatever width its card gives it, so a touch has to be
 * brought back through that scaling before it means a minute. A finger dragged
 * off either end of the plot is held to the axis rather than reading a minute
 * outside it: the readout should say the first or the last of the cook, not a
 * time before it was lit. A chart the browser has not measured — under a test,
 * or before the first layout — is read as drawn at its own size, which is the
 * only assumption available and keeps the sum finite.
 */
export const elapsedAt = (
  viewportX: number,
  bounds: CompareBounds,
  box: PlotBox,
  scales: CompareScales
): number => {
  const scale = bounds.width > 0 ? box.width / bounds.width : 1;
  const minutes = scales.x.invert((viewportX - bounds.left) * scale);
  const [first, last] = scales.x.domain();
  return Math.min(Math.max(minutes, first), last);
};

/**
 * How far in each stamp rail's track is held from the edges of the card.
 *
 * The rails are laid out in HTML rather than drawn in the SVG — a stamp is a
 * thumb target with a label, and those are cheaper to make right as elements
 * than as shapes — so the one thing that keeps a rail honest is that its track
 * is inset by the plot's own padding, as a share of the box. A stamp at hour
 * zero then sits over hour zero on the plot above it, which is the whole claim
 * a rail makes.
 */
export const railInset = (box: PlotBox = COMPARE_BOX): { left: string; right: string } => ({
  left: `${(box.margin.left / box.width) * 100}%`,
  right: `${(box.margin.right / box.width) * 100}%`,
});

/**
 * A minute held to the axis the comparison is drawn against.
 *
 * The span is taken from the readings and the recorded durations, so a stamp
 * can genuinely fall outside it — a cook pulled a few minutes after its last
 * reading is the ordinary case. Everything that draws that stamp goes through
 * here, so that its dot on the rail and its guide on the plot are placed at the
 * same minute: a guide ruled at the raw minute would land outside the plot
 * while the dot sat clamped at the end of the track, and the two would be
 * pointing at different moments.
 */
export const clampToSpan = (minutes: number, spanMinutes: number): number => {
  if (!Number.isFinite(spanMinutes) || spanMinutes <= 0) return 0;
  return Math.min(Math.max(minutes, 0), spanMinutes);
};

/** Where along a rail's track a minute sits, as the track's own share. */
export const railOffset = (minutes: number, spanMinutes: number): string => {
  if (!Number.isFinite(spanMinutes) || spanMinutes <= 0) return '0%';
  return `${(clampToSpan(minutes, spanMinutes) / spanMinutes) * 100}%`;
};

/**
 * How close to a stamp a scrub has to come for it to swell: a share of the
 * shared elapsed axis.
 *
 * Of the shared axis and not of each cook's own length, because the cursor
 * moves along that shared axis: measuring the shorter cook's stamps against its
 * own duration would collapse their hit zone to a couple of pixels next to the
 * longer cook's, and the shorter cook's stamps would never swell during a
 * scrub. It is also the measure every other rail placement is made in.
 */
export const STAMP_NEAR_FRACTION = 0.03;

/** Whether the scrub is near enough to a stamp for it to swell. */
export const isNearStamp = (
  stampMinutes: number,
  cursorMinutes: number | null,
  spanMinutes: number
): boolean => {
  if (cursorMinutes === null || !Number.isFinite(spanMinutes) || spanMinutes <= 0) return false;
  return Math.abs(stampMinutes - cursorMinutes) < spanMinutes * STAMP_NEAR_FRACTION;
};
