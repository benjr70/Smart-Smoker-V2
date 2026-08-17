import { estimateCompletion, needsHistoricalRate } from './completion-estimate';

const NOW = new Date('2026-08-17T18:00:00.000Z');

/** A reading `minutesAgo` before the fixed "now", at `temp` °F. */
const ago = (minutesAgo: number, temp: number) => ({
  date: new Date(NOW.getTime() - minutesAgo * 60_000),
  temp,
});

describe('estimateCompletion', () => {
  it('projects a steady climb to its target and answers when it will get there', () => {
    // 150°F now, climbing 10°F/hr, 20°F to go: two hours out.
    const estimate = estimateCompletion({
      readings: [ago(60, 140), ago(30, 145), ago(0, 150)],
      target: 170,
      smoking: true,
      now: NOW,
    });

    expect(estimate.state).toBe('ok');
    expect(estimate.ratePerHour).toBeCloseTo(10, 5);
    expect(estimate.hoursRemaining).toBeCloseTo(2, 5);
    expect(estimate.eta).toEqual(new Date('2026-08-17T20:00:00.000Z'));
  });

  it('reads the rate from the last thirty minutes only, however long the cook ran', () => {
    // Four hours of a 2°F/hr crawl, then half an hour climbing at 20°F/hr.
    const estimate = estimateCompletion({
      readings: [
        ago(240, 92),
        ago(120, 96),
        ago(31, 100),
        ago(30, 100),
        ago(15, 105),
        ago(0, 110),
      ],
      target: 170,
      smoking: true,
      now: NOW,
    });

    expect(estimate.ratePerHour).toBeCloseTo(20, 5);
    expect(estimate.hoursRemaining).toBeCloseTo(3, 5);
  });

  describe('while it is still gathering data', () => {
    const warming = [
      ['no readings at all', []],
      ['one reading', [ago(2, 78)]],
      ['one reading in the window, the rest older', [ago(45, 70), ago(5, 78)]],
    ] as const;

    it.each(warming)('is warming with %s', (_case, readings) => {
      const estimate = estimateCompletion({
        readings: [...readings],
        target: 203,
        smoking: true,
        now: NOW,
      });

      expect(estimate.state).toBe('warming');
      expect(estimate.ratePerHour).toBeNull();
      expect(estimate.eta).toBeNull();
      expect(estimate.hoursRemaining).toBeNull();
    });
  });

  it('suspends the projection while smoking is switched off', () => {
    const estimate = estimateCompletion({
      readings: [ago(30, 140), ago(15, 145), ago(0, 150)],
      target: 170,
      smoking: false,
      now: NOW,
    });

    expect(estimate.state).toBe('paused');
    expect(estimate.eta).toBeNull();
    expect(estimate.hoursRemaining).toBeNull();
    // The cook is still where it was: what it read and how fast it was moving
    // are facts about a paused cook too.
    expect(estimate.ratePerHour).toBeCloseTo(20, 5);
    expect(estimate.targetTemp).toBe(170);
  });

  it('says it is paused rather than calculating when the cook is barely under way', () => {
    const estimate = estimateCompletion({
      readings: [ago(2, 78)],
      target: 203,
      smoking: false,
      now: NOW,
    });

    expect(estimate.state).toBe('paused');
  });

  describe('once the meat reaches its target', () => {
    it('is done, with nothing left to wait for', () => {
      const estimate = estimateCompletion({
        readings: [ago(30, 195), ago(15, 200), ago(0, 203)],
        target: 203,
        smoking: true,
        now: NOW,
      });

      expect(estimate.state).toBe('done');
      expect(estimate.hoursRemaining).toBe(0);
      expect(estimate.eta).toEqual(NOW);
    });

    it('stays done when a later reading wobbles back under the target', () => {
      const estimate = estimateCompletion({
        readings: [ago(30, 200), ago(15, 204), ago(0, 202)],
        target: 203,
        smoking: true,
        now: NOW,
      });

      expect(estimate.state).toBe('done');
    });

    /**
     * A reader that takes the series in slices — the opening of the cook and
     * the last half hour — can hold no reading at or above the target while the
     * meat plainly reached one an hour ago. The peak it is told about settles
     * it, so the card does not fall back out of "Ready now".
     */
    it('is done when the peak of the cook reached the target, whatever the readings in hand say', () => {
      const estimate = estimateCompletion({
        readings: [ago(30, 199), ago(15, 200), ago(0, 201)],
        target: 203,
        smoking: true,
        now: NOW,
        peakTemp: 204,
      });

      expect(estimate.state).toBe('done');
      expect(estimate.progressPercent).toBe(100);
    });

    it('is not done on a peak that never reached the target', () => {
      const estimate = estimateCompletion({
        readings: [ago(30, 140), ago(15, 145), ago(0, 150)],
        target: 203,
        smoking: true,
        now: NOW,
        peakTemp: 150,
      });

      expect(estimate.state).toBe('ok');
    });

    it('is done rather than paused when the cook is taken off the heat', () => {
      const estimate = estimateCompletion({
        readings: [ago(30, 195), ago(15, 203), ago(0, 204)],
        target: 203,
        smoking: false,
        now: NOW,
      });

      expect(estimate.state).toBe('done');
    });
  });

  describe('when the climb flattens out', () => {
    /** A cook `minutes` long whose last half hour climbs at `perHour` °F/hr. */
    const crawling = (minutes: number, perHour: number) => [
      ago(minutes, 150 - (perHour * minutes) / 60),
      ago(20, 150 - perHour / 3),
      ago(0, 150),
    ];

    it('calls a hours-long crawl a stall, and stops projecting a finish', () => {
      const estimate = estimateCompletion({
        readings: crawling(180, 1),
        target: 203,
        smoking: true,
        now: NOW,
      });

      expect(estimate.state).toBe('stalled');
      expect(estimate.ratePerHour).toBeCloseTo(1, 5);
      expect(estimate.eta).toBeNull();
      expect(estimate.hoursRemaining).toBeNull();
    });

    it.each([
      [1.49, 'stalled'],
      [1.5, 'ok'],
      [1.51, 'ok'],
    ])('reads %s °F/hr as %s', (perHour, state) => {
      expect(
        estimateCompletion({
          readings: crawling(180, perHour),
          target: 203,
          smoking: true,
          now: NOW,
        }).state,
      ).toBe(state);
    });

    it('does not call a stall in the first half hour of a cook', () => {
      const estimate = estimateCompletion({
        readings: crawling(20, 0),
        target: 203,
        smoking: true,
        now: NOW,
      });

      expect(estimate.state).toBe('ok');
      // Flat: there is no honest finish to project from a rate of nothing.
      expect(estimate.eta).toBeNull();
      expect(estimate.hoursRemaining).toBeNull();
    });
  });

  describe('progress', () => {
    it('measures from the cook’s first reading to its target', () => {
      const estimate = estimateCompletion({
        readings: [ago(120, 60), ago(20, 140), ago(0, 150)],
        target: 200,
        smoking: true,
        now: NOW,
      });

      // 90°F of the 140°F between where the meat started and where it is done.
      expect(estimate.startTemp).toBe(60);
      expect(estimate.progressPercent).toBeCloseTo(64.2857, 3);
    });

    it('never reads below nothing when the probe reads under where it started', () => {
      const estimate = estimateCompletion({
        readings: [ago(120, 80), ago(20, 70), ago(0, 68)],
        target: 200,
        smoking: true,
        now: NOW,
      });

      expect(estimate.progressPercent).toBe(0);
    });
  });

  describe('blending in what past cooks did', () => {
    it('leans half on history a quarter of an hour in', () => {
      // Fifteen minutes of readings: w = 15/30, so the rate is the average of
      // the 20°F/hr the probe is doing and the 10°F/hr history expects.
      const estimate = estimateCompletion({
        readings: [ago(15, 145), ago(0, 150)],
        target: 165,
        smoking: true,
        now: NOW,
        historicalRate: 10,
      });

      expect(estimate.ratePerHour).toBeCloseTo(15, 5);
      expect(estimate.hoursRemaining).toBeCloseTo(1, 5);
      expect(estimate.eta).toEqual(new Date('2026-08-17T19:00:00.000Z'));
    });

    it('weighs the data in the window, not the hours the cook has been running', () => {
      // Five hours in, but the window holds half a minute of readings: half a
      // minute of probe is not enough to project five hours from, however long
      // the cook has been going.
      const estimate = estimateCompletion({
        readings: [ago(300, 40), ago(120, 120), ago(0.5, 149.75), ago(0, 150)],
        target: 165,
        smoking: true,
        now: NOW,
        historicalRate: 10,
      });

      // w = 0.5/30: the 30°F/hr the last two readings imply counts for a
      // sixtieth, and history for the rest.
      expect(estimate.ratePerHour).toBeCloseTo((30 + 59 * 10) / 60, 5);
    });

    it('ignores history once the cook has half an hour of its own', () => {
      const estimate = estimateCompletion({
        readings: [ago(45, 130), ago(30, 140), ago(0, 160)],
        target: 180,
        smoking: true,
        now: NOW,
        historicalRate: 1000,
      });

      expect(estimate.ratePerHour).toBeCloseTo(40, 5);
      expect(estimate.hoursRemaining).toBeCloseTo(0.5, 5);
    });

    it('leans wholly on history before the probe has moved at all', () => {
      // Two readings in the same instant: the probe has said nothing about a
      // rate yet, so the only rate there is is what past cooks did.
      const estimate = estimateCompletion({
        readings: [ago(0, 140), ago(0, 140)],
        target: 160,
        smoking: true,
        now: NOW,
        historicalRate: 10,
      });

      expect(estimate.ratePerHour).toBe(10);
      expect(estimate.hoursRemaining).toBeCloseTo(2, 5);
    });

    it('goes on calculating when neither the probe nor history has a rate', () => {
      const estimate = estimateCompletion({
        readings: [ago(0, 140), ago(0, 140)],
        target: 160,
        smoking: true,
        now: NOW,
      });

      expect(estimate.state).toBe('warming');
      expect(estimate.ratePerHour).toBeNull();
    });

    it('reports what past cooks say before the probe has given a second reading', () => {
      const estimate = estimateCompletion({
        readings: [ago(45, 70), ago(5, 78)],
        target: 203,
        smoking: true,
        now: NOW,
        historicalRate: 10,
      });

      // Still calculating — one reading in the window is no climb of its own —
      // but there is a rate to show, and it is the one past cooks recorded.
      expect(estimate.state).toBe('warming');
      expect(estimate.ratePerHour).toBe(10);
      expect(estimate.eta).toBeNull();
    });

    it('shows a stalled cook what it is actually doing, not what history expects', () => {
      const estimate = estimateCompletion({
        readings: [ago(180, 149), ago(20, 149.7), ago(0, 150)],
        target: 203,
        smoking: true,
        now: NOW,
        historicalRate: 30,
      });

      // The meat is not moving: a blended "10.6 °F/hr" beside the word
      // "Stalled" would report a climb nothing is climbing.
      expect(estimate.state).toBe('stalled');
      expect(estimate.ratePerHour).toBeCloseTo(0.9, 5);
    });

    it('shows a paused cook what the probe was doing, not what history expects', () => {
      const estimate = estimateCompletion({
        readings: [ago(15, 145), ago(0, 150)],
        target: 203,
        smoking: false,
        now: NOW,
        historicalRate: 100,
      });

      expect(estimate.state).toBe('paused');
      expect(estimate.ratePerHour).toBeCloseTo(20, 5);
    });

    it('does not let a brisk history talk a stalled cook out of its stall', () => {
      const estimate = estimateCompletion({
        readings: [ago(180, 149), ago(20, 149.7), ago(0, 150)],
        target: 203,
        smoking: true,
        now: NOW,
        historicalRate: 30,
      });

      expect(estimate.state).toBe('stalled');
      expect(estimate.eta).toBeNull();
    });
  });

  it('projects nothing at all when no probe is being watched', () => {
    const estimate = estimateCompletion({
      readings: [ago(30, 140), ago(15, 145), ago(0, 150)],
      target: null,
      smoking: true,
      now: NOW,
    });

    expect(estimate).toEqual({
      state: null,
      eta: null,
      hoursRemaining: null,
      ratePerHour: null,
      progressPercent: null,
      startTemp: null,
      targetTemp: null,
    });
  });
});

/**
 * Reading the user's history costs a query per past cook, on a route the
 * clients poll for the whole length of a cook. The projection knows when that
 * read would change nothing, and says so before it is made.
 */
describe('needsHistoricalRate', () => {
  const young = [ago(10, 140), ago(0, 145)];

  it.each([
    ['nothing has been read yet', { readings: [] }],
    ['the window holds one reading', { readings: [ago(5, 140)] }],
    ['the window holds ten minutes', { readings: young }],
    [
      'the window holds just under half an hour',
      { readings: [ago(29, 100), ago(0, 140)] },
    ],
  ])('is worth reading when %s', (_case, input) => {
    expect(
      needsHistoricalRate({
        readings: [],
        target: 203,
        smoking: true,
        now: NOW,
        ...input,
      }),
    ).toBe(true);
  });

  it.each([
    ['no probe is being watched', { target: null }],
    ['the cook is off the heat', { smoking: false }],
    ['the meat is already at its target', { target: 145 }],
    [
      'the cook has half an hour of its own',
      { readings: [ago(30, 100), ago(0, 140)] },
    ],
    [
      'a long cook has a full window of its own',
      { readings: [ago(300, 40), ago(45, 80), ago(30, 100), ago(0, 140)] },
    ],
  ])('is not worth reading when %s', (_case, input) => {
    expect(
      needsHistoricalRate({
        readings: young,
        target: 203,
        smoking: true,
        now: NOW,
        ...input,
      }),
    ).toBe(false);
  });
});
