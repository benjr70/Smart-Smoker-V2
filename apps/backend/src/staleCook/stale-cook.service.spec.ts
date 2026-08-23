import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationSettings } from '../appSettings/app-settings.schema';
import { PreSmoke } from '../presmoke/presmoke.schema';
import { SmokeStatus } from '../smoke/smoke.schema';
import { StateService } from '../State/state.service';
import { StatsService } from '../stats/stats.service';
import { FakeDoc, fakeModel } from '../timeline/testing/fake-model';
import { TimelineService } from '../timeline/timeline.service';
import { StaleCookService } from './stale-cook.service';

/** A reading of the cook, as the smoker stores one: temperatures as strings. */
const reading = (date: string, chamber: string): FakeDoc => ({
  tempsId: 'temps-id',
  date: new Date(date),
  ChamberTemp: chamber,
  MeatTemp: '150',
  Meat2Temp: '0',
  Meat3Temp: '0',
});

/** The moment the app is next opened: a day after the readings stopped. */
const NEXT_DAY = new Date('2026-08-02T16:00:00.000Z');

describe('StaleCookService', () => {
  let service: StaleCookService;
  let smokes: FakeDoc[];
  let temps: FakeDoc[];
  let states: FakeDoc[];
  let settings: FakeDoc[];
  let stats: { recalculate: jest.Mock };
  /** The real stamping the manual End Smoke flow goes through. */
  let timeline: TimelineService;

  const build = async (): Promise<StaleCookService> => {
    stats = { recalculate: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaleCookService,
        TimelineService,
        StateService,
        { provide: StatsService, useValue: stats },
        { provide: getModelToken('Smoke'), useValue: fakeModel(smokes) },
        { provide: getModelToken('Temp'), useValue: fakeModel(temps) },
        { provide: getModelToken('state'), useValue: fakeModel(states) },
        {
          provide: getModelToken(ApplicationSettings.name),
          useValue: fakeModel(settings),
        },
        { provide: getModelToken(PreSmoke.name), useValue: fakeModel([]) },
      ],
    }).compile();
    timeline = module.get<TimelineService>(TimelineService);
    return module.get<StaleCookService>(StaleCookService);
  };

  /** The cook as it is stored after the run: read back, never held from before. */
  const storedSmoke = (): FakeDoc => smokes[0];
  const storedState = (): FakeDoc => states[0];

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
      reading('2026-08-01T15:55:00.000Z', '244'),
    ];
    states = [{ _id: 'state-id', smokeId: 'smoke-id', smoking: true }];
    settings = [
      {
        _id: 'settings-id',
        probeTarget: {
          enabled: true,
          probes: [{ slot: 'probe1', enabled: true, target: 203 }],
        },
      },
    ];
    service = await build();
  });

  it('stops a cook whose readings stopped a day ago, backdated to the last one', async () => {
    const stopped = await service.autoStopIfStale(NEXT_DAY);

    expect(stopped).toMatchObject({ smokeId: 'smoke-id' });
    expect(storedState().smoking).toBe(false);
    expect(storedSmoke().finishedAt).toEqual(
      new Date('2026-08-01T15:55:00.000Z'),
    );
    expect(storedSmoke().targetTemp).toBe(203);
    expect(storedSmoke().peakChamber).toBe(268);
  });

  // Stopping is not completing: the wizard — post-smoke notes, the rating — is
  // still ahead of the pitmaster, so the cook stays in progress and the session
  // stays theirs to walk whenever they next open the app.
  it('leaves the stopped cook in progress and still the current session', async () => {
    await service.autoStopIfStale(NEXT_DAY);

    expect(storedSmoke().status).toBe(SmokeStatus.InProgress);
    expect(storedState().smokeId).toBe('smoke-id');
  });

  it('leaves a cook whose readings are still arriving alone', async () => {
    const stopped = await service.autoStopIfStale(
      new Date('2026-08-01T17:00:00.000Z'),
    );

    expect(stopped).toBeNull();
    expect(storedSmoke().finishedAt).toBeNull();
    expect(storedState().smoking).toBe(true);
  });

  // Smoking switched off is a decision somebody made — a paused cook, or one
  // being ended through the wizard. Neither is abandoned.
  it('leaves a session whose smoking flag is already off alone', async () => {
    storedState().smoking = false;

    const stopped = await service.autoStopIfStale(NEXT_DAY);

    expect(stopped).toBeNull();
    expect(storedSmoke().finishedAt).toBeNull();
  });

  // A session set up the evening before the cook has no readings at all, and
  // nothing about it is stale — it has not started.
  it('leaves a session that has recorded no readings alone', async () => {
    temps.length = 0;

    const stopped = await service.autoStopIfStale(NEXT_DAY);

    expect(stopped).toBeNull();
    expect(storedSmoke().finishedAt).toBeNull();
    expect(storedState().smoking).toBe(true);
  });

  // A row stored without a moment cannot say when the cook was last heard from,
  // so a series of nothing but those is a session with no readings.
  it('leaves a session whose only readings carry no date alone', async () => {
    temps.forEach((row) => {
      row.date = null;
    });

    const stopped = await service.autoStopIfStale(NEXT_DAY);

    expect(stopped).toBeNull();
    expect(storedSmoke().finishedAt).toBeNull();
  });

  /**
   * The two triggers — a poll of the timeline and a reading arriving after the
   * gap — can notice the same zombie at the same moment. One stop happened, so
   * one of them is told so, one set of stamps is written, and the statistics
   * are rebuilt once.
   */
  it('stamps once when two triggers notice the same stale cook at once', async () => {
    const [first, second] = await Promise.all([
      service.autoStopIfStale(NEXT_DAY),
      service.autoStopIfStale(NEXT_DAY),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(storedSmoke().finishedAt).toEqual(
      new Date('2026-08-01T15:55:00.000Z'),
    );
    expect(storedState().smoking).toBe(false);
    expect(stats.recalculate).toHaveBeenCalledTimes(1);
  });

  describe('a cook that is already stamped but still says it is smoking', () => {
    /** Where an earlier stop recorded the cook as having ended. */
    const alreadyFinished = new Date('2026-08-01T15:00:00.000Z');

    beforeEach(() => {
      storedSmoke().finishedAt = alreadyFinished;
    });

    // Half a stop is the zombie all over again: the record says the cook ended
    // yesterday while the session says it is still running. It happens when the
    // flip fails after the stamp is written, and the next poll is the only
    // thing that can finish the job.
    it('switches smoking off without touching what was already recorded', async () => {
      const stopped = await service.autoStopIfStale(NEXT_DAY);

      expect(storedState().smoking).toBe(false);
      expect(storedSmoke().finishedAt).toEqual(alreadyFinished);
      // The stop was reported when it was stamped; this is the tail of it.
      expect(stopped).toBeNull();
      expect(stats.recalculate).not.toHaveBeenCalled();
    });

    // The box is going again over a session that carries an old finish — the
    // user fired it up for burgers without starting a new cook. Their smoking
    // flag is theirs; the apps prompt them to start a fresh session, and
    // nothing here switches the box off underneath them.
    it('leaves a stamped cook whose readings are still arriving alone', async () => {
      const stopped = await service.autoStopIfStale(
        new Date('2026-08-01T17:00:00.000Z'),
      );

      expect(stopped).toBeNull();
      expect(storedState().smoking).toBe(true);
      expect(storedSmoke().finishedAt).toEqual(alreadyFinished);
    });
  });

  // The pitmaster gets to the app days later and walks the End Smoke wizard.
  // What they end is a cook that was already over, so the recorded time stays
  // the honest one rather than becoming the moment they got round to it.
  it('keeps the backdated finish when the cook is later ended by hand', async () => {
    await service.autoStopIfStale(NEXT_DAY);

    await timeline.stampFinish('smoke-id');

    expect(storedSmoke().finishedAt).toEqual(
      new Date('2026-08-01T15:55:00.000Z'),
    );
  });

  describe('the configured idle threshold', () => {
    /** Eight hours after the readings stopped: past six, short of twelve. */
    const EIGHT_HOURS_ON = new Date('2026-08-01T23:55:00.000Z');

    it('takes six hours of silence to mean the cook is over by default', async () => {
      const stopped = await service.autoStopIfStale(EIGHT_HOURS_ON);

      expect(stopped).toMatchObject({ smokeId: 'smoke-id' });
      expect(stopped?.idleHours).toBeCloseTo(8);
    });

    it('leaves the cook alone while the configured threshold has not passed', async () => {
      settings[0].autoStop = { idleHours: 12 };

      const stopped = await service.autoStopIfStale(EIGHT_HOURS_ON);

      expect(stopped).toBeNull();
      expect(storedSmoke().finishedAt).toBeNull();
    });

    it('stops the cook once the configured threshold has passed', async () => {
      settings[0].autoStop = { idleHours: 12 };

      const stopped = await service.autoStopIfStale(NEXT_DAY);

      expect(stopped).toMatchObject({ smokeId: 'smoke-id' });
      expect(storedState().smoking).toBe(false);
    });

    // A threshold that cannot be read as hours is no threshold at all, and
    // treating it as one would compare as "never idle" — leaving the zombie
    // cooks this exists to end.
    it('falls back to six hours when the stored threshold is nonsense', async () => {
      settings[0].autoStop = { idleHours: 'six' };

      const stopped = await service.autoStopIfStale(EIGHT_HOURS_ON);

      expect(stopped).toMatchObject({ smokeId: 'smoke-id' });
    });

    it('falls back to six hours when no settings have been stored at all', async () => {
      settings.length = 0;

      const stopped = await service.autoStopIfStale(EIGHT_HOURS_ON);

      expect(stopped).toMatchObject({ smokeId: 'smoke-id' });
    });
  });

  it('reads the clock when it is not told what moment it is', async () => {
    // The fixture's readings stopped long enough ago that any real "now" is
    // past the threshold.
    const stopped = await service.autoStopIfStale();

    expect(stopped).toMatchObject({ smokeId: 'smoke-id' });
  });

  it('leaves a session that names no cook alone', async () => {
    storedState().smokeId = '';

    expect(await service.autoStopIfStale(NEXT_DAY)).toBeNull();
  });

  it('stops nothing when the named cook is no longer there', async () => {
    smokes.length = 0;

    expect(await service.autoStopIfStale(NEXT_DAY)).toBeNull();
    expect(storedState().smoking).toBe(true);
  });

  it('stops nothing when no session has ever been written', async () => {
    states.length = 0;

    expect(await service.autoStopIfStale(NEXT_DAY)).toBeNull();
  });

  it('recomputes the statistics once a cook has been stopped', async () => {
    await service.autoStopIfStale(NEXT_DAY);

    expect(stats.recalculate).toHaveBeenCalledTimes(1);
  });

  it('leaves nothing to recompute when no cook was stopped', async () => {
    storedState().smoking = false;

    await service.autoStopIfStale(NEXT_DAY);

    expect(stats.recalculate).not.toHaveBeenCalled();
  });

  // The read that noticed — a poll of a running cook's timeline — has nothing
  // to do with the Stats screen, and must not fail because its numbers could
  // not be rebuilt. The stop itself has already been written.
  it('stops the cook even when the statistics cannot be recomputed', async () => {
    stats.recalculate.mockRejectedValue(new Error('stats are down'));

    const stopped = await service.autoStopIfStale(NEXT_DAY);

    expect(stopped).toMatchObject({ smokeId: 'smoke-id' });
    expect(storedSmoke().finishedAt).toEqual(
      new Date('2026-08-01T15:55:00.000Z'),
    );
    expect(storedState().smoking).toBe(false);
  });
});
