/**
 * Every measurement the temperature chart makes.
 *
 * The chart itself only decides what to draw; this module decides where each of
 * those things goes. Keeping the two apart is what makes the geometry testable
 * without a browser — a domain, a path string or a nearest sample is a value
 * that can simply be asserted on — and it keeps the component free of the
 * arithmetic that used to be tangled up with the drawing.
 *
 * Nothing here touches the DOM, and nothing here holds state.
 */
import { ScaleLinear, ScaleTime, scaleLinear, scaleTime } from 'd3-scale';
import { curveCardinal, curveLinear, line } from 'd3-shape';

/**
 * One reading of every probe at a moment.
 *
 * The date is accepted in every shape the readings arrive in: a `Date` from a
 * live socket, an ISO string from the API, or an epoch number.
 */
export interface ChartSample {
  ChamberTemp: number;
  MeatTemp: number;
  Meat2Temp: number;
  Meat3Temp: number;
  date: Date | string | number;
}

/** The four lines the chart draws, in the order they are drawn and listed. */
export type SeriesKey = 'chamber' | 'probe1' | 'probe2' | 'probe3';

export const SERIES_KEYS: readonly SeriesKey[] = ['chamber', 'probe1', 'probe2', 'probe3'];

/** A target temperature per meat probe; the chamber has a range, not a target. */
export type ProbeTargets = Partial<Record<Exclude<SeriesKey, 'chamber'>, number>>;

/** The reading each series is drawn from. */
const READING_OF: Record<SeriesKey, (sample: ChartSample) => number> = {
  chamber: sample => sample.ChamberTemp,
  probe1: sample => sample.MeatTemp,
  probe2: sample => sample.Meat2Temp,
  probe3: sample => sample.Meat3Temp,
};

/** One series' reading out of a sample. */
export const readingOf = (sample: ChartSample, series: SeriesKey): number =>
  READING_OF[series](sample);

/** A sample's moment, whichever shape its date arrived in. */
export const timeOf = (sample: ChartSample): number => new Date(sample.date).getTime();

/**
 * Whether a reading is one the probe actually took.
 *
 * A probe that is not plugged in reports zero rather than nothing, so a cook run
 * with one meat probe would otherwise be drawn as three lines pinned to the
 * bottom of the plot, dragging the axis down with them.
 */
export const isReported = (reading: number): boolean => Number.isFinite(reading) && reading > 0;

/** What a probe that took no reading reads as, which is what the hardware sends. */
export const UNREPORTED = 0;

/** Whether a probe took any reading at all over the course of a cook. */
export const reportsIn = (data: ChartSample[], series: SeriesKey): boolean =>
  data.some(sample => isReported(readingOf(sample, series)));

/**
 * The targets that belong on the chart: the ones set for meat that is actually
 * in the smoker.
 *
 * Every smoke starts with a target seeded for all three probes, so drawing a
 * target simply because one was configured would rule a cook run with a single
 * probe across with dashed lines for meat that is not there — and stretch the
 * temperature axis to reach them, squashing the one real trace into a sliver of
 * the plot. A probe that reported and was then pulled keeps its target: that
 * meat was cooked, and its target is still what it was cooked towards.
 */
export const reportedTargets = (data: ChartSample[], targets: ProbeTargets): ProbeTargets => {
  const kept: ProbeTargets = {};
  (Object.keys(targets) as (keyof ProbeTargets)[]).forEach(series => {
    const target = targets[series];
    if (target !== undefined && isReported(target) && reportsIn(data, series))
      kept[series] = target;
  });
  return kept;
};

/** How far past the readings the axis reaches before it is rounded. */
export const Y_PADDING = 15;
/** The interval the axis is rounded outward to, so its labels stay round. */
export const Y_STEP = 25;
/** The axis shown before anything has been recorded. */
const EMPTY_Y_DOMAIN: [number, number] = [0, 100];

/**
 * The temperature axis: the readings' own range, padded and rounded outward,
 * rather than one anchored at zero.
 *
 * Anchoring at zero is what used to flatten a brisket's six-hour climb into the
 * bottom eighth of the plot. Targets are included so that a probe's dashed
 * target line is on the chart even before the meat has climbed anywhere near it.
 */
export const tempYDomain = (
  data: ChartSample[],
  targets: ProbeTargets = {},
  snapshot?: number
): [number, number] => {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;

  const consider = (reading: number): void => {
    if (!isReported(reading)) return;
    low = Math.min(low, reading);
    high = Math.max(high, reading);
  };

  data.forEach(sample => SERIES_KEYS.forEach(series => consider(readingOf(sample, series))));
  Object.values(targets).forEach(consider);
  if (snapshot !== undefined) consider(snapshot);

  if (low > high) return EMPTY_Y_DOMAIN;
  return [
    Math.floor((low - Y_PADDING) / Y_STEP) * Y_STEP,
    Math.ceil((high + Y_PADDING) / Y_STEP) * Y_STEP,
  ];
};

/**
 * How many points a cook is thinned to before it is drawn: enough that the
 * curve of a stall is still visible, few enough that a twelve-hour cook is not
 * tens of thousands of path segments.
 */
export const DEFAULT_MAX_POINTS = 300;

/**
 * The mean of the samples in one bucket, as a sample in its own right.
 *
 * Each line is averaged over the readings its own probe actually took, because
 * the zeros a probe reads before it is plugged in are not cold meat — averaging
 * them in would invent a temperature nothing ever reached and pull the axis down
 * to meet it.
 */
const meanOf = (bucket: ChartSample[]): ChartSample => {
  const mean = (series: SeriesKey): number => {
    const reported = bucket.map(sample => readingOf(sample, series)).filter(isReported);
    if (reported.length === 0) return UNREPORTED;
    return reported.reduce((total, reading) => total + reading, 0) / reported.length;
  };

  return {
    ChamberTemp: mean('chamber'),
    MeatTemp: mean('probe1'),
    Meat2Temp: mean('probe2'),
    Meat3Temp: mean('probe3'),
    date: new Date(bucket.reduce((total, sample) => total + timeOf(sample), 0) / bucket.length),
  };
};

/**
 * The cook in the order it was cooked.
 *
 * A series does not always arrive that way: a stored cook comes back from the
 * API in whatever order the database found its rows in — newest-first, in
 * practice — and a live screen appends what has arrived since to whatever it was
 * given as a baseline. Everything downstream of here reads a cook as a sequence:
 * thinning buckets it by position, the tooltip binary-searches it, and the dot
 * marking where the cook has got to is looked for from the end. Ordering it once,
 * here, is what lets all of them keep saying so plainly.
 *
 * A cook already in order is handed straight back, identical, so that ordering a
 * live series on every reading costs the chart no redrawing.
 */
export const inTimeOrder = (data: ChartSample[]): ChartSample[] => {
  for (let at = 1; at < data.length; at += 1) {
    if (timeOf(data[at - 1]) > timeOf(data[at]))
      return [...data].sort((one, other) => timeOf(one) - timeOf(other));
  }
  return data;
};

/**
 * A cook thinned to at most `maxPoints`, each point the mean of the readings it
 * stands in for.
 *
 * Averaging rather than sampling is what keeps the line honest: a cook that
 * wobbles as the lid opens keeps the shape of that wobble instead of it landing
 * on, or missing, whichever reading a sampling rule happened to pick. A cook
 * already short enough, and already in order, is handed straight back, unchanged
 * and identical, so a caller can decimate unconditionally without giving the
 * chart a new array to redraw from on every update.
 *
 * The readings are put in time order first, because a bucket is a run of the
 * array: averaged out of order, a bucket would stand for moments that never sat
 * together and would be dated to the middle of nowhere in particular.
 */
export const decimate = (
  data: ChartSample[],
  maxPoints: number = DEFAULT_MAX_POINTS
): ChartSample[] => {
  const ordered = inTimeOrder(data);
  if (maxPoints < 1 || ordered.length <= maxPoints) return ordered;

  const buckets: ChartSample[][] = Array.from({ length: maxPoints }, () => []);
  ordered.forEach((sample, at) =>
    buckets[Math.floor((at * maxPoints) / ordered.length)].push(sample)
  );

  return buckets.filter(bucket => bucket.length > 0).map(meanOf);
};

/**
 * Which reading a moment is nearest to, or -1 when there are none.
 *
 * The readings are in time order — {@link inTimeOrder} is what makes sure of
 * that — so this walks in from both ends rather than scanning: a finger dragged
 * across a long cook asks this question on every pointer event. A moment
 * outside the cook settles on the end it is past, and a moment exactly between
 * two readings settles on the earlier one. A moment that
 * is no moment at all — a pointer event that arrived without a position — is
 * nearest to nothing.
 */
export const nearestIndex = (data: ChartSample[], moment: number): number => {
  if (data.length === 0 || !Number.isFinite(moment)) return -1;

  let low = 0;
  let high = data.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (timeOf(data[middle]) < moment) low = middle + 1;
    else high = middle;
  }

  const before = Math.max(0, low - 1);
  const distance = (index: number): number => Math.abs(timeOf(data[index]) - moment);
  return distance(before) <= distance(low) ? before : low;
};

/** The box the plot is drawn in, and the room left around it for its labels. */
export interface PlotBox {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
}

/** The two scales that turn a reading into a place on the plot. */
export interface ChartScales {
  x: ScaleTime<number, number>;
  y: ScaleLinear<number, number>;
}

/** A place on the plot. */
export interface Point {
  x: number;
  y: number;
}

/** How wide a cook of a single reading is treated as being, so it has an axis. */
export const LONE_READING_SPAN = 60_000;

/**
 * The span a cook covers, widened when it is too short to have one.
 *
 * The span is taken from the moments in the cook rather than from the ends of
 * the array, so a series that arrives newest-first — which is how a stored cook
 * comes back from a database asked for it without an order — is still drawn
 * forwards. Reading the ends instead once inverted the axis: the clock ran
 * backwards under the plot, and the cook was drawn off the side of it.
 *
 * A cook with no readings at all — the first seconds of a smoke, or a backend
 * not yet reporting — is given a window around the present rather than around
 * the epoch, because an axis labelled with 1970 clock times tells the reader
 * their smoker has done something strange when in fact it has done nothing yet.
 * A cook whose readings carry no readable moment at all is the same case. The
 * present is passed in rather than read, so the window can be pinned.
 */
export const timeDomainOf = (data: ChartSample[], now: number = Date.now()): [Date, Date] => {
  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;
  data.forEach(sample => {
    const moment = timeOf(sample);
    if (!Number.isFinite(moment)) return;
    earliest = Math.min(earliest, moment);
    latest = Math.max(latest, moment);
  });

  if (earliest > latest) return [new Date(now - LONE_READING_SPAN), new Date(now)];
  if (earliest < latest) return [new Date(earliest), new Date(latest)];
  return [new Date(earliest - LONE_READING_SPAN), new Date(latest + LONE_READING_SPAN)];
};

/**
 * The scales for one cook in one box: time across the plot, temperature up it.
 *
 * Targets are passed through to the temperature axis so that a target line is
 * drawn inside the plot rather than off the top of it.
 */
export const createScales = (
  data: ChartSample[],
  box: PlotBox,
  targets: ProbeTargets = {},
  snapshot?: number
): ChartScales => ({
  x: scaleTime()
    .domain(timeDomainOf(data))
    .range([box.margin.left, box.width - box.margin.right]),
  y: scaleLinear()
    .domain(tempYDomain(data, targets, snapshot))
    .range([box.height - box.margin.bottom, box.margin.top]),
});

/**
 * One series drawn as an SVG path.
 *
 * The chamber is smoothed, because it swings with every lid opening and the
 * shape of the cook is what matters; a meat probe is drawn straight, because a
 * curve through its readings would invent an overshoot it never had. Readings a
 * probe did not take break the line rather than dragging it to the floor, so a
 * probe unplugged mid-cook leaves a gap, and a probe never plugged in draws
 * nothing at all.
 */
export const seriesPath = (data: ChartSample[], series: SeriesKey, scales: ChartScales): string => {
  const drawn = line<ChartSample>()
    .defined(sample => isReported(readingOf(sample, series)))
    .x(sample => scales.x(timeOf(sample)))
    .y(sample => scales.y(readingOf(sample, series)))
    .curve(series === 'chamber' ? curveCardinal : curveLinear);

  return drawn(data) ?? '';
};

/** The three shapes the chart is drawn in. */
export type ChartAspect = 'mobile' | 'touchscreen' | 'compact';

/**
 * The box each context draws in.
 *
 * These are the coordinates the chart works in, not the pixels it ends up as:
 * the SVG scales to whatever width its container gives it, so a box is really
 * an aspect ratio plus enough room for labels at that ratio — and a box drawn
 * wider than it is written for is one whose labels come out bigger, which is
 * what makes the kiosk's writing legible from arm's length.
 *
 * The touchscreen's is the widest of the three, because the panel it hangs on
 * is 800 across and 480 down and the readouts and the two actions take the top
 * of it: what is left for the chart is a wide, short strip, and a shape drawn
 * for a tall panel would have to be shrunk away from both sides to fit it. The
 * compact one is for the review card in History.
 */
const PLOT_BOXES: Record<ChartAspect, PlotBox> = {
  mobile: { width: 360, height: 200, margin: { top: 12, right: 12, bottom: 22, left: 38 } },
  touchscreen: { width: 430, height: 160, margin: { top: 16, right: 16, bottom: 26, left: 44 } },
  compact: { width: 340, height: 160, margin: { top: 10, right: 10, bottom: 20, left: 34 } },
};

export const plotBoxOf = (aspect: ChartAspect): PlotBox => PLOT_BOXES[aspect];

/** How many labels an axis carries before it starts to crowd. */
const TICK_COUNT = 4;

/** The temperatures the chart rules a gridline and writes a label at. */
export const tempTicks = (scales: ChartScales, count: number = TICK_COUNT): number[] =>
  scales.y.ticks(count);

/** The moments the chart writes a time under. */
export const timeTicks = (scales: ChartScales, count: number = TICK_COUNT): Date[] =>
  scales.x.ticks(count);

/** Where one series' reading in a sample sits, or nothing if it was not taken. */
export const pointOf = (
  sample: ChartSample,
  series: SeriesKey,
  scales: ChartScales
): Point | null => {
  const reading = readingOf(sample, series);
  if (!isReported(reading)) return null;
  return { x: scales.x(timeOf(sample)), y: scales.y(reading) };
};

/**
 * Where a series' latest real reading sits, for the dot that marks it.
 *
 * The latest reading is searched for backwards rather than taken from the end of
 * the cook, so a probe pulled out a minute ago still carries its dot at the
 * temperature it was pulled out at instead of losing it.
 */
export const latestPointOf = (
  data: ChartSample[],
  series: SeriesKey,
  scales: ChartScales
): Point | null => {
  for (let at = data.length - 1; at >= 0; at -= 1) {
    const point = pointOf(data[at], series, scales);
    if (point) return point;
  }
  return null;
};

/** The four edges of the plot inside its box. */
export interface PlotEdges {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Where the plot itself begins and ends inside the box it was given. */
export const plotEdges = (box: PlotBox): PlotEdges => ({
  left: box.margin.left,
  right: box.width - box.margin.right,
  top: box.margin.top,
  bottom: box.height - box.margin.bottom,
});

/** How big the chart's writing is, in its own coordinates. */
export const LABEL_SIZE = 10;
/** How far a label is held off the plot it labels. */
const LABEL_GAP = 6;

/**
 * Where the axis labels are written: outside the plot on both axes, so that a
 * line running along the bottom or the left never has writing across it.
 */
export const axisLabelAnchors = (box: PlotBox): { tempX: number; timeY: number } => {
  const edges = plotEdges(box);
  return { tempX: edges.left - LABEL_GAP, timeY: edges.bottom + LABEL_GAP + LABEL_SIZE };
};

/**
 * Where a target's label is written: at the right-hand end of the line it names,
 * lifted half a label clear of it, so the temperature is never written across
 * its own dashes.
 */
export const targetLabelAnchor = (box: PlotBox, y: number): Point => ({
  x: plotEdges(box).right,
  y: y - LABEL_SIZE / 2,
});

/** How the writing inside the card is laid out. */
export interface CardLayout {
  /** Where each row's name starts. */
  labelX: number;
  /** Where each row's reading ends, so the readings line up down the card. */
  valueX: number;
  /** The baseline of the moment the card describes. */
  headingY: number;
  /** The baseline of each row under it. */
  rowsY: number[];
}

/** The room left inside the card, and how far apart its rows sit. */
const CARD_PADDING = 9;
const CARD_ROW = 14;

/** Where the moment and each reading are written inside the card. */
export const cardLayout = (origin: Point, card: CardSize, rowCount: number): CardLayout => {
  const headingY = origin.y + CARD_PADDING + LABEL_SIZE;
  return {
    labelX: origin.x + CARD_PADDING,
    valueX: origin.x + card.width - CARD_PADDING,
    headingY,
    rowsY: Array.from({ length: rowCount }, (_, row) => headingY + CARD_ROW * (row + 1)),
  };
};

/** A temperature as the chart writes it, in whole degrees. */
export const formatTemperature = (reading: number): string => `${Math.round(reading)}°`;

/** A moment as the chart writes it, on the reader's own clock. */
export const formatClock = (moment: Date | string | number): string =>
  new Date(moment).toLocaleTimeString();

/** Where on the screen the chart is currently drawn, as the browser measures it. */
export interface ChartBounds {
  left: number;
  width: number;
}

/**
 * The moment of the cook under a touch.
 *
 * The chart is drawn at whatever width its container gives it, so a touch has to
 * be brought back through that scaling before it means anything. A chart the
 * browser has not measured — under a test, or before the first layout — is read
 * as though it were drawn at its own size, which is the only assumption
 * available and keeps the sum finite.
 */
export const momentAt = (
  viewportX: number,
  bounds: ChartBounds,
  box: PlotBox,
  scales: ChartScales
): number => {
  const scale = bounds.width > 0 ? box.width / bounds.width : 1;
  return scales.x.invert((viewportX - bounds.left) * scale).getTime();
};

/** How big the card describing a moment is. */
export interface CardSize {
  width: number;
  height: number;
}

/** How far the card is held off the line it describes. */
const CARD_GAP = 10;

/**
 * Where the card describing a moment goes: beside the crosshair, and always
 * wholly on the chart, so a reading taken near either edge is still readable.
 */
export const cardPlacement = (anchorX: number, box: PlotBox, card: CardSize): Point => {
  const beside = anchorX + CARD_GAP;
  const room = Math.max(0, box.width - card.width);
  return {
    x: Math.min(Math.max(0, beside), room),
    y: Math.min(Math.max(0, box.margin.top), Math.max(0, box.height - card.height)),
  };
};
