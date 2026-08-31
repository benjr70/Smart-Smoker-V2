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
