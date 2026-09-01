import {
  CompareReading,
  CompareRun,
  COMPARE_BOX,
  EMPTY_Y_DOMAIN,
  MIN_SPAN_MINUTES,
  availablePositions,
  comparePath,
  compareScales,
  compareSpanMinutes,
  compareYDomain,
  elapsedPoints,
  hourTicks,
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
