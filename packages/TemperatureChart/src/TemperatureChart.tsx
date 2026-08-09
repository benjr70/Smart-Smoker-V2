import React, { useMemo, useState } from 'react';
import {
  ChartAspect,
  ChartSample,
  ProbeTargets,
  SERIES_KEYS,
  SeriesKey,
  LABEL_SIZE,
  axisLabelAnchors,
  cardLayout,
  cardPlacement,
  createScales,
  formatClock,
  formatTemperature,
  inTimeOrder,
  isReported,
  latestPointOf,
  momentAt,
  nearestIndex,
  plotBoxOf,
  plotEdges,
  pointOf,
  readingOf,
  reportedTargets,
  seriesPath,
  targetLabelAnchor,
  tempTicks,
  timeOf,
  timeTicks,
} from './chartGeometry';

/** What each line is called, as the reader named it when the smoke started. */
export type ChartSeriesNames = Record<SeriesKey, string>;

/**
 * Every colour the chart paints with, which is the shape of the theme package's
 * chart tokens: the caller hands over the tokens of whichever colour scheme is
 * in effect, and the chart follows it without knowing that schemes exist.
 */
export interface ChartPalette {
  panel: string;
  grid: string;
  label: string;
  chamber: string;
  probe1: string;
  probe2: string;
  probe3: string;
}

export interface TemperatureChartProps {
  /**
   * The cook to draw, already thinned by the caller. It is put in time order
   * here, so a series read back from a store that answers newest-first is drawn
   * the same way round as one that arrived as it was cooked.
   */
  data: ChartSample[];
  names: ChartSeriesNames;
  colors: ChartPalette;
  /** The configured target per meat probe; none are drawn when omitted. */
  targets?: ProbeTargets;
  /** The shape to draw in; the phone's when omitted. */
  aspect?: ChartAspect;
}

/** How heavily the lines are drawn, which is what makes them readable outdoors. */
const SERIES_WIDTH = 2.5;
/** The dash the gridlines are ruled with, so they stay behind the data. */
const GRID_DASH = '3 4';
/** The dot marking where each line has got to. */
const LATEST_DOT = 3.5;
/** The dash a target is ruled with, which is what tells it from a reading. */
const TARGET_DASH = '6 4';
/** The probes a target can be set for, in the order their lines are drawn. */
const TARGETABLE: Exclude<SeriesKey, 'chamber'>[] = ['probe1', 'probe2', 'probe3'];
/** No targets, as one value, so that omitting them does not redraw the cook. */
const NO_TARGETS: ProbeTargets = {};
/** The dot marking each line at the moment under the finger. */
const HOVER_DOT = 3;
/** The card that says what the readings were at that moment. */
const CARD = { width: 128, height: 82 };
/** What a probe that was not reporting reads as in the card. */
const NOT_REPORTING = '—';

/**
 * The temperature chart.
 *
 * It is wholly controlled: it is handed a cook and draws it, and holds nothing
 * of its own but where the reader is currently touching. Everything it knows
 * about position comes from `chartGeometry`, and everything it draws is a React
 * element — which is what keeps the drawing under test, and what keeps a long
 * cook from growing the DOM the way the imperative chart before it did.
 */
function TemperatureChart({
  data,
  names,
  colors,
  targets = NO_TARGETS,
  aspect = 'mobile',
}: TemperatureChartProps): JSX.Element {
  const box = plotBoxOf(aspect);

  /**
   * The targets are taken apart before the drawing is derived, so that a caller
   * writing them inline — which is how settings arrive — does not hand the chart
   * a new object, and so a whole new drawing, on every render it happens to do.
   */
  const { probe1: probe1Target, probe2: probe2Target, probe3: probe3Target } = targets;

  /**
   * The cook, in the order it was cooked.
   *
   * A caller can hand over a series in any order — a stored cook comes back from
   * the API newest-first — and everything below reads one as a sequence: the dot
   * marking where the cook has got to is looked for from the end, and the
   * tooltip searches by halving. Ordering it here, once, is the whole of what
   * the chart has to know about the order it was given. A cook already in order
   * is the same array it was handed, so this costs a live series no redrawing.
   */
  const cook = useMemo(() => inTimeOrder(data), [data]);

  /**
   * The whole drawing is derived once per cook, so that a finger dragged across
   * the plot moves the crosshair without recomputing four paths on every event.
   */
  const drawing = useMemo(() => {
    const drawn = reportedTargets(cook, {
      probe1: probe1Target,
      probe2: probe2Target,
      probe3: probe3Target,
    });
    const scales = createScales(cook, box, drawn);
    return {
      scales,
      paths: SERIES_KEYS.map(series => ({ series, d: seriesPath(cook, series, scales) })),
      latest: SERIES_KEYS.map(series => ({ series, point: latestPointOf(cook, series, scales) })),
      temperatures: tempTicks(scales),
      moments: timeTicks(scales),
      targetLines: TARGETABLE.filter(series => drawn[series] !== undefined).map(series => {
        const temperature = drawn[series] as number;
        const y = scales.y(temperature);
        return { series, temperature, y, label: targetLabelAnchor(box, y) };
      }),
    };
  }, [cook, box, probe1Target, probe2Target, probe3Target]);

  const plot = plotEdges(box);
  const anchors = axisLabelAnchors(box);

  /**
   * The moment the reader is touching, which is the only thing the chart
   * remembers — and it remembers it as a moment of the cook rather than as a
   * place in the array, because a live cook is thinned again as it grows and
   * the same place in the array is then a different moment. The finger has not
   * moved, so the reading under it must not move either.
   */
  const [touchedMoment, setTouchedMoment] = useState<number | null>(null);
  const touchedIndex = touchedMoment === null ? -1 : nearestIndex(cook, touchedMoment);
  const touched = touchedIndex < 0 ? undefined : cook[touchedIndex];

  const follow = (event: React.PointerEvent<SVGSVGElement>): void => {
    setTouchedMoment(
      momentAt(event.clientX, event.currentTarget.getBoundingClientRect(), box, drawing.scales)
    );
  };

  const release = (): void => setTouchedMoment(null);

  /** Where along the plot the touched reading sits, which the card hangs off. */
  const touchedX = touched === undefined ? undefined : drawing.scales.x(timeOf(touched));
  const card = touchedX === undefined ? undefined : cardPlacement(touchedX, box, CARD);
  const writing = card ? cardLayout(card, CARD, SERIES_KEYS.length) : undefined;

  return (
    <div>
      <svg
        viewBox={`0 0 ${box.width} ${box.height}`}
        width="100%"
        role="img"
        aria-label="Temperature chart"
        style={{ touchAction: 'none' }}
        onPointerDown={follow}
        onPointerMove={follow}
        onPointerLeave={release}
        onPointerCancel={release}
      >
        <rect x={0} y={0} width={box.width} height={box.height} fill={colors.panel} />
        {drawing.temperatures.map(temperature => (
          <g key={temperature}>
            <line
              data-grid={temperature}
              x1={plot.left}
              x2={plot.right}
              y1={drawing.scales.y(temperature)}
              y2={drawing.scales.y(temperature)}
              stroke={colors.grid}
              strokeDasharray={GRID_DASH}
            />
            <text
              data-temp-label={temperature}
              x={anchors.tempX}
              y={drawing.scales.y(temperature)}
              fill={colors.label}
              fontSize={LABEL_SIZE}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {formatTemperature(temperature)}
            </text>
          </g>
        ))}
        {drawing.moments.map(moment => (
          <text
            key={moment.getTime()}
            data-time-label={moment.toISOString()}
            x={drawing.scales.x(moment)}
            y={anchors.timeY}
            fill={colors.label}
            fontSize={LABEL_SIZE}
            textAnchor="middle"
          >
            {formatClock(moment)}
          </text>
        ))}
        {drawing.targetLines.map(({ series, temperature, y, label }) => (
          <g key={series}>
            <line
              data-target={series}
              x1={plot.left}
              x2={plot.right}
              y1={y}
              y2={y}
              stroke={colors[series]}
              strokeDasharray={TARGET_DASH}
            />
            <text
              data-target-label={series}
              x={label.x}
              y={label.y}
              fill={colors[series]}
              fontSize={LABEL_SIZE}
              textAnchor="end"
            >
              {`TARGET ${formatTemperature(temperature)}`}
            </text>
          </g>
        ))}
        {drawing.paths.map(({ series, d }) => (
          <path
            key={series}
            data-series={series}
            d={d}
            fill="none"
            stroke={colors[series]}
            strokeWidth={SERIES_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {drawing.latest.map(({ series, point }) =>
          point ? (
            <circle
              key={series}
              data-latest={series}
              cx={point.x}
              cy={point.y}
              r={LATEST_DOT}
              fill={colors[series]}
            />
          ) : null
        )}
        {touched && card && writing ? (
          <g data-hover-card="">
            <line
              data-crosshair=""
              x1={touchedX}
              x2={touchedX}
              y1={plot.top}
              y2={plot.bottom}
              stroke={colors.label}
              strokeDasharray={GRID_DASH}
            />
            {SERIES_KEYS.map(series => {
              const point = pointOf(touched, series, drawing.scales);
              return point ? (
                <circle
                  key={series}
                  data-hover={series}
                  cx={point.x}
                  cy={point.y}
                  r={HOVER_DOT}
                  fill={colors[series]}
                />
              ) : null;
            })}
            <rect
              x={card.x}
              y={card.y}
              width={CARD.width}
              height={CARD.height}
              rx={6}
              fill={colors.panel}
              stroke={colors.grid}
            />
            <text x={writing.labelX} y={writing.headingY} fill={colors.label} fontSize={LABEL_SIZE}>
              {formatClock(touched.date)}
            </text>
            {SERIES_KEYS.map((series, row) => {
              const reading = readingOf(touched, series);
              return (
                <text
                  key={series}
                  y={writing.rowsY[row]}
                  fontSize={LABEL_SIZE}
                  fill={colors[series]}
                >
                  <tspan x={writing.labelX}>{names[series]}</tspan>
                  <tspan x={writing.valueX} textAnchor="end">
                    {isReported(reading) ? formatTemperature(reading) : NOT_REPORTING}
                  </tspan>
                </text>
              );
            })}
          </g>
        ) : null}
      </svg>
      <ul
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px 16px',
          listStyle: 'none',
          margin: 0,
          padding: '8px 0 0',
        }}
      >
        {SERIES_KEYS.map(series => (
          <li
            key={series}
            style={{
              alignItems: 'center',
              color: colors.label,
              display: 'flex',
              fontSize: 12,
              gap: 6,
            }}
          >
            <span
              data-legend-swatch={series}
              style={{
                backgroundColor: colors[series],
                borderRadius: 2,
                display: 'inline-block',
                height: 3,
                width: 14,
              }}
            />
            {names[series]}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TemperatureChart;
