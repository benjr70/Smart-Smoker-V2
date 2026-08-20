import { CookRecord, aggregateStats } from './stats.aggregate';

const HOUR = 60 * 60 * 1000;

/** A completed cook with nothing filled in but what a test cares about. */
const cook = (overrides: Partial<CookRecord> = {}): CookRecord => ({
  smokeId: 'smoke-1',
  completed: true,
  date: new Date('2026-04-20T12:00:00.000Z'),
  name: 'Sunday brisket',
  meatType: 'Brisket',
  weight: null,
  weightUnit: null,
  woodType: 'Hickory',
  restTime: '',
  durationMs: null,
  peakChamber: null,
  ratings: null,
  ...overrides,
});

describe('aggregateStats', () => {
  it('adds a single cook up into the headline totals', () => {
    const stats = aggregateStats([
      cook({ weight: 12, weightUnit: 'LB', durationMs: 6 * HOUR }),
    ]);

    expect(stats.totalSessions).toBe(1);
    expect(stats.totalCookMs).toBe(6 * HOUR);
    expect(stats.totalPounds).toBe(12);
    expect(stats.approximateServings).toBe(30);
  });

  it('has nothing to say about an archive with nothing in it', () => {
    const stats = aggregateStats([]);

    expect(stats.totalSessions).toBe(0);
    expect(stats.totalCookMs).toBeNull();
    expect(stats.totalPounds).toBeNull();
    expect(stats.approximateServings).toBeNull();
    expect(stats.averageRating).toBeNull();
    expect(stats.averageCookMs).toBeNull();
    expect(stats.totalRestMs).toBeNull();
    expect(stats.byMeat).toEqual([]);
    expect(stats.byWood).toEqual([]);
    expect(stats.records.highestRated).toBeNull();
  });

  it('leaves the cook still on the smoker out of every figure', () => {
    const stats = aggregateStats([
      cook({ smokeId: 'done', weight: 10, weightUnit: 'LB', durationMs: HOUR }),
      cook({
        smokeId: 'running',
        completed: false,
        weight: 99,
        weightUnit: 'LB',
        durationMs: 5 * HOUR,
        meatType: 'Pork butt',
      }),
    ]);

    expect(stats.totalSessions).toBe(1);
    expect(stats.totalPounds).toBe(10);
    expect(stats.totalCookMs).toBe(HOUR);
    expect(stats.byMeat.map((row) => row.meatType)).toEqual(['Brisket']);
  });

  describe('weights, whatever they were weighed in', () => {
    const weighings: [string, number | null, string | null, number][] = [
      ['pounds are already pounds', 12, 'LB', 12],
      ['ounces are sixteen to the pound', 24, 'OZ', 1.5],
      ['kilograms are 2.20462 pounds', 2, 'KG', 4.4],
      ['a lower-cased unit is the same unit', 32, 'oz', 2],
      ['a padded unit is the same unit', 5, ' LB ', 5],
      ['an unweighed cut weighs nothing', null, 'LB', 0],
      ['a unit nobody recognises weighs nothing', 5, 'STONE', 0],
    ];

    it.each(weighings)('%s', (_case, weight, weightUnit, pounds) => {
      const stats = aggregateStats([cook({ weight, weightUnit })]);

      expect(stats.totalPounds).toBe(pounds);
      // The session counts however it was weighed, or whether it was at all.
      expect(stats.totalSessions).toBe(1);
    });
  });

  it('rounds the servings the pounds would feed', () => {
    // 9.3 lb × 2.5 = 23.25 servings.
    const stats = aggregateStats([cook({ weight: 9.3, weightUnit: 'LB' })]);

    expect(stats.approximateServings).toBe(23);
  });

  describe('rest, however it was written down', () => {
    const MINUTE = 60 * 1000;
    const rests: [string, string | null, number][] = [
      ['the wizard writes a colon', '01:30', 90 * MINUTE],
      ['a long rest in colon form', '12:05', 725 * MINUTE],
      ['hours and minutes with suffixes', '1h 30m', 90 * MINUTE],
      ['spelled-out hours', '2 hours', 120 * MINUTE],
      ['minutes on their own', '45m', 45 * MINUTE],
      ['spelled-out minutes', '45 minutes', 45 * MINUTE],
      ['a bare number is minutes', '90', 90 * MINUTE],
      ['a bare decimal number is minutes', '1.5', 1.5 * MINUTE],
      ['hours alone with a suffix', '3h', 180 * MINUTE],
      ['nothing was written', '', 0],
      ['nothing was recorded at all', null, 0],
      ['what was written makes no sense', 'a while', 0],
    ];

    it.each(rests)('%s', (_case, restTime, restMs) => {
      expect(aggregateStats([cook({ restTime })]).totalRestMs).toBe(restMs);
    });

    it('adds every cook’s rest together', () => {
      const stats = aggregateStats([
        cook({ smokeId: 'a', restTime: '01:00' }),
        cook({ smokeId: 'b', restTime: '30m' }),
        cook({ smokeId: 'c', restTime: 'no idea' }),
      ]);

      expect(stats.totalRestMs).toBe(90 * MINUTE);
    });
  });

  describe('averages', () => {
    const scored = (overrides: Partial<CookRecord>, overallTaste: number) =>
      cook({
        ...overrides,
        ratings: {
          smokeFlavor: overallTaste - 1,
          seasoning: overallTaste,
          tenderness: overallTaste + 1,
          overallTaste,
        },
      });

    it('averages the overall score and the length of the cooks that have one', () => {
      const stats = aggregateStats([
        scored({ smokeId: 'a', durationMs: 4 * HOUR }, 8),
        scored({ smokeId: 'b', durationMs: 8 * HOUR }, 7),
      ]);

      expect(stats.averageRating).toBe(7.5);
      expect(stats.averageCookMs).toBe(6 * HOUR);
      expect(stats.categoryAverages).toEqual({
        smokeFlavor: 6.5,
        seasoning: 7.5,
        tenderness: 8.5,
        overallTaste: 7.5,
      });
    });

    it('does not count a cook nobody rated as a cook rated zero', () => {
      const stats = aggregateStats([
        scored({ smokeId: 'rated' }, 9),
        cook({ smokeId: 'unrated', ratings: null }),
        cook({
          smokeId: 'untouched-sliders',
          ratings: {
            smokeFlavor: 0,
            seasoning: 0,
            tenderness: 0,
            overallTaste: 0,
          },
        }),
      ]);

      expect(stats.averageRating).toBe(9);
      expect(stats.categoryAverages.tenderness).toBe(10);
    });

    it('has no average length for an archive nothing could be derived from', () => {
      const stats = aggregateStats([cook({ durationMs: null })]);

      expect(stats.totalCookMs).toBeNull();
      expect(stats.averageCookMs).toBeNull();
      expect(stats.averageRating).toBeNull();
    });

    it('leaves a cook of unknown length out of the average rather than counting it as nothing', () => {
      const stats = aggregateStats([
        cook({ smokeId: 'timed', durationMs: 5 * HOUR }),
        cook({ smokeId: 'legacy', durationMs: null }),
      ]);

      expect(stats.averageCookMs).toBe(5 * HOUR);
      expect(stats.totalCookMs).toBe(5 * HOUR);
    });
  });

  describe('personal records', () => {
    it('picks the cook that holds each record', () => {
      const stats = aggregateStats([
        cook({
          smokeId: 'brisket',
          name: 'Sunday brisket',
          durationMs: 14 * HOUR,
          weight: 16,
          weightUnit: 'LB',
          peakChamber: 265,
          ratings: {
            smokeFlavor: 8,
            seasoning: 8,
            tenderness: 8,
            overallTaste: 8,
          },
        }),
        cook({
          smokeId: 'ribs',
          name: 'Baby backs',
          durationMs: 5 * HOUR,
          weight: 4,
          weightUnit: 'LB',
          peakChamber: 310,
          ratings: {
            smokeFlavor: 9,
            seasoning: 9,
            tenderness: 9,
            overallTaste: 10,
          },
        }),
      ]);

      expect(stats.records.highestRated).toMatchObject({
        smokeId: 'ribs',
        label: 'Baby backs',
        value: 10,
      });
      expect(stats.records.longestCook).toMatchObject({
        smokeId: 'brisket',
        value: 14 * HOUR,
      });
      expect(stats.records.heaviestCut).toMatchObject({
        smokeId: 'brisket',
        value: 16,
      });
      expect(stats.records.hottestChamber).toMatchObject({
        smokeId: 'ribs',
        value: 310,
      });
    });

    it('has no hottest chamber while no cook has recorded a peak', () => {
      const stats = aggregateStats([
        cook({ smokeId: 'a', peakChamber: null, durationMs: HOUR }),
      ]);

      expect(stats.records.hottestChamber).toBeNull();
      expect(stats.records.longestCook).not.toBeNull();
    });

    it('gives a tied record to the more recent cook', () => {
      const stats = aggregateStats([
        cook({
          smokeId: 'older',
          date: new Date('2026-01-01T00:00:00.000Z'),
          durationMs: 9 * HOUR,
        }),
        cook({
          smokeId: 'newer',
          date: new Date('2026-05-01T00:00:00.000Z'),
          durationMs: 9 * HOUR,
        }),
      ]);

      expect(stats.records.longestCook?.smokeId).toBe('newer');
    });

    it('calls a cook nobody named by its meat and its day', () => {
      const stats = aggregateStats([
        cook({
          smokeId: 'unnamed',
          name: '   ',
          meatType: 'Pork butt',
          date: new Date('2026-04-20T12:00:00.000Z'),
          durationMs: 9 * HOUR,
        }),
      ]);

      expect(stats.records.longestCook).toMatchObject({
        label: 'Pork butt · Apr 20, 2026',
        date: '2026-04-20T12:00:00.000Z',
      });
    });

    it('names a cook with neither a name nor a meat as best it can', () => {
      const stats = aggregateStats([
        cook({
          smokeId: 'anonymous',
          name: null,
          meatType: null,
          date: null,
          durationMs: 3 * HOUR,
        }),
      ]);

      expect(stats.records.longestCook).toMatchObject({
        label: 'Unnamed cook',
        date: null,
      });
    });

    it('leaves a record nobody set at null rather than picking a cook without the figure', () => {
      const stats = aggregateStats([
        cook({ smokeId: 'a', durationMs: null, weight: null, ratings: null }),
      ]);

      expect(stats.records.longestCook).toBeNull();
      expect(stats.records.heaviestCut).toBeNull();
      expect(stats.records.highestRated).toBeNull();
    });
  });

  describe('what was cooked, and over what', () => {
    it('counts one meat however it was capitalised, under its usual spelling', () => {
      const stats = aggregateStats([
        cook({
          smokeId: 'a',
          meatType: 'brisket',
          weight: 10,
          weightUnit: 'LB',
        }),
        cook({
          smokeId: 'b',
          meatType: 'Brisket',
          weight: 12,
          weightUnit: 'LB',
        }),
        cook({
          smokeId: 'c',
          meatType: '  Brisket ',
          weight: 16,
          weightUnit: 'OZ',
        }),
      ]);

      expect(stats.byMeat).toEqual([
        { meatType: 'Brisket', sessions: 3, pounds: 23 },
      ]);
      expect(stats.meatTypeCount).toBe(1);
    });

    it('counts woods the same way, and says how many there are', () => {
      const stats = aggregateStats([
        cook({ smokeId: 'a', woodType: 'hickory' }),
        cook({ smokeId: 'b', woodType: 'Hickory' }),
        cook({ smokeId: 'c', woodType: 'Apple' }),
      ]);

      expect(stats.byWood).toEqual([
        { woodType: 'Hickory', sessions: 2 },
        { woodType: 'Apple', sessions: 1 },
      ]);
      expect(stats.woodTypeCount).toBe(2);
    });

    it('does not make a kind of meat out of a blank field', () => {
      const stats = aggregateStats([
        cook({ smokeId: 'a', meatType: '', woodType: '   ' }),
        cook({ smokeId: 'b', meatType: null, woodType: null }),
      ]);

      expect(stats.byMeat).toEqual([]);
      expect(stats.byWood).toEqual([]);
      expect(stats.meatTypeCount).toBe(0);
      expect(stats.woodTypeCount).toBe(0);
      // The sessions themselves still happened.
      expect(stats.totalSessions).toBe(2);
    });

    it('lists the most-cooked meat first', () => {
      const stats = aggregateStats([
        cook({ smokeId: 'a', meatType: 'Chicken' }),
        cook({ smokeId: 'b', meatType: 'Brisket' }),
        cook({ smokeId: 'c', meatType: 'Brisket' }),
      ]);

      expect(stats.byMeat.map((row) => row.meatType)).toEqual([
        'Brisket',
        'Chicken',
      ]);
    });
  });
});
