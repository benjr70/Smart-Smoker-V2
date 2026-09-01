import React, { useMemo, useState } from 'react';
import { LABEL_SIZE, PlotBox, SeriesKey, formatTemperature, plotEdges } from './chartGeometry';
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
  elapsedAt,
  elapsedPoints,
  formatElapsed,
  hourTicks,
  isNearStamp,
  nearestPoint,
  nearestSample,
  railInset,
  railOffset,
  ranIn,
} from './compareGeometry';

/**
 * Something the pitmaster did to a cook, placed against that cook's own start.
 *
 * The label and the colour are the ones stored on the cook event when it was
 * logged, not ones re-derived here: a stamp read back weeks later should say
 * what it said on the day, even if the app has since renamed or recoloured that
 * kind of stamp.
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
  /**
   * What the cook is called, for the key under the plot. Optional: the chart
   * draws a nameless cook rather than refusing one, and how a cook with no name
   * of its own is spelled is the app's decision, not the chart's.
   */
  name?: string;
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
  /** Its cook log, drawn on that cook's own rail under the plot. */
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
  /** The card the chart is drawn on, which its dots are outlined against. */
  surface: string;
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
/** How tall the footer is held, so its three states do not resize the card. */
const FOOTER_HEIGHT = 38;

/** What the key says of a cook that never ran the position it is naming. */
const NOT_USED = 'not used';

/** What each cook is called on the rails and in the key: its slot, not its name. */
const SIDE_LABEL = { a: 'A', b: 'B' } as const;

/** What the footer says of a cook the scrub has run off the end of. */
const FINISHED = 'finished';
/** What the footer says where a cook took no reading to read out. */
const NO_READING = '—';
/** How the chart says it can be interrogated at all, since nothing else does. */
const SCRUB_HINT = 'Drag to scrub · tap a stamp for detail';

/** How faintly the scrub's guide is ruled: it follows a finger, it is not a fact. */
const GUIDE_OPACITY = 0.35;
/** How big the dot marking a scrubbed reading is. */
const DOT_RADIUS = 3.2;

/** How big a stamp's target is: a thumb's worth, since stamps are tapped. */
const STAMP_TARGET = 30;
/** How big the mark inside that target is at rest, and once the scrub is on it. */
const STAMP_DOT = 11;
const STAMP_DOT_NEAR = 15;
/** How tall a rail is: its stamps' targets, and nothing more. */
const RAIL_HEIGHT = 30;

/**
 * Whether a cook was already over at a scrubbed minute.
 *
 * A cook with no length on record is never called finished: nothing recorded
 * when it ended, so the plot has no ground to say it had.
 */
const isFinished = (run: CompareRun, minutes: number): boolean =>
  Number.isFinite(run.mins) && run.mins > 0 && minutes > run.mins;

/**
 * What one cook read at a scrubbed minute, as the footer writes it: a
 * temperature per drawn position, or the fact that this cook was already out of
 * the smoker by then.
 */
const readoutOf = (run: CompareRun, positions: readonly SeriesKey[], minutes: number): string => {
  if (isFinished(run, minutes)) return FINISHED;
  const readings = positions
    .map(position => nearestSample(run.points, position, minutes))
    .filter((sample): sample is number => sample !== null)
    .map(formatTemperature);
  return readings.length === 0 ? NO_READING : readings.join(' / ');
};

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

/** One cook prepared for the plot, as everything under the chart reads it. */
interface PreparedCook {
  id: 'a' | 'b';
  series: CompareCookSeries;
  run: CompareRun;
}

/** Which cook's stamp the reader is asking about. */
interface PickedStamp {
  cook: 'a' | 'b';
  id: string;
}

/**
 * One cook's cook log, on a rail of its own under the plot.
 *
 * The rail is laid out in HTML rather than drawn in the SVG because a stamp is
 * a thumb target with a name behind it, and those are cheaper to make right as
 * elements than as shapes. What keeps it honest is that its track is inset by
 * exactly the plot's own padding: a stamp at hour zero sits over hour zero on
 * the plot above it.
 */
function StampRail({
  cook,
  box,
  span,
  cursor,
  picked,
  surface,
  onPick,
}: {
  cook: PreparedCook;
  box: PlotBox;
  span: number;
  cursor: number | null;
  picked: PickedStamp | null;
  surface: string;
  onPick: (picked: PickedStamp | null) => void;
}): JSX.Element {
  return (
    <div data-stamp-rail={cook.id} style={{ position: 'relative', height: RAIL_HEIGHT }}>
      {/* The letter sits in the axis' left gutter — the room the temperature
          labels are written in — so naming the rail cannot shift the track it
          labels off the plot's scale. */}
      <span
        style={{
          position: 'absolute',
          left: 0,
          top: 9,
          width: 14,
          textAlign: 'center',
          fontSize: 11,
          fontWeight: 800,
          color: cook.series.color,
        }}
      >
        {SIDE_LABEL[cook.id]}
      </span>
      <div
        data-rail-track=""
        style={{ position: 'absolute', top: 0, height: RAIL_HEIGHT, ...railInset(box) }}
      >
        {/* How far this cook got along the shared axis: the rail's own version
            of the end marker ruled on the plot. */}
        <div
          data-rail-baseline=""
          style={{
            position: 'absolute',
            left: 0,
            top: 14,
            height: 1.5,
            borderRadius: 1,
            opacity: 0.3,
            background: cook.series.color,
            width: railOffset(cook.run.mins, span),
          }}
        />
        {cook.series.stamps.map(stamp => {
          const isPicked = picked?.cook === cook.id && picked.id === stamp.id;
          const swollen = isPicked || isNearStamp(stamp.minutes, cursor, cook.run.mins);
          return (
            <button
              key={stamp.id}
              type="button"
              aria-label={stamp.label}
              aria-pressed={isPicked}
              onClick={() => onPick(isPicked ? null : { cook: cook.id, id: stamp.id })}
              style={{
                position: 'absolute',
                top: 0,
                left: railOffset(stamp.minutes, span),
                transform: 'translateX(-50%)',
                width: STAMP_TARGET,
                height: STAMP_TARGET,
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* The target is a thumb's worth; the mark inside it is what is
                  actually read, and it swells as the scrub comes near so that a
                  stamp can be found without hunting for it. */}
              <span
                style={{
                  width: swollen ? STAMP_DOT_NEAR : STAMP_DOT,
                  height: swollen ? STAMP_DOT_NEAR : STAMP_DOT,
                  borderRadius: '50%',
                  background: stamp.color,
                  border: `2px solid ${surface}`,
                  boxShadow: isPicked ? `0 0 0 2px ${stamp.color}` : 'none',
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The stamp the reader picked: what it was, whose it was, and when. */
function StampDetail({
  stamp,
  cook,
  colors,
  onClear,
}: {
  stamp: CompareStamp;
  cook: 'a' | 'b';
  colors: ComparePalette;
  onClear: () => void;
}): JSX.Element {
  return (
    <>
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: '50%',
          flexShrink: 0,
          background: stamp.color,
        }}
      />
      <span style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>{stamp.label}</span>
      <span style={{ fontSize: 12, color: colors.label, fontVariantNumeric: 'tabular-nums' }}>
        {`Cook ${SIDE_LABEL[cook]} · ${formatElapsed(stamp.minutes)} in`}
      </span>
      <button
        type="button"
        aria-label="Clear stamp"
        onClick={onClear}
        style={{
          marginLeft: 'auto',
          width: FOOTER_HEIGHT,
          height: FOOTER_HEIGHT,
          flexShrink: 0,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: 17,
          color: colors.label,
        }}
      >
        ×
      </button>
    </>
  );
}

/** What both cooks were doing at the minute being scrubbed. */
function ScrubReadout({
  cooks,
  positions,
  cursor,
  colors,
}: {
  cooks: readonly PreparedCook[];
  positions: readonly SeriesKey[];
  cursor: number;
  colors: ComparePalette;
}): JSX.Element {
  return (
    <>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: colors.label,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {`${formatElapsed(cursor)} in`}
      </span>
      {cooks.map(cook => (
        <span
          key={cook.id}
          data-readout={cook.id}
          style={{ fontSize: 12, color: colors.label, fontVariantNumeric: 'tabular-nums' }}
        >
          <span style={{ color: cook.series.color, fontWeight: 800 }}>{SIDE_LABEL[cook.id]}</span>{' '}
          <span>{readoutOf(cook.run, positions, cursor)}</span>
        </span>
      ))}
    </>
  );
}

/** Which cook is which, and how the chart is read at all. */
function CookKey({
  cooks,
  colors,
}: {
  cooks: readonly PreparedCook[];
  colors: ComparePalette;
}): JSX.Element {
  return (
    <>
      {cooks.map(cook => (
        <span
          key={cook.id}
          data-legend={cook.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: colors.label,
          }}
        >
          <span
            style={{
              width: 14,
              height: 2.5,
              borderRadius: 2,
              flexShrink: 0,
              background: cook.series.color,
            }}
          />
          <span style={{ fontWeight: 700, color: colors.text }}>{SIDE_LABEL[cook.id]}</span>
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 104,
            }}
          >
            {cook.series.name ?? ''}
          </span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatElapsed(cook.run.mins)}</span>
        </span>
      ))}
      <span style={{ fontSize: 11, color: colors.label, opacity: 0.75 }}>{SCRUB_HINT}</span>
    </>
  );
}

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

  const cooks: PreparedCook[] = useMemo(
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

  /**
   * The minute the reader is asking about, or nothing while they are not
   * asking. It is a minute rather than a place on the plot so that everything
   * reading it — the guide, the dots and the footer — is answering the same
   * question of the cooks rather than each re-deriving one from pixels.
   */
  const [cursor, setCursor] = useState<number | null>(null);

  /**
   * The stamp the reader has tapped, held as which cook's and which of its
   * stamps rather than as the stamp itself: the cooks can be swapped or
   * re-picked under it, and a held stamp that outlived the cook it belongs to
   * would draw a guide onto a comparison it has nothing to do with.
   */
  const [picked, setPicked] = useState<PickedStamp | null>(null);

  /**
   * The stamp being asked about, looked up rather than held.
   *
   * Holding the stamp itself would keep a stamp belonging to a cook that has
   * since been swapped out; looking it up means a pick that no longer matches
   * either cook's log simply stops being one.
   */
  const pickedStamp = useMemo(() => {
    if (picked === null) return null;
    const cook = cooks.find(one => one.id === picked.cook);
    const stamp = cook?.series.stamps.find(one => one.id === picked.id);
    return cook && stamp ? { cook: cook.id, stamp } : null;
  }, [cooks, picked]);

  const runs = cooks.map(cook => cook.run);
  const span = compareSpanMinutes(runs);
  // The temperature axis is measured over every position on offer, not over
  // the ones currently drawn: pressing a chip should add or remove a line, not
  // move the axis and every other line with it.
  const scales = compareScales(runs, available, box);

  /**
   * Where a pointer or a finger is, as a minute of the cooks.
   *
   * Mouse and touch are read through the same measurement because they are the
   * same question asked with different hardware: a phone is scrubbed with a
   * thumb and a desk with a pointer, and both want the guide under whatever is
   * moving. An event that arrived without a position — which a touch that has
   * just ended is — leaves the scrub where it was for its own handler to clear.
   */
  const scrub = (
    event: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>
  ): void => {
    const touch = 'touches' in event ? event.touches[0] : null;
    const at = touch ? touch.clientX : (event as React.MouseEvent<SVGSVGElement>).clientX;
    if (at === undefined || at === null) return;
    setCursor(elapsedAt(at, event.currentTarget.getBoundingClientRect(), box, scales));
  };

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
      <svg
        data-testid="compare-plot"
        viewBox={`0 0 ${box.width} ${box.height}`}
        // The plot is scrubbed by dragging across it, so the browser must not
        // take the drag for a scroll: the page sliding away under the finger
        // would carry the plot with it and the reader would scrub nothing.
        style={{ width: '100%', display: 'block', touchAction: 'none' }}
        onMouseMove={scrub}
        onMouseLeave={() => setCursor(null)}
        onTouchStart={scrub}
        onTouchMove={scrub}
        onTouchEnd={() => setCursor(null)}
      >
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
        {/* The stamp the reader picked, ruled down onto the traces: the rail
            says when it happened, and this says what the cooks were doing at
            that moment. */}
        {pickedStamp !== null && (
          <line
            data-stamp-guide=""
            x1={scales.x(pickedStamp.stamp.minutes)}
            y1={edges.top}
            x2={scales.x(pickedStamp.stamp.minutes)}
            y2={edges.bottom}
            stroke={pickedStamp.stamp.color}
            strokeWidth={1.5}
            strokeDasharray={END_DASH}
          />
        )}
        {/* The scrub, over the traces it is reading: a guide down the plot and
            a dot on each line a cook was still running at that minute. A cook
            that had already finished carries no dot, which is how the plot says
            so without writing anything. */}
        {cursor !== null && (
          <g>
            <line
              data-scrub-guide=""
              x1={scales.x(cursor)}
              y1={edges.top}
              x2={scales.x(cursor)}
              y2={edges.bottom}
              stroke={colors.text}
              strokeWidth={1}
              opacity={GUIDE_OPACITY}
            />
            {cooks
              .filter(cook => !isFinished(cook.run, cursor))
              .map(cook =>
                positions.map(position => {
                  const place = nearestPoint(cook.run.points, position, cursor, scales);
                  if (place === null) return null;
                  return (
                    <circle
                      key={`${cook.id}-${position}`}
                      data-scrub-dot={`${cook.id}-${position}`}
                      cx={place.x}
                      cy={place.y}
                      r={DOT_RADIUS}
                      fill={cook.series.color}
                      stroke={colors.surface}
                      strokeWidth={1.5}
                    />
                  );
                })
              )}
          </g>
        )}
      </svg>
      {/* One rail per cook, under the plot rather than on it: eight lines and
          two cooks' worth of stamps crammed into the plot collide into noise,
          and a stamp has to be a thumb target with a name behind it. */}
      <div style={{ padding: '6px 0 2px' }}>
        {cooks.map(cook => (
          <StampRail
            key={cook.id}
            cook={cook}
            box={box}
            span={span}
            cursor={cursor}
            picked={picked}
            surface={colors.surface}
            onPick={setPicked}
          />
        ))}
      </div>
      {/* The footer answers one question at a time, in the order the reader
          asked them: a stamp they picked, else the minute they are scrubbing,
          else which cook is which. Stacking all three would put the answer
          they are looking for somewhere in a paragraph. */}
      <div
        data-testid="compare-footer"
        style={{
          padding: '6px 4px 0',
          borderTop: `1px solid ${colors.grid}`,
          marginTop: 6,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '4px 12px',
          minHeight: FOOTER_HEIGHT,
        }}
      >
        {pickedStamp !== null && (
          <StampDetail
            stamp={pickedStamp.stamp}
            cook={pickedStamp.cook}
            colors={colors}
            onClear={() => setPicked(null)}
          />
        )}
        {pickedStamp === null && cursor !== null && (
          <ScrubReadout cooks={cooks} positions={positions} cursor={cursor} colors={colors} />
        )}
        {pickedStamp === null && cursor === null && <CookKey cooks={cooks} colors={colors} />}
      </div>
    </div>
  );
}

export default CompareChart;
