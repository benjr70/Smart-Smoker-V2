import { deriveTimeline } from './timeline.derive';

/** A recorded reading, as the temps collection stores one: everything a string. */
const reading = (
  date: string,
  chamber: string,
  meat: string,
  meat2 = '0',
  meat3 = '0',
) => ({
  date: new Date(date),
  ChamberTemp: chamber,
  MeatTemp: meat,
  Meat2Temp: meat2,
  Meat3Temp: meat3,
});

describe('deriveTimeline', () => {
  it('derives cook duration and the peak chamber and meat readings from the series', () => {
    const timeline = deriveTimeline(
      {
        startedAt: new Date('2026-08-01T10:00:00.000Z'),
        finishedAt: new Date('2026-08-01T16:30:00.000Z'),
        complete: true,
      },
      [
        reading('2026-08-01T10:05:00.000Z', '210', '80', '0', '0'),
        reading('2026-08-01T13:00:00.000Z', '268', '150', '155', '0'),
        reading('2026-08-01T16:00:00.000Z', '244', '198', '203', '0'),
      ],
    );

    expect(timeline.durationMs).toBe(6.5 * 60 * 60 * 1000);
    expect(timeline.peakChamber).toBe(268);
    expect(timeline.peakMeat).toBe(203);
  });

  it('takes an unstamped finished cook times from its first and last readings', () => {
    const timeline = deriveTimeline({ complete: true }, [
      reading('2026-07-04T09:00:00.000Z', '200', '70'),
      reading('2026-07-04T12:00:00.000Z', '250', '160'),
    ]);

    expect(timeline.startedAt).toEqual(new Date('2026-07-04T09:00:00.000Z'));
    expect(timeline.finishedAt).toEqual(new Date('2026-07-04T12:00:00.000Z'));
    expect(timeline.durationMs).toBe(3 * 60 * 60 * 1000);
  });

  it('prefers the stamps a smoke carries over the readings around them', () => {
    const timeline = deriveTimeline(
      {
        startedAt: new Date('2026-07-04T08:30:00.000Z'),
        finishedAt: new Date('2026-07-04T12:45:00.000Z'),
        complete: true,
      },
      [
        reading('2026-07-04T09:00:00.000Z', '200', '70'),
        reading('2026-07-04T12:00:00.000Z', '250', '160'),
      ],
    );

    expect(timeline.startedAt).toEqual(new Date('2026-07-04T08:30:00.000Z'));
    expect(timeline.finishedAt).toEqual(new Date('2026-07-04T12:45:00.000Z'));
  });

  it('reports no finish for a cook that is still running', () => {
    const timeline = deriveTimeline(
      { startedAt: new Date('2026-07-04T09:00:00.000Z'), complete: false },
      [reading('2026-07-04T09:30:00.000Z', '200', '70')],
    );

    expect(timeline.finishedAt).toBeNull();
    expect(timeline.durationMs).toBeNull();
  });

  it('derives nothing at all for a smoke with no stamps and no readings', () => {
    expect(deriveTimeline({ complete: true }, [])).toEqual({
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      peakChamber: null,
      peakMeat: null,
      targetTemp: null,
    });
  });
});
