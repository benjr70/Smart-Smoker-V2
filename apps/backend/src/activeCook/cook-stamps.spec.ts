import { FakeDoc, fakeModel } from '../timeline/testing/fake-model';
import { SmokeStatus } from '../smoke/smoke.schema';
import {
  StampCollections,
  stampCookFinishAt,
  stampCookPull,
  stampCookStart,
} from './cook-stamps';

/** Let the wall clock move on, so a second stamp would be a different moment. */
const tick = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 5));

const reading = (
  date: string | null,
  chamber: string,
  meat: string,
): FakeDoc => ({
  tempsId: 'temps-id',
  date: date ? new Date(date) : null,
  ChamberTemp: chamber,
  MeatTemp: meat,
  Meat2Temp: '0',
  Meat3Temp: '0',
});

/**
 * The three moments a cook is stamped with, over a store that applies the
 * writes — so "stamped once and never moved" is read off the document
 * afterwards rather than off which model method happened to be called.
 *
 * These moved here with the writes themselves: they used to be the timeline's,
 * which is now only the side that derives over them.
 */
describe('the cook stamps', () => {
  let smokes: FakeDoc[];
  let temps: FakeDoc[];
  let settings: FakeDoc[];
  let collections: StampCollections;

  /** The collections as they currently stand. */
  const build = (): void => {
    collections = {
      smokeModel: fakeModel(smokes) as never,
      tempModel: fakeModel(temps) as never,
      settingsModel: fakeModel(settings) as never,
    };
  };

  /** The one watched probe of an installation, set to `target`. */
  const watching = (slot: string, target: number): void => {
    settings.push({
      _id: 'settings-id',
      probeTarget: {
        enabled: true,
        probes: [
          { slot, enabled: true, target },
          { slot: 'probe3', enabled: false, target: 999 },
        ],
      },
    });
  };

  beforeEach(() => {
    smokes = [
      { _id: 'smoke-id', tempsId: 'temps-id', status: SmokeStatus.InProgress },
    ];
    temps = [
      reading('2026-08-01T10:05:00.000Z', '210', '80'),
      reading('2026-08-01T13:00:00.000Z', '268', '150'),
      reading('2026-08-01T15:55:00.000Z', '244', '198'),
    ];
    settings = [];
    build();
  });

  describe('the start', () => {
    it('records when the cook started', async () => {
      temps.length = 0;
      const before = Date.now();

      expect(await stampCookStart(collections, 'smoke-id')).toBe(true);

      expect(smokes[0].startedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(smokes[0].startedAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    /**
     * The stamp is written after the flip that triggers it, so a failed write
     * is deferred to the next switch-on — hours into a cook that has been
     * recording all along. Taken at face value that start would sit in the
     * middle of its own cook, and everything that trusts it (the chart bound,
     * the duration) would call the cook's first hours something else. A cook
     * cannot have begun after the readings it has already taken, so the
     * earliest of them is the latest a start may be stamped at.
     */
    it('never stamps a start later than the readings the cook has already taken', async () => {
      await stampCookStart(collections, 'smoke-id');

      expect(smokes[0].startedAt).toEqual(new Date('2026-08-01T10:05:00.000Z'));
    });

    /**
     * A device whose clock runs ahead dates its readings in the future; the
     * cook still started when somebody pressed the button, not later.
     */
    it('stamps the moment of the press when the readings are dated ahead of it', async () => {
      temps.length = 0;
      temps.push(reading('2099-01-01T00:00:00.000Z', '210', '80'));
      const before = Date.now();

      await stampCookStart(collections, 'smoke-id');

      expect(smokes[0].startedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(smokes[0].startedAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('leaves the first start standing when smoking is toggled again', async () => {
      await stampCookStart(collections, 'smoke-id');
      const first = smokes[0].startedAt;

      await tick();

      expect(await stampCookStart(collections, 'smoke-id')).toBe(false);
      expect(smokes[0].startedAt).toEqual(first);
    });

    it('stamps nothing for a cook that does not exist', async () => {
      expect(await stampCookStart(collections, 'no-such-smoke')).toBe(false);
    });
  });

  /**
   * The rest begins when the meat comes off, and the meat comes off when the
   * pitmaster leaves the Smoke step — so the moment and the temperature it came
   * off at are recorded there rather than asked for a second time.
   */
  describe('the pull', () => {
    beforeEach(() => {
      watching('probe1', 203);
    });

    it('records when the meat came off and what the watched probe read', async () => {
      const before = Date.now();

      expect(await stampCookPull(collections, 'smoke-id')).toBe(true);

      expect(smokes[0].pullAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(smokes[0].pullTemp).toBe(198);
    });

    it('leaves the pull already stamped alone, and says it stamped nothing', async () => {
      await stampCookPull(collections, 'smoke-id');
      const first = smokes[0].pullAt;

      await tick();

      expect(await stampCookPull(collections, 'smoke-id')).toBe(false);
      expect(smokes[0].pullAt).toEqual(first);
    });

    it('stamps the pull of a cook with no probe watched, without a temperature', async () => {
      settings.length = 0;

      expect(await stampCookPull(collections, 'smoke-id')).toBe(true);

      expect(smokes[0].pullAt).toBeInstanceOf(Date);
      expect(smokes[0].pullTemp ?? null).toBeNull();
    });

    it('stamps nothing for a cook that does not exist', async () => {
      expect(await stampCookPull(collections, 'no-such-smoke')).toBe(false);
    });
  });

  describe('the finish', () => {
    /** The manual End Smoke: now, and the whole series scanned for its peak. */
    const finishNow = (): Promise<boolean> =>
      stampCookFinishAt(collections, 'smoke-id', new Date(), null);

    it('records the finish together with the target the watched probe was set to', async () => {
      watching('probe2', 165);
      const before = Date.now();

      expect(await finishNow()).toBe(true);

      expect(smokes[0].targetTemp).toBe(165);
      expect(smokes[0].finishedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('snapshots no target when no probe was being watched', async () => {
      await finishNow();

      expect(smokes[0].targetTemp).toBeNull();
    });

    it('leaves an already finished cook alone', async () => {
      await finishNow();
      const first = smokes[0].finishedAt;

      await tick();

      expect(await finishNow()).toBe(false);
      expect(smokes[0].finishedAt).toEqual(first);
    });

    it('reads nothing of an already finished cook’s series', async () => {
      await finishNow();
      const reads = jest.spyOn(collections.tempModel, 'aggregate');

      await finishNow();

      // A retried finish is rejected by the guard on the write, so scanning
      // the series first is a whole cook's readings read to be thrown away.
      expect(reads).not.toHaveBeenCalled();
    });

    it('stamps how hot the chamber ever ran onto the cook', async () => {
      await finishNow();

      expect(smokes[0].peakChamber).toBe(268);
    });

    it('stamps the numerically hottest reading, not the alphabetically largest', async () => {
      temps = [
        reading('2026-08-01T10:05:00.000Z', '99', '80'),
        reading('2026-08-01T13:00:00.000Z', '245', '150'),
      ];
      build();

      await finishNow();

      expect(smokes[0].peakChamber).toBe(245);
    });

    it('stamps no peak for a cook that recorded no readings, and still finishes it', async () => {
      temps.length = 0;

      await finishNow();

      expect(smokes[0].peakChamber ?? null).toBeNull();
      expect(smokes[0].finishedAt).toBeInstanceOf(Date);
    });

    /**
     * A reading may be stored without a moment — the archive holds plenty, and
     * the derivation behind `GET /timeline/:id` counts them. The manual finish
     * scans the whole series exactly as it always has, so pressing End Smoke on
     * a cook whose hottest reading was stored undated stamps that peak rather
     * than a lower one, and the stamp agrees with what the statistics backfill
     * would have found.
     */
    it('counts undated readings in the peak the manual finish stamps', async () => {
      temps.push(reading(null, '301', '150'));
      build();

      await finishNow();

      expect(smokes[0].peakChamber).toBe(301);
    });

    it('records that a cook with no readings was asked for a peak', async () => {
      temps.length = 0;

      await finishNow();

      // So the statistics rebuild knows the answer was nothing, rather than
      // going back to its series for the same nothing every time.
      expect(smokes[0].peakChamberScanned).toBe(true);
    });

    it('stamps nothing for a cook that does not exist', async () => {
      expect(
        await stampCookFinishAt(collections, 'no-such-smoke', new Date()),
      ).toBe(false);
    });

    /**
     * A cook does not always end when somebody notices it has: the auto-stop
     * ends one at the last reading it took, days after the box went quiet.
     */
    describe('at a moment that has already passed', () => {
      /** Where the real cook ended: its last reading before it went quiet. */
      const COOK_ENDED = new Date('2026-08-01T15:55:00.000Z');

      it('records the cook as having finished at the moment it was given', async () => {
        await stampCookFinishAt(collections, 'smoke-id', COOK_ENDED);

        expect(smokes[0].finishedAt).toEqual(COOK_ENDED);
      });

      /**
       * A cook nobody ended keeps collecting whatever the box records next — a
       * hot grill firing weeks later lands in the old cook's series. That was
       * not this cook's chamber, so the peak is scanned over the cook's own
       * window and stops where the cook did.
       */
      it('scans the peak over the cook’s window and not the strays after it', async () => {
        temps.push(reading('2026-08-20T18:00:00.000Z', '470', '70'));
        build();

        await stampCookFinishAt(collections, 'smoke-id', COOK_ENDED);

        expect(smokes[0].peakChamber).toBe(268);
      });

      it('says whether this call is the one that stamped the finish', async () => {
        expect(
          await stampCookFinishAt(collections, 'smoke-id', COOK_ENDED),
        ).toBe(true);

        expect(
          await stampCookFinishAt(collections, 'smoke-id', new Date()),
        ).toBe(false);
        expect(smokes[0].finishedAt).toEqual(COOK_ENDED);
      });
    });
  });
});
