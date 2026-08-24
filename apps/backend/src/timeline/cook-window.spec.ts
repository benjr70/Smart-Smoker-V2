import { cookWindow, peakChamberIn } from './cook-window';

const HOUR = 60 * 60 * 1000;

/** A reading taken `hours` after the fixture's opening moment. */
const at = (hours: number) => ({
  date: new Date(Date.parse('2026-04-20T06:00:00.000Z') + hours * HOUR),
});

describe('cookWindow', () => {
  it('ends the cook at the last reading before the first long gap', () => {
    // A real ten-hour cook, then the box fired up again a fortnight later.
    const window = cookWindow(
      [at(0), at(5), at(10), at(14 * 24), at(14 * 24 + 1)],
      6 * HOUR,
    );

    expect(window).toEqual({
      startedAt: at(0).date,
      finishedAt: at(10).date,
    });
  });

  it('spans a series that never went silent from end to end', () => {
    const window = cookWindow([at(0), at(3), at(5.5), at(9)], 6 * HOUR);

    expect(window).toEqual({ startedAt: at(0).date, finishedAt: at(9).date });
  });

  it('has no window for a series of nothing, or of rows that carry no moment', () => {
    expect(cookWindow([], 6 * HOUR)).toBeNull();
    expect(
      cookWindow([{ date: null }, { ChamberTemp: '210' }], 6 * HOUR),
    ).toBeNull();
  });

  it('cuts by the moments themselves, not by the order they were stored in', () => {
    const window = cookWindow([at(14 * 24), at(0), at(2)], 6 * HOUR);

    expect(window).toEqual({ startedAt: at(0).date, finishedAt: at(2).date });
  });
});

describe('peakChamberIn', () => {
  const window = { startedAt: at(0).date, finishedAt: at(10).date };

  it('reads the hottest chamber inside the window and nothing outside it', () => {
    const readings = [
      { ...at(0), ChamberTemp: '225' },
      { ...at(4), ChamberTemp: '260' },
      // The grill run a fortnight later, hotter than the cook ever was.
      { ...at(14 * 24), ChamberTemp: '450' },
    ];

    expect(peakChamberIn(readings, window)).toBe(260);
  });

  it('holds no peak where the window recorded nothing readable', () => {
    const readings = [
      { ...at(1), ChamberTemp: '' },
      { ...at(2), ChamberTemp: 'n/a' },
      { ...at(3), ChamberTemp: null },
      { date: null, ChamberTemp: '300' },
    ];

    expect(peakChamberIn(readings, window)).toBeNull();
  });
});
