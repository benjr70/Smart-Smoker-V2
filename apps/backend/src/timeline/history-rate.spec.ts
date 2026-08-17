import { CompletedCook, sampleHistoricalRate } from './history-rate';

const HOUR_MS = 60 * 60 * 1000;

/**
 * A finished cook that climbed `perHour` °F/hr — 40°F to 200°F over however
 * many hours that takes — weighing `weight` of `unit`.
 */
const cook = (
  meatType: string,
  perHour: number,
  weight: number | null,
  unit = 'lb',
): CompletedCook => ({
  meatType,
  weight,
  weightUnit: unit,
  startTemp: 40,
  targetTemp: 200,
  durationMs: (160 / perHour) * HOUR_MS,
});

describe('sampleHistoricalRate', () => {
  it('scales past cooks of the same meat to what is on the smoker now', () => {
    // 20°F/hr on 9lb and 15°F/hr on 16lb both normalize to 60; at 4lb the meat
    // in the smoker is expected to climb at 60/√4.
    const rate = sampleHistoricalRate(
      [cook('Brisket', 20, 9), cook('Brisket', 15, 16)],
      { meatType: 'Brisket', weight: 4, weightUnit: 'lb' },
    );

    expect(rate).toBeCloseTo(30, 5);
  });

  it('reads only the cooks of the same meat', () => {
    // The two briskets normalize to 40 and 80; the pork shoulder to 400, which
    // would pull the middle of the set up if it were counted.
    const rate = sampleHistoricalRate(
      [
        cook('Brisket', 20, 4),
        cook('Brisket', 20, 16),
        cook('Pork Shoulder', 40, 100),
      ],
      { meatType: 'Brisket', weight: 4, weightUnit: 'lb' },
    );

    expect(rate).toBeCloseTo(30, 5);
  });

  describe('matching what the user typed', () => {
    /** Two past cooks logged as `typed`, read for a cook of "Brisket". */
    const rateFor = (typed: string) =>
      sampleHistoricalRate([cook(typed, 20, 4), cook(typed, 20, 16)], {
        meatType: 'Brisket',
        weight: 4,
        weightUnit: 'lb',
      });

    it.each([
      ['brisket', 'the same word in another case'],
      ['  Brisket  ', 'the same word with space around it'],
      ['Brisketr', 'one typed character out'],
      ['Brskt', 'two typed characters out'],
    ])('reads %s as the same meat — %s', (typed) => {
      expect(rateFor(typed)).toBeCloseTo(30, 5);
    });

    it.each([
      ['Brkt', 'three typed characters out'],
      ['Pork Shoulder', 'another meat entirely'],
      ['', 'nothing typed at all'],
    ])('reads %s as a different meat — %s', (typed) => {
      expect(rateFor(typed)).toBeNull();
    });

    it('leaves out a past cook that never recorded what it was', () => {
      expect(
        sampleHistoricalRate(
          [
            cook('Brisket', 20, 4),
            cook('Brisket', 20, 16),
            { ...cook('Brisket', 500, 100), meatType: null },
          ],
          { meatType: 'Brisket', weight: 4, weightUnit: 'lb' },
        ),
      ).toBeCloseTo(30, 5);
    });

    it('says nothing when the cook on the smoker has no meat typed in', () => {
      expect(
        sampleHistoricalRate(
          [cook('Brisket', 20, 4), cook('Brisket', 20, 16)],
          {
            meatType: '',
            weight: 4,
            weightUnit: 'lb',
          },
        ),
      ).toBeNull();
    });
  });

  describe('weighing cooks logged in other units', () => {
    it('reads ounces as the pounds they are', () => {
      // 64oz and 256oz are the 4lb and 16lb of the case above.
      const rate = sampleHistoricalRate(
        [cook('Brisket', 20, 64, 'oz'), cook('Brisket', 20, 256, 'oz')],
        { meatType: 'Brisket', weight: 4, weightUnit: 'lb' },
      );

      expect(rate).toBeCloseTo(30, 5);
    });

    it('reads the pounds a form spelt “lbs”', () => {
      const rate = sampleHistoricalRate(
        [cook('Brisket', 20, 4, 'lbs'), cook('Brisket', 20, 16, 'lbs')],
        { meatType: 'Brisket', weight: 4, weightUnit: 'lbs' },
      );

      expect(rate).toBeCloseTo(30, 5);
    });

    it('reads kilograms as the pounds they are, on both sides', () => {
      const rate = sampleHistoricalRate(
        [
          cook('Brisket', 20, 4 / 2.205, 'kg'),
          cook('Brisket', 20, 16 / 2.205, 'kg'),
        ],
        { meatType: 'Brisket', weight: 4 / 2.205, weightUnit: 'kg' },
      );

      expect(rate).toBeCloseTo(30, 5);
    });
  });

  describe('when the weights cannot be normalized', () => {
    const current = { meatType: 'Brisket', weight: 4, weightUnit: 'lb' };

    it.each([
      [
        'a unit nobody weighs meat in',
        [cook('Brisket', 20, 3, 'stone'), cook('Brisket', 30, 5, 'stone')],
      ],
      [
        'no weight logged at all',
        [cook('Brisket', 20, null), cook('Brisket', 30, null)],
      ],
    ])(
      'falls back to the plain middle of the past cooks with %s',
      (_case, cooks) => {
        expect(sampleHistoricalRate([...cooks], current)).toBeCloseTo(25, 5);
      },
    );

    it('falls back to the plain middle when the meat on the smoker was never weighed', () => {
      expect(
        sampleHistoricalRate(
          [cook('Brisket', 20, 4), cook('Brisket', 30, 16)],
          {
            meatType: 'Brisket',
            weight: null,
            weightUnit: 'lb',
          },
        ),
      ).toBeCloseTo(25, 5);
    });

    it('drops only the cooks it cannot weigh, keeping a normalized pair', () => {
      const rate = sampleHistoricalRate(
        [
          cook('Brisket', 20, 4),
          cook('Brisket', 20, 16),
          cook('Brisket', 500, null),
        ],
        current,
      );

      expect(rate).toBeCloseTo(30, 5);
    });
  });

  describe('cooks that recorded no usable climb', () => {
    const current = { meatType: 'Brisket', weight: null, weightUnit: 'lb' };

    it.each([
      ['it never recorded how long it ran', { durationMs: null }],
      ['it ran for no time at all', { durationMs: 0 }],
      ['it never recorded what it was taken to', { targetTemp: null }],
      ['it never recorded a first reading', { startTemp: null }],
      ['it finished colder than it started', { targetTemp: 20 }],
    ])('leaves out a cook where %s', (_case, broken) => {
      const rate = sampleHistoricalRate(
        [
          cook('Brisket', 20, null),
          cook('Brisket', 30, null),
          { ...cook('Brisket', 1000, null), ...broken },
        ],
        current,
      );

      expect(rate).toBeCloseTo(25, 5);
    });

    it('takes the middle cook of an odd-sized set', () => {
      const rate = sampleHistoricalRate(
        [
          cook('Brisket', 60, null),
          cook('Brisket', 10, null),
          cook('Brisket', 20, null),
        ],
        current,
      );

      expect(rate).toBeCloseTo(20, 5);
    });
  });

  it('says nothing at all on a user’s first ever cook', () => {
    expect(
      sampleHistoricalRate([], {
        meatType: 'Brisket',
        weight: 12,
        weightUnit: 'lb',
      }),
    ).toBeNull();
  });

  it('says nothing at all from a single cook of the meat', () => {
    expect(
      sampleHistoricalRate(
        [cook('Brisket', 20, 9), cook('Pork Butt', 15, 16)],
        {
          meatType: 'Brisket',
          weight: 4,
          weightUnit: 'lb',
        },
      ),
    ).toBeNull();
  });
});
