import React, { useMemo } from 'react';
import { LABEL_SIZE, SeriesKey, formatTemperature, plotEdges } from './chartGeometry';
import {
  COMPARE_BOX,
  CompareReading,
  CompareRun,
  ElapsedReading,
  POSITION_DASH,
  POSITION_LABEL,
  POSITION_OPACITY,
  POSITION_WIDTH,
  availablePositions,
  comparePath,
  compareScales,
  compareSpanMinutes,
  elapsedPoints,
  hourTicks,
  ranIn,
} from './compareGeometry';

/**
 * Something the pitmaster did to a cook, placed against that cook's own start.
 *
 * Nothing here draws them yet: the rails they are drawn on, and the scrubbing
 * that reads them, are the next slice. They are taken now so that the shape a
 * caller assembles per cook is the shape it keeps.
 */
export interface CompareStamp {
  id: string;
  label: string;
  /** How long into the cook it was stamped, in minutes. */
  minutes: number;
  /**
   * The colour it is drawn in. A tone is a name the app resolves against the
   * scheme in effect — the same arrangement the single-cook chart's marks are
   * handed over under — so the chart is given a colour and draws it.
   */
  color: string;
}

/** One cook, as the comparison needs it. */
export interface CompareCookSeries {
  /** The colour that means this cook everywhere on the compare screen. */
  color: string;
  /** Its readings, thinned by the caller; any order, any of them incomplete. */
  pts: readonly CompareReading[];
  /** How long it ran, in minutes: where its end marker is ruled. */
  mins: number;
  /**
   * When the cook started — the moment `mins` and every stamp's `minutes` were
   * measured from, so that the traces are placed on that same zero.
   *
   * Optional, because a cook can come back with no start on record at all; the
   * chart then measures from the earliest reading it was handed.
   */
  startedAt?: Date | string | number | null;
  /** Its cook log. Accepted now, drawn by the next slice. */
  stamps: readonly CompareStamp[];
  /** What it called the probe in each position, from its own smoke profile. */
  probeNames?: Partial<Record<SeriesKey, string>>;
}

/**
 * The colours the comparison paints with, which are the theme's own: the two
 * cooks bring their colours with them, so what is left is the surface, the
 * rules and the writing.
 */
export interface ComparePalette {
  /** The tone the chips and the key sit on. */
  panel: string;
  /** The gridlines. */
  grid: string;
  /** The writing that labels rather than names. */
  label: string;
  /** The writing that names. */
  text: string;
}

export interface CompareChartProps {
  a: CompareCookSeries;
  b: CompareCookSeries;
  colors: ComparePalette;
  /**
   * The positions the reader has asked to see.
   *
   * Held by the caller rather than in here: which probes are on the plot
   * outlives the plot — a slot swap, a re-pick, or a comparison reopened from
   * somewhere else all have an answer to what should be shown, and only the
   * screen knows which. Positions neither cook ran are ignored rather than
   * refused, so a caller can hold a choice across a change of cooks.
   */
  positions: readonly SeriesKey[];
  /** Called with the positions after a chip is pressed. */
  onPositionsChange: (positions: readonly SeriesKey[]) => void;
}

/** The dash an end marker is ruled with, so it reads as an annotation. */
const END_DASH = '3,3';
/** How faintly an end marker is ruled: it is a fact, not a reading. */
const END_OPACITY = 0.45;
/** How far the hour labels sit under the plot. */
const HOUR_LABEL_DROP = 8;
/**
 * How tall a chip is: the thumb target the whole screen is drivable at, since
 * the chips are the only control on the chart.
 */
const CHIP_HEIGHT = 44;

/** What the key says of a cook that never ran the position it is naming. */
const NOT_USED = 'not used';

/**
 * What a cook called the probe in a position, or nothing when it did not run
 * one there.
 *
 * Whether the position was run is asked of the readings and not of the profile:
 * every smoke carries four probe names whether or not four probes were plugged
 * in, so a cook that only ever ran a chamber and one probe would otherwise be
 * shown as having cooked with probes it never had. A position that was run but
 * never named falls back to the position itself, which is at least true.
 */
const nameIn = (
  series: CompareCookSeries,
  points: readonly ElapsedReading[],
  position: SeriesKey
): string | null => {
  if (!ranIn(points, position)) return null;
  const named = series.probeNames?.[position]?.trim();
  return named ? named : POSITION_LABEL[position];
};

/**
 * A cook prepared for the plot: its readings placed against the same start its
 * length and its stamps were measured from.
 */
const runOf = (series: CompareCookSeries): CompareRun => ({
  points: elapsedPoints(series.pts, series.startedAt ?? null),
  mins: series.mins,
});

/**
 * Whether there is an end to rule for a cook.
 *
 * A cook with no derived timing and no datable readings comes back with no
 * length at all; ruling its marker at zero would have the plot claim it ended
 * the moment it was lit, which is a stronger statement than the archive can
 * make. It goes unmarked instead.
 */
const hasEnd = (run: CompareRun): boolean => Number.isFinite(run.mins) && run.mins > 0;

/**
 * Two cooks overlaid.
 *
 * The axis is hours elapsed rather than the clock, which is the whole reason
 * this is a chart of its own: two cooks lit a week apart are drawn from their
 * own starts, over the length of the longer of them, so the shorter one visibly
 * stops early. Colour means the cook and dash means the probe, because with up
 * to eight lines on one plot no single encoding can carry both.
 *
 * Like the single-cook chart, it is drawn out of `compareGeometry` and holds
 * nothing but what the reader has asked to see.
 */
function CompareChart({
  a,
  b,
  colors,
  positions: chosen,
  onPositionsChange,
}: CompareChartProps): JSX.Element {
  const box = COMPARE_BOX;
  const edges = plotEdges(box);

  const cooks = useMemo(
    () => [
      { id: 'a' as const, series: a, run: runOf(a) },
      { id: 'b' as const, series: b, run: runOf(b) },
    ],
    [a, b]
  );

  /**
   * The positions worth a chip: the ones at least one cook ran. A chip for a
   * probe neither cook was cooking with can only ever draw an empty plot.
   */
  const available = useMemo(() => availablePositions(cooks.map(cook => cook.run.points)), [cooks]);

  /**
   * What is actually drawn: what the caller asked for, kept to what is on
   * offer, so that a choice carried over from another pair of cooks cannot put
   * a position on the plot with nothing behind it.
   */
  const positions = available.filter(position => chosen.includes(position));

  const toggle = (position: SeriesKey): void =>
    onPositionsChange(
      chosen.includes(position) ? chosen.filter(other => other !== position) : [...chosen, position]
    );

  const runs = cooks.map(cook => cook.run);
  const span = compareSpanMinutes(runs);
  // The temperature axis is measured over every position on offer, not over
  // the ones currently drawn: pressing a chip should add or remove a line, not
  // move the axis and every other line with it.
  const scales = compareScales(runs, available, box);

  return (
    <div>
      {/* Chips first, then the plot: what is drawn is chosen above the drawing,
          the way the design has it, and a thumb reaching for a chip does not
          have to cross the plot to get there. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(1, available.length)}, 1fr)`,
          gap: 7,
          marginBottom: 12,
        }}
      >
        {available.map(position => {
          const on = positions.includes(position);
          return (
            <button
              key={position}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(position)}
              style={{
                minWidth: 0,
                height: CHIP_HEIGHT,
                padding: '0 6px',
                borderRadius: 10,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 12.5,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                background: on ? colors.panel : 'transparent',
                border: `1.5px solid ${on ? colors.text : colors.grid}`,
                color: on ? colors.text : colors.label,
              }}
            >
              {POSITION_LABEL[position]}
            </button>
          );
        })}
      </div>
      {/* Each cook named its probes for itself, and the position is the only
          thing that pairs them up. The key is where that pairing is stated:
          which of this cook's probes, and which of that one's, the reader is
          looking at on each dash. */}
      {positions.length > 0 && (
        <div
          style={{
            margin: '0 0 12px',
            padding: '9px 11px',
            borderRadius: 11,
            background: colors.panel,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {positions.map(position => (
            <div
              key={position}
              data-key-row={position}
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
            >
              <svg width="15" height="7" style={{ flexShrink: 0, overflow: 'visible' }}>
                <line
                  x1="0"
                  y1="3.5"
                  x2="15"
                  y2="3.5"
                  stroke={colors.label}
                  strokeWidth={POSITION_WIDTH[position]}
                  strokeDasharray={POSITION_DASH[position] || undefined}
                  strokeLinecap="round"
                />
              </svg>
              <span style={{ width: 60, flexShrink: 0, fontWeight: 700, color: colors.label }}>
                {POSITION_LABEL[position]}
              </span>
              {cooks.map(cook => {
                const named = nameIn(cook.series, cook.run.points, position);
                return (
                  <span
                    key={cook.id}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontWeight: 600,
                      textAlign: cook.id === 'a' ? 'left' : 'right',
                      color: named === null ? colors.label : cook.series.color,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {named ?? NOT_USED}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <svg viewBox={`0 0 ${box.width} ${box.height}`} style={{ width: '100%', display: 'block' }}>
        {scales.y.ticks(4).map(temperature => (
          <g key={temperature}>
            <line
              x1={edges.left}
              y1={scales.y(temperature)}
              x2={edges.right}
              y2={scales.y(temperature)}
              stroke={colors.grid}
              strokeWidth={1}
            />
            <text
              x={edges.left - 7}
              y={scales.y(temperature) + LABEL_SIZE / 3}
              textAnchor="end"
              fontSize={9}
              fill={colors.label}
            >
              {formatTemperature(temperature)}
            </text>
          </g>
        ))}
        {hourTicks(span).map(hour => (
          <text
            key={hour}
            x={scales.x(hour * 60)}
            y={box.height - HOUR_LABEL_DROP}
            textAnchor="middle"
            fontSize={9}
            fill={colors.label}
          >
            {`${hour}h`}
          </text>
        ))}
        {cooks
          .filter(cook => hasEnd(cook.run))
          .map(cook => (
            <line
              key={cook.id}
              data-cook-end={cook.id}
              x1={scales.x(cook.run.mins)}
              y1={edges.top}
              x2={scales.x(cook.run.mins)}
              y2={edges.bottom}
              stroke={cook.series.color}
              strokeWidth={1}
              strokeDasharray={END_DASH}
              opacity={END_OPACITY}
            />
          ))}
        {cooks.map(cook =>
          positions
            .filter(position => ranIn(cook.run.points, position))
            .map(position => (
              <path
                key={`${cook.id}-${position}`}
                data-cook={cook.id}
                data-position={position}
                d={comparePath(cook.run.points, position, scales)}
                fill="none"
                stroke={cook.series.color}
                strokeWidth={POSITION_WIDTH[position]}
                // A solid line is drawn by carrying no dash at all rather than
                // by carrying an empty one, so the markup says what it means.
                strokeDasharray={POSITION_DASH[position] || undefined}
                strokeLinecap="round"
                opacity={POSITION_OPACITY[position]}
              />
            ))
        )}
      </svg>
    </div>
  );
}

export default CompareChart;
