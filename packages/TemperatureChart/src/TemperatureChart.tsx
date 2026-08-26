import React, { useMemo, useState } from 'react';
import {
  CARD_ROW,
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
import { ChartEvent, EventMarker, nearestEvent, placeMarkers, sampleWidth } from './eventMarkers';

export type { ChartEvent, EventMarker } from './eventMarkers';

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
  /**
   * The one target the cook was actually run against, snapshotted when the
   * smoke finished. Drawn as its own line in the label colour rather than any
   * probe's, because it belongs to the cook, not to a probe's settings row.
   * The wire's zero — no snapshot on record — draws nothing.
   */
  target?: number;
  /** The shape to draw in; the phone's when omitted. */
  aspect?: ChartAspect;
  /**
   * Whether the chart writes its own legend under the plot; it does unless
   * told otherwise. A caller that names the lines itself — the history review
   * says "Not used" where this legend would say "Probe 2" — turns it off, so
   * the reader is not shown the same probe under two names.
   */
  legend?: boolean;
  /**
   * The cook log: what was done to this cook and when. Each one is drawn as a
   * dashed line down the plot at its moment with a lettered bubble on top, and
   * naming the stamp is what the card under a finger resting on one adds. A
   * chart given none draws the cook alone, which is every caller that has not
   * been told about the log.
   */
  events?: readonly ChartEvent[];
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
/** No cook log, as one value, for the same reason. */
const NO_EVENTS: readonly ChartEvent[] = [];
/** How big a marker's bubble is drawn. */
const MARKER_RADIUS = 6;
/** How far the second row of bubbles sits under the first. */
const MARKER_ROW_STEP = 14;
/** The dash a marker's line is ruled with, so it reads as an annotation. */
const MARKER_DASH = '4 3';
/** How big the letter inside a bubble is. */
const MARKER_LETTER_SIZE = 8;
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
  target,
  aspect = 'mobile',
  legend = true,
  events = NO_EVENTS,
}: TemperatureChartProps): JSX.Element {
  const box = plotBoxOf(aspect);

  /** The snapshot, if one was actually recorded; the wire's zero is none. */
  const snapshot = target !== undefined && isReported(target) ? target : undefined;

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
    const scales = createScales(cook, box, drawn, snapshot);
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
      markers: placeMarkers(events, moment => scales.x(moment), {
        from: scales.x.domain()[0].getTime(),
        to: scales.x.domain()[1].getTime(),
      }),
      snapshotLine:
        snapshot === undefined
          ? undefined
          : {
              temperature: snapshot,
              y: scales.y(snapshot),
              label: targetLabelAnchor(box, scales.y(snapshot)),
            },
    };
  }, [cook, box, probe1Target, probe2Target, probe3Target, snapshot, events]);

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
  /**
   * The mark the finger is resting on, if it is resting on one. Near enough
   * means within one reading of the cook, so a finger on a twelve-hour brisket
   * has to be as close to a mark as its readings are to each other.
   */
  const stamp: EventMarker | undefined =
    touchedX === undefined
      ? undefined
      : nearestEvent(
          drawing.markers,
          touchedX,
          sampleWidth(cook.length, { left: plot.left, right: plot.right })
        );
  /** The card grows by a row when it has a stamp to name as well as readings. */
  const cardSize = { width: CARD.width, height: CARD.height + (stamp ? CARD_ROW : 0) };
  const card = touchedX === undefined ? undefined : cardPlacement(touchedX, box, cardSize);
  const writing = card
    ? cardLayout(card, cardSize, SERIES_KEYS.length + (stamp ? 1 : 0))
    : undefined;

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
        {drawing.snapshotLine && (
          <g>
            <line
              data-target="snapshot"
              x1={plot.left}
              x2={plot.right}
              y1={drawing.snapshotLine.y}
              y2={drawing.snapshotLine.y}
              stroke={colors.label}
              strokeDasharray={TARGET_DASH}
            />
            <text
              data-target-label="snapshot"
              x={drawing.snapshotLine.label.x}
              y={drawing.snapshotLine.label.y}
              fill={colors.label}
              fontSize={LABEL_SIZE}
              textAnchor="end"
            >
              {`TARGET ${formatTemperature(drawing.snapshotLine.temperature)}`}
            </text>
          </g>
        )}
        {drawing.markers.map(marker => (
          <line
            key={`line-${marker.id}`}
            data-event-line={marker.id}
            x1={marker.x}
            x2={marker.x}
            y1={plot.top}
            y2={plot.bottom}
            stroke={marker.color}
            strokeDasharray={MARKER_DASH}
          />
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
        {drawing.markers.map(marker => {
          const y = plot.top + MARKER_RADIUS + marker.row * MARKER_ROW_STEP;
          return (
            <g key={`marker-${marker.id}`}>
              <circle
                data-event-marker={marker.id}
                cx={marker.x}
                cy={y}
                r={MARKER_RADIUS}
                fill={marker.color}
              />
              {/* The letter rides on the bubble in the panel's own colour, so
                  it stays legible whichever tone the stamp was given. */}
              <text
                data-event-letter={marker.id}
                x={marker.x}
                y={y}
                fill={colors.panel}
                fontSize={MARKER_LETTER_SIZE}
                fontWeight={700}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {marker.letter}
              </text>
            </g>
          );
        })}
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
              width={cardSize.width}
              height={cardSize.height}
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
            {stamp ? (
              <text
                data-hover-stamp={stamp.id}
                x={writing.labelX}
                y={writing.rowsY[SERIES_KEYS.length]}
                fontSize={LABEL_SIZE}
                fill={stamp.color}
              >
                {stamp.label}
              </text>
            ) : null}
          </g>
        ) : null}
      </svg>
      {legend && (
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
      )}
    </div>
  );
}

export default TemperatureChart;
