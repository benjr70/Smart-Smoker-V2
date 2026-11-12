import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { idleCook } from '../activeCook/active-cook';
import { ActiveCookService } from '../activeCook/active-cook.service';
import {
  attachedCook,
  FakeActiveCook,
  fakeActiveCook,
} from '../activeCook/testing/fake-active-cook';
import { ApplicationSettings } from '../appSettings/app-settings.schema';
import { PreSmoke } from '../presmoke/presmoke.schema';
import { SmokeStatus } from '../smoke/smoke.schema';
import { FakeDoc, fakeModel } from '../timeline/testing/fake-model';
import { TimelineService } from '../timeline/timeline.service';
import { StaleCookService } from './stale-cook.service';

/**
 * A reading of the cook, as the smoker stores one: temperatures as strings, and
 * a date the *device* put on it.
 *
 * `storedAt` is the other clock — when the backend accepted the row, which is
 * what its `_id` carries. Left off where a test does not care, exactly as the
 * rows written before ids were looked at leave it off.
 */
const reading = (
  date: string,
  chamber: string,
  storedAt?: string,
): FakeDoc => ({
  ...(storedAt
    ? {
        _id: Types.ObjectId.createFromTime(new Date(storedAt).getTime() / 1000),
      }
    : {}),
  tempsId: 'temps-id',
  date: new Date(date),
  ChamberTemp: chamber,
  MeatTemp: '150',
  Meat2Temp: '0',
  Meat3Temp: '0',
});

/** The moment the app is next opened: a day after the readings stopped. */
const NEXT_DAY = new Date('2026-08-02T16:00:00.000Z');

/** Where the readings of the fixture's cook stopped. */
const LAST_READING = new Date('2026-08-01T15:55:00.000Z');

/** What the pitmaster is told about a stop the box made on the default rule. */
const DEFAULT_NOTICE =
  'Cook auto-stopped after 6 hours idle — open the app to finish it';

/**
 * The settings model as Mongoose behaves while the auto-stop block is not yet
 * a declared path on the schema: a hydrated read drops it, and only a lean
 * read gives back what is actually stored.
 *
 * Worth modelling rather than assuming away, because the threshold ships in a
 * different slice from the reader: a reader written against the hydrated
 * document silently ignores every configured threshold until both have landed,
 * and no compiler or plain fake can tell.
 */
const strictSettingsModel = (docs: FakeDoc[]) => {
  const model = fakeModel(docs);
  return {
    ...model,
    findOne(filter: FakeDoc = {}) {
      const stored = model.findOne(filter);
      let lean = false;
      const chain = {
        lean() {
          lean = true;
          return chain;
        },
        async exec(): Promise<FakeDoc | null> {
          const doc = (await stored.exec()) as FakeDoc | null;
          if (!doc || lean) {
            return doc;
          }
          // Hydration returns the paths the schema declares and no others,
          // and the auto-stop block is not one of them yet.
          const declared = { ...doc };
          delete declared.autoStop;
          return declared;
        },
      };
      return chain;
    },
  };
};

/**
 * Only the decision is held here: whether a cook is stale, and the moment and
 * the sentence the stop it asks for is made with. What a stop *does* — the
 * stamp, the flip, the announcement, the push, the recount — belongs to the
 * Active Cook, and is held in its spec against the store. So the cook stands
 * behind the shared fake, which is what makes "this service writes nothing
 * about cook state" a fact a test can read rather than a claim.
 */
describe('StaleCookService', () => {
  let service: StaleCookService;
  let smokes: FakeDoc[];
  let temps: FakeDoc[];
  let settings: FakeDoc[];
  /** The cook the smoker is attached to, as this service is given it. */
  let activeCook: FakeActiveCook;

  const build = async (): Promise<StaleCookService> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaleCookService,
        // The real timeline over the same fake collections, since where a
        // series ends — by both clocks — is the half of the decision this
        // service reads rather than owns.
        TimelineService,
        { provide: ActiveCookService, useValue: activeCook },
        { provide: getModelToken('Smoke'), useValue: fakeModel(smokes) },
        { provide: getModelToken('Temp'), useValue: fakeModel(temps) },
        {
          provide: getModelToken(ApplicationSettings.name),
          useValue: strictSettingsModel(settings),
        },
        { provide: getModelToken(PreSmoke.name), useValue: fakeModel([]) },
        { provide: getModelToken('CookEvent'), useValue: fakeModel([]) },
      ],
    }).compile();
    return module.get<StaleCookService>(StaleCookService);
  };

  /** The cook as the smoker is attached to it: running, readings behind it. */
  const aRunningCook = (smoking = true) =>
    attachedCook(
      {
        _id: 'smoke-id',
        tempsId: 'temps-id',
        status: SmokeStatus.InProgress,
        startedAt: new Date('2026-08-01T10:00:00.000Z'),
        finishedAt: null,
      },
      smoking,
    );

  beforeEach(async () => {
    smokes = [
      {
        _id: 'smoke-id',
        tempsId: 'temps-id',
        status: SmokeStatus.InProgress,
        startedAt: new Date('2026-08-01T10:00:00.000Z'),
        finishedAt: null,
      },
    ];
    temps = [
      reading('2026-08-01T10:05:00.000Z', '210'),
      reading('2026-08-01T13:00:00.000Z', '268'),
      reading(LAST_READING.toISOString(), '244'),
    ];
    settings = [
      {
        _id: 'settings-id',
        probeTarget: {
          enabled: true,
          probes: [{ slot: 'probe1', enabled: true, target: 203 }],
        },
      },
    ];
    activeCook = fakeActiveCook(aRunningCook());
    service = await build();
  });

  it('stops a cook whose readings stopped a day ago, at the last one', async () => {
    const stopped = await service.autoStopIfStale(NEXT_DAY);

    expect(activeCook.autoStop).toHaveBeenCalledWith(
      LAST_READING,
      DEFAULT_NOTICE,
    );
    expect(stopped).toMatchObject({
      smokeId: 'smoke-id',
      finishedAt: LAST_READING,
    });
  });

  it('leaves a cook whose readings are still arriving alone', async () => {
    const stopped = await service.autoStopIfStale(
      new Date('2026-08-01T17:00:00.000Z'),
    );

    expect(stopped).toBeNull();
    expect(activeCook.autoStop).not.toHaveBeenCalled();
  });

  // Smoking switched off is a decision somebody made — a paused cook, or one
  // being ended through the wizard. Neither is abandoned.
  it('leaves a cook whose smoking flag is already off alone', async () => {
    activeCook.pointAt(aRunningCook(false));

    const stopped = await service.autoStopIfStale(NEXT_DAY);

    expect(stopped).toBeNull();
    expect(activeCook.autoStop).not.toHaveBeenCalled();
  });

  // A session set up the evening before the cook has no readings at all, and
  // nothing about it is stale — it has not started.
  it('leaves a cook that has recorded no readings alone', async () => {
    temps.length = 0;

    const stopped = await service.autoStopIfStale(NEXT_DAY);

    expect(stopped).toBeNull();
    expect(activeCook.autoStop).not.toHaveBeenCalled();
  });

  // A row stored without a moment cannot say when the cook was last heard from,
  // so a series of nothing but those is a session with no readings.
  it('leaves a cook whose only readings carry no date alone', async () => {
    temps.forEach((row) => {
      row.date = null;
    });

    const stopped = await service.autoStopIfStale(NEXT_DAY);

    expect(stopped).toBeNull();
    expect(activeCook.autoStop).not.toHaveBeenCalled();
  });

  it('leaves an idle smoker alone', async () => {
    activeCook.pointAt(idleCook(true));

    expect(await service.autoStopIfStale(NEXT_DAY)).toBeNull();
    expect(activeCook.autoStop).not.toHaveBeenCalled();
  });

  it('reads the clock when it is not told what moment it is', async () => {
    // The fixture's readings stopped long enough ago that any real "now" is
    // past the threshold.
    const stopped = await service.autoStopIfStale();

    expect(stopped).toMatchObject({ smokeId: 'smoke-id' });
  });

  /**
   * The two triggers — a poll of the timeline and a reading arriving after the
   * gap — can notice the same zombie at the same moment, and a cook that was
   * already stamped was stopped and reported before either of them got here.
   * Only the caller that won the stop has anything to report.
   */
  it('reports nothing for a stop it did not win', async () => {
    activeCook.autoStop.mockResolvedValue({
      won: false,
      cook: aRunningCook(false),
    });

    expect(await service.autoStopIfStale(NEXT_DAY)).toBeNull();
    expect(activeCook.autoStop).toHaveBeenCalledTimes(1);
  });

  it('reports one stop when two triggers notice the same stale cook', async () => {
    const reported = await Promise.all([
      service.autoStopIfStale(NEXT_DAY),
      service.autoStopIfStale(NEXT_DAY),
    ]);

    expect(reported.filter(Boolean)).toHaveLength(1);
  });

  /**
   * A cook is judged silent by two clocks, and both have to agree.
   *
   * The date on a reading is the *device's*: the gateway relays whatever the
   * smoker put on it. A Pi that reboots without NTP comes back hours or days
   * behind, and every reading it then sends looks older than the threshold
   * while the cook is plainly alive. Stopping it would be the worst failure
   * this service can have — the gateway drops readings once smoking is off, so
   * the rest of a real cook would go unrecorded.
   *
   * What the backend knows for itself is when it accepted each row, which the
   * row's id carries. The finish is still backdated to the device's date (that
   * is the cook's own account of when it ended); the decision to stop needs the
   * store to have been quiet too.
   */
  describe('a device whose clock is running behind', () => {
    beforeEach(async () => {
      // The readings claim to be a day old and were accepted moments ago.
      temps = [
        reading('2026-08-01T15:50:00.000Z', '210', '2026-08-02T15:55:00.000Z'),
        reading('2026-08-01T15:55:00.000Z', '244', '2026-08-02T15:59:00.000Z'),
      ];
      service = await build();
    });

    it('leaves a cook whose readings are still arriving alone', async () => {
      const stopped = await service.autoStopIfStale(NEXT_DAY);

      expect(stopped).toBeNull();
      expect(activeCook.autoStop).not.toHaveBeenCalled();
    });

    // Once the store has been silent as long as the device says it has, the
    // cook really is over — and it ended when the device said it did.
    it('stops the cook once the store has been silent too, at the reading', async () => {
      const stopped = await service.autoStopIfStale(
        new Date('2026-08-03T16:00:00.000Z'),
      );

      expect(stopped).toMatchObject({ smokeId: 'smoke-id' });
      expect(activeCook.autoStop).toHaveBeenCalledWith(
        LAST_READING,
        DEFAULT_NOTICE,
      );
    });
  });

  describe('the configured idle threshold', () => {
    /** Eight hours after the readings stopped: past six, short of twelve. */
    const EIGHT_HOURS_ON = new Date('2026-08-01T23:55:00.000Z');

    it('takes six hours of silence to mean the cook is over by default', async () => {
      const stopped = await service.autoStopIfStale(EIGHT_HOURS_ON);

      expect(stopped).toMatchObject({ smokeId: 'smoke-id' });
      expect(stopped?.idleHours).toBeCloseTo(8);
    });

    /**
     * The threshold is stored by a slice this one does not wait for, so what is
     * held here is that a stored threshold is obeyed whether or not the schema
     * has learned the path yet — the read goes to the stored document rather
     * than to the document the schema currently describes.
     */
    it('obeys a stored threshold the settings schema does not declare yet', async () => {
      settings[0].autoStop = { idleHours: 12 };

      expect(await service.autoStopIfStale(EIGHT_HOURS_ON)).toBeNull();
      expect(await service.autoStopIfStale(NEXT_DAY)).toMatchObject({
        smokeId: 'smoke-id',
      });
    });

    it('leaves the cook alone while the configured threshold has not passed', async () => {
      settings[0].autoStop = { idleHours: 12 };

      expect(await service.autoStopIfStale(EIGHT_HOURS_ON)).toBeNull();
      expect(activeCook.autoStop).not.toHaveBeenCalled();
    });

    /**
     * The rule the box applied is what explains a stop the pitmaster did not
     * ask for, so the sentence the stop is made with quotes the configured
     * threshold rather than the default or the measured silence.
     */
    it('names the configured threshold in the notice', async () => {
      settings[0].autoStop = { idleHours: 12 };

      await service.autoStopIfStale(NEXT_DAY);

      expect(activeCook.autoStop).toHaveBeenCalledWith(
        LAST_READING,
        expect.stringContaining('after 12 hours idle'),
      );
    });

    // Half an hour, an hour and a half: thresholds an operator may well set,
    // and a message reading "1.5 hours" rather than "1.5000000000000002".
    it('names a fractional threshold as it was configured', async () => {
      settings[0].autoStop = { idleHours: 1.5 };

      await service.autoStopIfStale(NEXT_DAY);

      expect(activeCook.autoStop).toHaveBeenCalledWith(
        LAST_READING,
        expect.stringContaining('after 1.5 hours idle'),
      );
    });

    it('says one hour in the singular', async () => {
      settings[0].autoStop = { idleHours: 1 };

      await service.autoStopIfStale(NEXT_DAY);

      expect(activeCook.autoStop).toHaveBeenCalledWith(
        LAST_READING,
        expect.stringContaining('after 1 hour idle'),
      );
    });

    // A threshold that cannot be read as hours is no threshold at all, and
    // treating it as one would compare as "never idle" — leaving the zombie
    // cooks this exists to end.
    it('falls back to six hours when the stored threshold is nonsense', async () => {
      settings[0].autoStop = { idleHours: 'six' };

      expect(await service.autoStopIfStale(EIGHT_HOURS_ON)).toMatchObject({
        smokeId: 'smoke-id',
      });
    });

    it('falls back to six hours when no settings have been stored at all', async () => {
      settings.length = 0;

      expect(await service.autoStopIfStale(EIGHT_HOURS_ON)).toMatchObject({
        smokeId: 'smoke-id',
      });
    });
  });
});
