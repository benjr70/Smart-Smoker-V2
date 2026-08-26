import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { ApplicationSettings } from '../appSettings/app-settings.schema';
import { PreSmoke } from '../presmoke/presmoke.schema';
import { SmokeStatus } from '../smoke/smoke.schema';
import { PushDispatcherService } from '../pushDispatcher/push-dispatcher.service';
import { StateService } from '../State/state.service';
import { StatsService } from '../stats/stats.service';
import { FakeDoc, fakeModel } from '../timeline/testing/fake-model';
import { TimelineService } from '../timeline/timeline.service';
import { EventsGateway } from '../websocket/events.gateway';
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

describe('StaleCookService', () => {
  let service: StaleCookService;
  let smokes: FakeDoc[];
  let temps: FakeDoc[];
  let states: FakeDoc[];
  let settings: FakeDoc[];
  let stats: { recalculate: jest.Mock };
  let profiles: FakeDoc[];
  /** The socket every app is listening on, as this service reaches it. */
  let events: { broadcastSmokeUpdate: jest.Mock };
  /** The push boundary: what reaches a phone that is nowhere near the box. */
  let push: { notify: jest.Mock };
  /** The real stamping the manual End Smoke flow goes through. */
  let timeline: TimelineService;

  const build = async (): Promise<StaleCookService> => {
    stats = { recalculate: jest.fn().mockResolvedValue(undefined) };
    events = { broadcastSmokeUpdate: jest.fn() };
    push = { notify: jest.fn().mockResolvedValue(1) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaleCookService,
        TimelineService,
        StateService,
        { provide: StatsService, useValue: stats },
        { provide: EventsGateway, useValue: events },
        { provide: PushDispatcherService, useValue: push },
        {
          provide: getModelToken('SmokeProfile'),
          useValue: fakeModel(profiles),
        },
        { provide: getModelToken('Smoke'), useValue: fakeModel(smokes) },
        { provide: getModelToken('Temp'), useValue: fakeModel(temps) },
        { provide: getModelToken('state'), useValue: fakeModel(states) },
        // The real `StateService` is built here, and it removes a discarded
        // session's cook log; nothing in this module's behaviour touches one.
        { provide: getModelToken('CookEvent'), useValue: fakeModel([]) },
        {
          provide: getModelToken(ApplicationSettings.name),
          useValue: strictSettingsModel(settings),
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
    profiles = [
      {
        _id: 'profile-id',
        chamberName: 'Pit',
        probe1Name: 'Brisket',
        probe2Name: 'Ribs',
        probe3Name: 'Spare',
      },
    ];
    smokes = [
      {
        _id: 'smoke-id',
        tempsId: 'temps-id',
        smokeProfileId: 'profile-id',
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
   * A stop nobody is told about is half a stop.
   *
   * The apps hold the smoking flag in memory and only ever learn it changed
   * from the socket. A kiosk that was showing the abandoned cook still believes
   * it is running, and Stop on that screen is a *toggle*: it reads the stored
   * `false` and flips it back to `true`, restarting the very cook this service
   * just ended. So the flip is announced on the same event a client's own flip
   * rides, carrying the cook's names because that is what the frame is.
   */
  describe('telling the apps the cook has stopped', () => {
    it('announces the flip so a stale client cannot toggle the cook back on', async () => {
      await service.autoStopIfStale(NEXT_DAY);

      expect(events.broadcastSmokeUpdate).toHaveBeenCalledWith({
        smoking: false,
        chamberName: 'Pit',
        probe1Name: 'Brisket',
        probe2Name: 'Ribs',
        probe3Name: 'Spare',
      });
    });

    // The names ride along on this frame and the apps apply them, so a cook
    // whose profile was never written must be told the names it would be given
    // on a fresh read rather than blanks that would wipe the labels on screen.
    it('announces the default names for a cook whose profile was never written', async () => {
      profiles.length = 0;

      await service.autoStopIfStale(NEXT_DAY);

      expect(events.broadcastSmokeUpdate).toHaveBeenCalledWith({
        smoking: false,
        chamberName: 'Chamber',
        probe1Name: 'Probe1',
        probe2Name: 'Probe2',
        probe3Name: 'Probe3',
      });
    });

    it('announces the default names for a session that never named a profile', async () => {
      delete storedSmoke().smokeProfileId;

      await service.autoStopIfStale(NEXT_DAY);

      expect(events.broadcastSmokeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ chamberName: 'Chamber' }),
      );
    });

    it('says nothing when there was nothing to stop', async () => {
      await service.autoStopIfStale(new Date('2026-08-01T17:00:00.000Z'));

      expect(events.broadcastSmokeUpdate).not.toHaveBeenCalled();
    });

    // Whichever trigger flipped the flag is the one that announces it; the
    // other flipped nothing and has nothing to say.
    it('announces once when two triggers notice the same stale cook', async () => {
      await Promise.all([
        service.autoStopIfStale(NEXT_DAY),
        service.autoStopIfStale(NEXT_DAY),
      ]);

      expect(events.broadcastSmokeUpdate).toHaveBeenCalledTimes(1);
    });

    // The half-stopped cook — stamped, flag left on — is switched off here, and
    // that flip is exactly the one a stale client would otherwise toggle back.
    it('announces the flip that finishes off a stamped cook still marked smoking', async () => {
      storedSmoke().finishedAt = new Date('2026-08-01T15:00:00.000Z');

      await service.autoStopIfStale(NEXT_DAY);

      expect(events.broadcastSmokeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ smoking: false }),
      );
    });

    // A socket that cannot be reached is a client that will read the truth on
    // its next load. The stop itself is already written and must stand.
    it('stops the cook even when the announcement fails', async () => {
      events.broadcastSmokeUpdate.mockImplementation(() => {
        throw new Error('no socket server yet');
      });

      const stopped = await service.autoStopIfStale(NEXT_DAY);

      expect(stopped).toMatchObject({ smokeId: 'smoke-id' });
      expect(storedState().smoking).toBe(false);
      expect(storedSmoke().finishedAt).toEqual(
        new Date('2026-08-01T15:55:00.000Z'),
      );
    });
  });

  /**
   * The pitmaster is not at the box — that is the whole reason the cook went
   * stale. A stop nobody hears about is a cook they will not come back and
   * finish, so the one place that ends abandoned cooks is also the one place
   * that tells them it happened, whichever trigger noticed.
   *
   * The number in the message is the *threshold*, not how long the readings
   * have actually been silent: "auto-stopped after 6 hours idle" is the rule
   * the box just applied, and it is the sentence that makes sense of a stop the
   * user did not ask for whether they read it an hour later or a fortnight on.
   */
  describe('telling the pitmaster their cook was stopped', () => {
    it('pushes once, naming the threshold that stopped the cook', async () => {
      await service.autoStopIfStale(NEXT_DAY);

      expect(push.notify).toHaveBeenCalledTimes(1);
      expect(push.notify).toHaveBeenCalledWith(
        'Smoker',
        'Cook auto-stopped after 6 hours idle — open the app to finish it',
      );
    });

    // The push is a courtesy on top of a write that has already happened. A
    // phone that cannot be reached — no VAPID keys, no subscriptions, the push
    // service down — must not undo the stop or fail the poll that noticed it.
    it('stops the cook even when the push cannot be delivered', async () => {
      push.notify.mockRejectedValue(new Error('push down'));

      const stopped = await service.autoStopIfStale(NEXT_DAY);

      expect(stopped).toMatchObject({ smokeId: 'smoke-id' });
      expect(storedSmoke().finishedAt).toEqual(
        new Date('2026-08-01T15:55:00.000Z'),
      );
      expect(storedState().smoking).toBe(false);
    });

    it('stops the cook even when the push throws on the way out', async () => {
      push.notify.mockImplementation(() => {
        throw new Error('no dispatcher');
      });

      const stopped = await service.autoStopIfStale(NEXT_DAY);

      expect(stopped).toMatchObject({ smokeId: 'smoke-id' });
      expect(storedState().smoking).toBe(false);
    });

    // A push endpoint that accepts the connection and then says nothing is the
    // failure the try/catch cannot see: nothing rejects, it simply never
    // answers. The read that noticed the zombie — a client polling the current
    // timeline — would hang behind it until TCP gave up, so the announcement
    // must not be on the caller's critical path at all.
    it('stops the cook without waiting for a push that never answers', async () => {
      push.notify.mockReturnValue(new Promise(() => undefined));

      const stopped = await service.autoStopIfStale(NEXT_DAY);

      expect(stopped).toMatchObject({ smokeId: 'smoke-id' });
      expect(storedState().smoking).toBe(false);
      expect(storedSmoke().finishedAt).toEqual(
        new Date('2026-08-01T15:55:00.000Z'),
      );
      expect(push.notify).toHaveBeenCalledTimes(1);
    }, 2000);

    // Left to itself, a send to an endpoint that never answers would sit in
    // memory until TCP gave up and, more to the point, would fail silently.
    // The deadline turns "never answered" into the same reported failure as a
    // refusal, and its rejection is handled where every other push failure is —
    // an unhandled one would take the process down long after the request that
    // triggered it was served.
    it('gives up on a push that never answers and reports it', async () => {
      jest.useFakeTimers({
        doNotFake: ['performance', 'setImmediate'],
      } as never);
      const unhandled: unknown[] = [];
      const record = (reason: unknown): number => unhandled.push(reason);
      process.on('unhandledRejection', record);
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      try {
        push.notify.mockReturnValue(new Promise(() => undefined));

        await service.autoStopIfStale(NEXT_DAY);
        jest.advanceTimersByTime(60_000);
        await new Promise(setImmediate);

        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('no push could be delivered'),
        );
        expect(unhandled).toEqual([]);
      } finally {
        process.off('unhandledRejection', record);
        warn.mockRestore();
        jest.useRealTimers();
      }
    });

    it('says nothing when the readings are still arriving', async () => {
      await service.autoStopIfStale(new Date('2026-08-01T17:00:00.000Z'));

      expect(push.notify).not.toHaveBeenCalled();
    });

    it('says nothing when the session was not smoking to begin with', async () => {
      storedState().smoking = false;

      await service.autoStopIfStale(NEXT_DAY);

      expect(push.notify).not.toHaveBeenCalled();
    });

    // The stop this tail is finishing off was pushed when it was stamped;
    // pushing again would tell the pitmaster twice about one cook.
    it('says nothing when finishing off a cook that was already stamped', async () => {
      storedSmoke().finishedAt = new Date('2026-08-01T15:00:00.000Z');

      await service.autoStopIfStale(NEXT_DAY);

      expect(push.notify).not.toHaveBeenCalled();
    });

    it('pushes once when two triggers notice the same stale cook', async () => {
      await Promise.all([
        service.autoStopIfStale(NEXT_DAY),
        service.autoStopIfStale(NEXT_DAY),
      ]);

      expect(push.notify).toHaveBeenCalledTimes(1);
    });

    it('names the configured threshold rather than the default', async () => {
      settings[0].autoStop = { idleHours: 12 };

      await service.autoStopIfStale(NEXT_DAY);

      expect(push.notify).toHaveBeenCalledWith(
        'Smoker',
        expect.stringContaining('after 12 hours idle'),
      );
    });

    // Half an hour, an hour and a half: thresholds an operator may well set,
    // and a message reading "1.5 hours" rather than "1.5000000000000002".
    it('names a fractional threshold as it was configured', async () => {
      settings[0].autoStop = { idleHours: 1.5 };

      await service.autoStopIfStale(NEXT_DAY);

      expect(push.notify).toHaveBeenCalledWith(
        'Smoker',
        expect.stringContaining('after 1.5 hours idle'),
      );
    });

    it('says one hour in the singular', async () => {
      settings[0].autoStop = { idleHours: 1 };

      await service.autoStopIfStale(NEXT_DAY);

      expect(push.notify).toHaveBeenCalledWith(
        'Smoker',
        expect.stringContaining('after 1 hour idle'),
      );
    });
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
      expect(storedSmoke().finishedAt).toBeNull();
      expect(storedState().smoking).toBe(true);
    });

    // Once the store has been silent as long as the device says it has, the
    // cook really is over — and it ended when the device said it did.
    it('stops the cook once the store has been silent too, backdated to the reading', async () => {
      const stopped = await service.autoStopIfStale(
        new Date('2026-08-03T16:00:00.000Z'),
      );

      expect(stopped).toMatchObject({ smokeId: 'smoke-id' });
      expect(storedSmoke().finishedAt).toEqual(
        new Date('2026-08-01T15:55:00.000Z'),
      );
    });
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
