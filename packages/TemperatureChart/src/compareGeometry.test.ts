import {
  CompareReading,
  CompareRun,
  COMPARE_BOX,
  EMPTY_Y_DOMAIN,
  MIN_SPAN_MINUTES,
  availablePositions,
  clampToSpan,
  comparePath,
  compareScales,
  compareSpanMinutes,
  compareYDomain,
  elapsedAt,
  elapsedPoints,
  formatElapsed,
  hourTicks,
  nearestPoint,
  nearestSample,
  isNearStamp,
  railInset,
  railOffset,
  ranIn,
} from './compareGeometry';
import { plotEdges } from './chartGeometry';

/** A reading with nothing on any probe, so a test only says what it cares about. */
const reading = (over: Partial<CompareReading>): CompareReading => ({
  date: null,
  chamber: null,
  probe1: null,
  probe2: null,
  probe3: null,
  ...over,
});

const START = new Date('2026-08-31T10:00:00.000Z');
const at = (minutes: number): Date => new Date(START.getTime() + minutes * 60_000);

describe('elapsedPoints', () => {
  it('measures every reading from the first one, in minutes', () => {
    const points = elapsedPoints([
      reading({ date: START, chamber: 225 }),
      reading({ date: at(30), chamber: 240 }),
      reading({ date: at(90), chamber: 250 }),
    ]);

    expect(points.map(point => point.minutes)).toEqual([0, 30, 90]);
    expect(points.map(point => point.chamber)).toEqual([225, 240, 250]);
  });

  it('measures a cook that came back newest-first from its earliest reading', () => {
    const points = elapsedPoints([
      reading({ date: at(60), chamber: 250 }),
      reading({ date: START, chamber: 225 }),
    ]);

    expect(points.map(point => point.minutes)).toEqual([0, 60]);
    expect(points.map(point => point.chamber)).toEqual([225, 250]);
  });

  it('drops readings that cannot be placed in time', () => {
    const points = elapsedPoints([
      reading({ date: START, chamber: 225 }),
      reading({ date: null, chamber: 900 }),
      reading({ date: 'not a date', chamber: 900 }),
      reading({ date: at(15).toISOString(), chamber: 230 }),
    ]);

    expect(points.map(point => point.minutes)).toEqual([0, 15]);
  });

  it('has nothing to place for a cook with no readable readings', () => {
    expect(elapsedPoints([])).toEqual([]);
    expect(elapsedPoints([reading({ chamber: 225 })])).toEqual([]);
  });

  /**
   * The caller measures the cook's length and every stamp from the start it
   * derived; readings that begin after that start — clipped, or decimated away
   * — must not quietly move the traces' zero away from it.
   */
  it('measures from the start it is given rather than from the first reading', () => {
    const points = elapsedPoints(
      [reading({ date: at(30), chamber: 240 }), reading({ date: at(90), chamber: 250 })],
      START
    );

    expect(points.map(point => point.minutes)).toEqual([30, 90]);
  });

  it('falls back to the earliest reading when the start given cannot be read', () => {
    const readings = [reading({ date: at(30), chamber: 240 }), reading({ date: at(90) })];

    expect(elapsedPoints(readings, null).map(point => point.minutes)).toEqual([0, 60]);
    expect(elapsedPoints(readings, 'not a date').map(point => point.minutes)).toEqual([0, 60]);
  });
});

describe('ranIn', () => {
  it('counts a position as run when any one of its samples is a reading', () => {
    const points = elapsedPoints([
      reading({ date: START, probe2: null }),
      reading({ date: at(20), probe2: 140 }),
    ]);

    expect(ranIn(points, 'probe2')).toBe(true);
  });

  it('counts a position nothing was ever plugged into as not run', () => {
    const points = elapsedPoints([
      reading({ date: START, chamber: 225 }),
      reading({ date: at(20), chamber: 240 }),
    ]);

    expect(ranIn(points, 'probe3')).toBe(false);
  });
});

describe('availablePositions', () => {
  it('offers a position either cook ran, in the order they are drawn', () => {
    const a = elapsedPoints([reading({ date: START, chamber: 225, probe1: 90 })]);
    const b = elapsedPoints([reading({ date: START, probe1: 95, probe3: 80 })]);

    expect(availablePositions([a, b])).toEqual(['chamber', 'probe1', 'probe3']);
  });

  it('offers nothing for a pair of cooks with no readings at all', () => {
    expect(availablePositions([[], []])).toEqual([]);
  });
});

describe('compareSpanMinutes', () => {
  it('spans the longer of the two cooks', () => {
    const short = { points: elapsedPoints([reading({ date: START, chamber: 225 })]), mins: 120 };
    const long = { points: elapsedPoints([reading({ date: START, chamber: 225 })]), mins: 500 };

    expect(compareSpanMinutes([short, long])).toBe(500);
  });

  it('spans past a cook still reporting after the duration it was recorded with', () => {
    const run = {
      points: elapsedPoints([reading({ date: START }), reading({ date: at(400), chamber: 240 })]),
      mins: 120,
    };

    expect(compareSpanMinutes([run])).toBe(400);
  });

  it('gives a cook with no length at all an axis to be drawn against', () => {
    expect(compareSpanMinutes([{ points: [], mins: 0 }])).toBe(MIN_SPAN_MINUTES);
  });
});

describe('compareYDomain', () => {
  const run = (over: Partial<CompareReading>[], mins = 60): CompareRun => ({
    points: elapsedPoints(over.map((one, index) => reading({ date: at(index * 10), ...one }))),
    mins,
  });

  it('reaches past the readings it draws, rounded outward to round labels', () => {
    const domain = compareYDomain([run([{ probe1: 92 }, { probe1: 203 }])], ['probe1']);

    expect(domain).toEqual([75, 225]);
  });

  it('ignores positions that are not being drawn', () => {
    const cook = run([
      { chamber: 500, probe1: 92 },
      { chamber: 480, probe1: 203 },
    ]);

    expect(compareYDomain([cook], ['probe1'])).toEqual([75, 225]);
  });

  it('takes in both cooks, so one axis serves the pair', () => {
    const cool = run([{ probe1: 92 }, { probe1: 150 }]);
    const hot = run([{ probe1: 120 }, { probe1: 203 }]);

    expect(compareYDomain([cool, hot], ['probe1'])).toEqual([75, 225]);
  });

  it('falls back to a plain axis when nothing is being drawn', () => {
    expect(compareYDomain([run([{ probe1: 92 }])], [])).toEqual(EMPTY_Y_DOMAIN);
  });
});

describe('compareScales', () => {
  const box = COMPARE_BOX;
  const cook: CompareRun = {
    points: elapsedPoints([
      reading({ date: START, probe1: 92 }),
      reading({ date: at(120), probe1: 203 }),
    ]),
    mins: 120,
  };

  it('runs the elapsed axis from the start of the cooks to the end of the longer one', () => {
    const scales = compareScales([cook], ['probe1'], box);
    const edges = plotEdges(box);

    expect(scales.x(0)).toBeCloseTo(edges.left);
    expect(scales.x(120)).toBeCloseTo(edges.right);
    expect(scales.x(60)).toBeCloseTo((edges.left + edges.right) / 2);
  });

  it('runs the temperature axis up the plot, its domain the pair’s', () => {
    const scales = compareScales([cook], ['probe1'], box);
    const edges = plotEdges(box);

    expect(scales.y.domain()).toEqual([75, 225]);
    expect(scales.y(75)).toBeCloseTo(edges.bottom);
    expect(scales.y(225)).toBeCloseTo(edges.top);
  });
});

describe('comparePath', () => {
  const scales = compareScales(
    [
      {
        points: elapsedPoints([
          reading({ date: START, probe1: 100 }),
          reading({ date: at(60), probe1: 150 }),
        ]),
        mins: 60,
      },
    ],
    ['probe1'],
    COMPARE_BOX
  );

  it('draws a line through the samples a position reported', () => {
    const points = elapsedPoints([
      reading({ date: START, probe1: 100 }),
      reading({ date: at(30), probe1: 140 }),
    ]);

    expect(comparePath(points, 'probe1', scales)).toMatch(/^M[\d.]+,[\d.]+L[\d.]+,[\d.]+$/);
  });

  it('breaks the line where a probe stopped reporting rather than dropping it to the floor', () => {
    const points = elapsedPoints([
      reading({ date: START, probe1: 100 }),
      reading({ date: at(10), probe1: null }),
      reading({ date: at(20), probe1: 140 }),
      reading({ date: at(30), probe1: 150 }),
    ]);

    expect(comparePath(points, 'probe1', scales)).toContain('M');
    expect(comparePath(points, 'probe1', scales).match(/M/g)).toHaveLength(2);
  });

  it('draws nothing for a position the cook never ran', () => {
    expect(comparePath(elapsedPoints([reading({ date: START })]), 'probe3', scales)).toBe('');
  });
});

describe('hourTicks', () => {
  it('writes an hour under the plot for every hour of a short cook', () => {
    expect(hourTicks(180)).toEqual([0, 1, 2, 3]);
  });

  it('thins the hours out so a long cook is not labelled hour by hour', () => {
    expect(hourTicks(12 * 60)).toEqual([0, 3, 6, 9, 12]);
  });
});

describe('formatElapsed', () => {
  it('writes how far into a cook a moment is, in hours and whole minutes', () => {
    expect(formatElapsed(0)).toBe('0h 00m');
    expect(formatElapsed(65)).toBe('1h 05m');
    expect(formatElapsed(245.4)).toBe('4h 05m');
  });

  it('never writes a negative elapsed time, which no cook has', () => {
    expect(formatElapsed(-10)).toBe('0h 00m');
  });
});

describe('nearestSample', () => {
  const points = elapsedPoints([
    reading({ date: START, chamber: 200, probe1: 80 }),
    reading({ date: at(60), chamber: 250, probe1: null }),
    reading({ date: at(120), chamber: 240, probe1: 190 }),
  ]);

  it('reads the sample nearest the scrubbed minute', () => {
    expect(nearestSample(points, 'chamber', 55)).toBe(250);
    expect(nearestSample(points, 'chamber', 10)).toBe(200);
  });

  it('skips the readings a position never reported, rather than reading nothing', () => {
    expect(nearestSample(points, 'probe1', 55)).toBe(80);
    expect(nearestSample(points, 'probe1', 70)).toBe(190);
  });

  it('reads nothing at all for a position the cook never ran', () => {
    expect(nearestSample(points, 'probe3', 30)).toBeNull();
  });

  it('reads nothing from a cook with no readings', () => {
    expect(nearestSample([], 'chamber', 30)).toBeNull();
  });

  /**
   * A probe unplugged early stopped saying anything; quoting its last reading
   * hours later would have the footer claim it is still live, while the trace
   * beside it correctly breaks.
   */
  it('reads nothing from a probe that stopped reporting hours before the scrub', () => {
    const dense = elapsedPoints(
      Array.from({ length: 200 }, (_, index) =>
        reading({
          date: at(index * 3),
          chamber: 225,
          probe3: index * 3 <= 30 ? 100 : null,
        })
      )
    );

    expect(nearestSample(dense, 'probe3', 30)).toBe(100);
    expect(nearestSample(dense, 'probe3', 480)).toBeNull();
    // The chamber was reporting the whole way, so it still reads.
    expect(nearestSample(dense, 'chamber', 480)).toBe(225);
  });

  it('reads a sparsely logged cook the way it was logged, not by the clock', () => {
    const thinned = elapsedPoints([
      reading({ date: START, chamber: 200 }),
      reading({ date: at(60), chamber: 250 }),
      reading({ date: at(120), chamber: 240 }),
    ]);

    expect(nearestSample(thinned, 'chamber', 95)).toBe(240);
  });
});

describe('nearestPoint', () => {
  const points = elapsedPoints([
    reading({ date: START, probe1: 80 }),
    reading({ date: at(120), probe1: 190 }),
  ]);

  it('gives back where the nearest reported sample sits on the plot', () => {
    const scales = compareScales([{ points, mins: 120 }], ['probe1'], COMPARE_BOX);
    const place = nearestPoint(points, 'probe1', 10, scales);

    expect(place).toEqual({ x: scales.x(0), y: scales.y(80) });
  });

  it('gives nothing back where there is no sample to mark', () => {
    const scales = compareScales([{ points, mins: 120 }], ['probe1'], COMPARE_BOX);

    expect(nearestPoint(points, 'probe2', 10, scales)).toBeNull();
  });

  /** A dot parked hours from the guide reads as a live probe that is not one. */
  it('marks nothing where the nearest sample is hours behind the scrub', () => {
    const dense = elapsedPoints(
      Array.from({ length: 100 }, (_, index) =>
        reading({ date: at(index * 5), chamber: 225, probe2: index === 0 ? 70 : null })
      )
    );
    const scales = compareScales([{ points: dense, mins: 495 }], ['chamber'], COMPARE_BOX);

    expect(nearestPoint(dense, 'probe2', 0, scales)).not.toBeNull();
    expect(nearestPoint(dense, 'probe2', 480, scales)).toBeNull();
  });
});

describe('elapsedAt', () => {
  const runs: CompareRun[] = [{ points: [], mins: 240 }];
  const scales = compareScales(runs, ['probe1'], COMPARE_BOX);
  const edges = plotEdges(COMPARE_BOX);
  const drawnSize = { left: 0, width: COMPARE_BOX.width };

  it('reads the minute under a pointer, in the chart’s own coordinates', () => {
    const middle = (edges.left + edges.right) / 2;

    expect(elapsedAt(middle, drawnSize, COMPARE_BOX, scales)).toBeCloseTo(120);
  });

  it('brings a pointer back through the width the chart was actually drawn at', () => {
    const wide = { left: 20, width: COMPARE_BOX.width * 2 };
    const middle = 20 + ((edges.left + edges.right) / 2) * 2;

    expect(elapsedAt(middle, wide, COMPARE_BOX, scales)).toBeCloseTo(120);
  });

  it('holds a pointer dragged off either end to the cook it is scrubbing', () => {
    expect(elapsedAt(0, drawnSize, COMPARE_BOX, scales)).toBe(0);
    expect(elapsedAt(COMPARE_BOX.width, drawnSize, COMPARE_BOX, scales)).toBe(240);
  });

  it('reads a chart the browser has not measured as drawn at its own size', () => {
    const unmeasured = { left: 0, width: 0 };

    expect(elapsedAt(edges.right, unmeasured, COMPARE_BOX, scales)).toBeCloseTo(240);
  });
});

describe('the stamp rail’s alignment with the plot', () => {
  it('insets the rail track by exactly the plot’s own horizontal padding', () => {
    const inset = railInset(COMPARE_BOX);

    expect(inset.left).toBe(`${(COMPARE_BOX.margin.left / COMPARE_BOX.width) * 100}%`);
    expect(inset.right).toBe(`${(COMPARE_BOX.margin.right / COMPARE_BOX.width) * 100}%`);
  });

  it('places a stamp along the track the way the plot places that minute', () => {
    expect(railOffset(0, 240)).toBe('0%');
    expect(railOffset(120, 240)).toBe('50%');
  });

  it('holds a stamp logged past the end of the axis on the track', () => {
    expect(railOffset(300, 240)).toBe('100%');
  });

  it('places a stamp at the start of a span nothing was measured over', () => {
    expect(railOffset(30, 0)).toBe('0%');
  });

  /**
   * The rail dot and the picked stamp's guide are placed from the same minute,
   * so a stamp logged after the last reading cannot be shown in two places.
   */
  it('holds a minute logged past the axis to the end of the axis', () => {
    expect(clampToSpan(300, 240)).toBe(240);
    expect(clampToSpan(120, 240)).toBe(120);
    expect(clampToSpan(-30, 240)).toBe(0);
  });

  it('holds every minute to the start of a span nothing was measured over', () => {
    expect(clampToSpan(30, 0)).toBe(0);
  });
});

describe('which stamp a scrub is over', () => {
  it('swells a stamp within a few per cent of the shared axis', () => {
    expect(isNearStamp(60, 62, 240)).toBe(true);
    expect(isNearStamp(60, 80, 240)).toBe(false);
  });

  /**
   * The cursor moves along the shared axis, so nearness is measured there: a
   * three-hour cook beside a twelve-hour one would otherwise have a hit band a
   * couple of pixels wide.
   */
  it('gives both cooks the same band, however long each of them ran', () => {
    const span = 12 * 60;
    const bandEdge = span * 0.03;

    expect(isNearStamp(60, 60 + bandEdge / 2, span)).toBe(true);
    expect(isNearStamp(600, 600 + bandEdge / 2, span)).toBe(true);
  });

  it('swells nothing while nothing is being scrubbed', () => {
    expect(isNearStamp(60, null, 240)).toBe(false);
  });

  it('swells nothing on an axis with no length to measure nearness against', () => {
    expect(isNearStamp(60, 60, 0)).toBe(false);
  });
});
