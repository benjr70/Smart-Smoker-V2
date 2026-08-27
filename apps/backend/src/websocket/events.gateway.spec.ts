import { Test, TestingModule } from '@nestjs/testing';
import { EventsGateway } from './events.gateway';
import { StateService } from '../State/state.service';
import { TempsService } from '../temps/temps.service';
import { StaleCookService } from '../staleCook/stale-cook.service';
import { TempDto } from '../temps/tempDto';
import { Logger } from '@nestjs/common';
import { defaultStamps } from '../appSettings/stamp-catalogue';

/** One device frame, as the relay receives it. */
const reading = (date: Date = new Date()) =>
  JSON.stringify({
    probeTemp1: '150',
    probeTemp2: '160',
    probeTemp3: '170',
    chamberTemp: '225',
    date,
  });

/**
 * Freeze the wall clock the gateway reads.
 *
 * Jest's own fake timers cannot be installed in this environment (they try to
 * replace a read-only `performance` global), and only the clock matters here —
 * nothing under test schedules anything.
 */
const RealDate = Date;
const useFrozenClock = (now: Date): void => {
  global.Date = class extends RealDate {
    constructor(value?: number | string | Date) {
      super(value === undefined ? now.getTime() : (value as number));
    }
    static now(): number {
      return now.getTime();
    }
  } as DateConstructor;
};
const restoreClock = (): void => {
  global.Date = RealDate;
};

/** Let the promise chain `handleEvent` starts settle. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

// Mock the socket.io Server type
interface MockServer {
  emit: jest.Mock;
}

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let mockStateService: Partial<StateService>;
  let mockTempsService: Partial<TempsService>;
  let mockStaleCookService: { autoStopIfStale: jest.Mock };
  let mockServer: MockServer;

  const mockState = {
    smokeId: 'test-smoke-id',
    smoking: true,
  };

  beforeEach(async () => {
    mockServer = {
      emit: jest.fn(),
    };

    mockStateService = {
      GetState: jest.fn().mockResolvedValue(mockState),
    };

    mockTempsService = {
      saveNewTemp: jest.fn(),
    };

    mockStaleCookService = {
      autoStopIfStale: jest.fn().mockResolvedValue(null),
    };

    // Deliberately only the three collaborators the gateway is allowed to have:
    // the state it reads, the series it writes, and the one service that
    // decides an abandoned cook is over. Alert evaluation is owned by the
    // notifications service on its own interval, so a gateway that still
    // reached for it could not be constructed here at all.
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsGateway,
        {
          provide: StateService,
          useValue: mockStateService,
        },
        {
          provide: TempsService,
          useValue: mockTempsService,
        },
        {
          provide: StaleCookService,
          useValue: mockStaleCookService,
        },
      ],
    }).compile();

    gateway = module.get<EventsGateway>(EventsGateway);
    (gateway as any).server = mockServer;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('identity', () => {
    it('should return the same data and log it', async () => {
      const testData = 12345;
      const logSpy = jest.spyOn(Logger, 'log').mockImplementation();

      const result = await gateway.identity(testData);

      expect(result).toBe(testData);
      expect(logSpy).toHaveBeenCalledWith(`identity: ${testData}`, 'Websocket');

      logSpy.mockRestore();
    });
  });

  describe('handleEvent', () => {
    it('should emit events and handle temperature logging when smoking', async () => {
      const testData = JSON.stringify({
        probeTemp1: '150',
        probeTemp2: '160',
        probeTemp3: '170',
        chamberTemp: '225',
        date: new Date(),
      });

      // Mock the global count variable - need to trigger the count > 10 condition
      // We'll call handleEvent multiple times to trigger the temperature logging
      for (let i = 0; i <= 11; i++) {
        gateway.handleEvent(testData);
      }

      expect(mockServer.emit).toHaveBeenCalledWith('events', testData);
      expect(mockStateService.GetState).toHaveBeenCalled();
    });

    // The every-eleventh-message counter gated two things: the notification call
    // (removed with this slice) and the temperature write. Only the first was
    // meant to go — a smoke's temperature series must keep exactly the sampling
    // rate it has always had.
    it('still persists one reading per eleven messages', async () => {
      const testData = JSON.stringify({
        probeTemp1: '150',
        probeTemp2: '160',
        probeTemp3: '170',
        chamberTemp: '225',
        date: new Date(),
      });

      for (let i = 0; i < 10; i++) {
        gateway.handleEvent(testData);
      }
      await settle();
      expect(mockTempsService.saveNewTemp).not.toHaveBeenCalled();

      gateway.handleEvent(testData);
      await settle();
      expect(mockTempsService.saveNewTemp).toHaveBeenCalledTimes(1);

      for (let i = 0; i < 11; i++) {
        gateway.handleEvent(testData);
      }
      await settle();
      expect(mockTempsService.saveNewTemp).toHaveBeenCalledTimes(2);
    });

    // A fresh install — and every fresh hermetic stack — has an empty `states`
    // collection, so the very first sampled batch used to dereference
    // `undefined` inside an unawaited promise and take the whole process down
    // with an unhandled rejection.
    it('persists nothing and survives when no state document exists', async () => {
      const testData = JSON.stringify({
        probeTemp1: '150',
        probeTemp2: '160',
        probeTemp3: '170',
        chamberTemp: '225',
        date: new Date(),
      });

      mockStateService.GetState = jest.fn().mockResolvedValue(undefined);

      for (let i = 0; i < 11; i++) {
        gateway.handleEvent(testData);
      }
      await settle();

      expect(mockServer.emit).toHaveBeenCalledWith('events', testData);
      expect(mockTempsService.saveNewTemp).not.toHaveBeenCalled();
    });

    // The read used to be a floating promise with no rejection handler, so a
    // database blip was an unhandled rejection and Node terminated the process.
    // A relay handler must never be able to do that.
    it('logs and swallows a failed state read', async () => {
      const testData = JSON.stringify({
        probeTemp1: '150',
        probeTemp2: '160',
        probeTemp3: '170',
        chamberTemp: '225',
        date: new Date(),
      });
      const errorSpy = jest.spyOn(Logger, 'error').mockImplementation();

      mockStateService.GetState = jest
        .fn()
        .mockRejectedValue(new Error('mongo is down'));

      for (let i = 0; i < 10; i++) {
        await gateway.handleEvent(testData);
      }
      await expect(gateway.handleEvent(testData)).resolves.toBeUndefined();

      expect(mockTempsService.saveNewTemp).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('mongo is down'),
        'Websocket',
      );

      errorSpy.mockRestore();
    });

    // The persisting write is as much a database call as the read is, and it
    // only ever runs mid-cook — exactly when a Mongo blip must not be allowed
    // to take the backend down with it.
    it('logs and swallows a failed temperature write', async () => {
      const testData = JSON.stringify({
        probeTemp1: '150',
        probeTemp2: '160',
        probeTemp3: '170',
        chamberTemp: '225',
        date: new Date(),
      });
      const errorSpy = jest.spyOn(Logger, 'error').mockImplementation();

      mockTempsService.saveNewTemp = jest
        .fn()
        .mockRejectedValue(new Error('write concern failed'));

      for (let i = 0; i < 10; i++) {
        await gateway.handleEvent(testData);
      }
      await expect(gateway.handleEvent(testData)).resolves.toBeUndefined();

      expect(mockTempsService.saveNewTemp).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('write concern failed'),
        'Websocket',
      );

      errorSpy.mockRestore();
    });

    it('should emit events but not handle temperature when not smoking', async () => {
      const testData = JSON.stringify({
        probeTemp1: '150',
        probeTemp2: '160',
        probeTemp3: '170',
        chamberTemp: '225',
        date: new Date(),
      });

      const nonSmokingState = { ...mockState, smoking: false };
      mockStateService.GetState = jest.fn().mockResolvedValue(nonSmokingState);

      // Call multiple times to trigger count > 10
      for (let i = 0; i <= 11; i++) {
        gateway.handleEvent(testData);
      }
      await settle();

      expect(mockServer.emit).toHaveBeenCalledWith('events', testData);
      expect(mockStateService.GetState).toHaveBeenCalled();
      expect(mockTempsService.saveNewTemp).not.toHaveBeenCalled();
      // A session nobody is smoking has no cook to abandon, and the guard that
      // drops the reading runs before anything asks.
      expect(mockStaleCookService.autoStopIfStale).not.toHaveBeenCalled();
    });

    /**
     * The reading that arrives after the box has been off for a fortnight is
     * what ends the cook nobody ended — and it must not land in that cook's
     * series on its way past. Storing it would re-date the very cook the stop
     * just stamped at its last real reading.
     */
    it('auto-stops a cook the gap says is over and stores nothing into it', async () => {
      mockStaleCookService.autoStopIfStale.mockResolvedValue({
        smokeId: 'test-smoke-id',
        finishedAt: new Date('2026-08-01T12:00:00Z'),
        idleHours: 340,
      });

      for (let i = 0; i < 11; i++) {
        await gateway.handleEvent(reading());
      }

      expect(mockStaleCookService.autoStopIfStale).toHaveBeenCalled();
      expect(mockTempsService.saveNewTemp).not.toHaveBeenCalled();
    });

    // The overwhelmingly common case: a cook in progress, readings arriving as
    // they always did. Nothing about it changes.
    it('stores a reading that arrived inside the threshold', async () => {
      for (let i = 0; i < 11; i++) {
        await gateway.handleEvent(reading());
      }

      expect(mockStaleCookService.autoStopIfStale).toHaveBeenCalled();
      expect(mockTempsService.saveNewTemp).toHaveBeenCalledTimes(1);
    });

    /**
     * The in-memory last-seen is what a running backend answers from, and a
     * backend restarted during the gap has none — which is the shape the fix
     * has to survive, because the box coming back on is exactly when the
     * backend has just started too. Nothing remembered means the store decides.
     */
    it('consults the store on its first stored reading after a restart', async () => {
      for (let i = 0; i < 11; i++) {
        await gateway.handleEvent(reading());
      }

      expect(mockStaleCookService.autoStopIfStale).toHaveBeenCalledTimes(1);
    });

    /**
     * The guard exists so a cook does not pay for a query every eleven
     * messages: a reading stored minutes ago is proof no configured threshold —
     * the smallest of which is an hour — can have been crossed.
     */
    it('answers from memory rather than querying again minutes later', async () => {
      for (let i = 0; i < 11; i++) {
        await gateway.handleEvent(reading());
      }
      expect(mockTempsService.saveNewTemp).toHaveBeenCalledTimes(1);
      mockStaleCookService.autoStopIfStale.mockClear();

      for (let i = 0; i < 11; i++) {
        await gateway.handleEvent(reading());
      }

      expect(mockTempsService.saveNewTemp).toHaveBeenCalledTimes(2);
      expect(mockStaleCookService.autoStopIfStale).not.toHaveBeenCalled();
    });

    // Once an hour has passed since the last stored reading, memory can no
    // longer rule out a crossed threshold, so the store is asked again.
    it('queries again once the shortest possible threshold has elapsed', async () => {
      useFrozenClock(new Date('2026-08-01T12:00:00Z'));
      try {
        for (let i = 0; i < 11; i++) {
          await gateway.handleEvent(reading());
        }
        mockStaleCookService.autoStopIfStale.mockClear();
        useFrozenClock(new Date('2026-08-01T13:30:00Z'));

        for (let i = 0; i < 11; i++) {
          await gateway.handleEvent(reading());
        }

        expect(mockStaleCookService.autoStopIfStale).toHaveBeenCalledTimes(1);
      } finally {
        restoreClock();
      }
    });

    // After a stop there is no cook to be recent about, so the next reading
    // goes back to the store rather than trusting a last-seen that belonged to
    // the session just ended.
    it('forgets what it stored once a cook has been auto-stopped', async () => {
      const logSpy = jest.spyOn(Logger, 'log').mockImplementation();
      useFrozenClock(new Date('2026-08-01T12:00:00Z'));
      try {
        for (let i = 0; i < 11; i++) {
          await gateway.handleEvent(reading());
        }

        // A fortnight later the box comes back on, and the cook is ended.
        useFrozenClock(new Date('2026-08-15T12:00:00Z'));
        mockStaleCookService.autoStopIfStale.mockResolvedValue({
          smokeId: 'test-smoke-id',
          finishedAt: new Date('2026-08-01T12:00:00Z'),
          idleHours: 336,
        });
        for (let i = 0; i < 11; i++) {
          await gateway.handleEvent(reading());
        }
        mockStaleCookService.autoStopIfStale.mockClear();
        mockStaleCookService.autoStopIfStale.mockResolvedValue(null);

        // The reading a minute later belongs to whatever runs next, and the
        // gateway remembers nothing that would let it skip the question.
        useFrozenClock(new Date('2026-08-15T12:01:00Z'));
        for (let i = 0; i < 11; i++) {
          await gateway.handleEvent(reading());
        }

        expect(mockStaleCookService.autoStopIfStale).toHaveBeenCalledTimes(1);
      } finally {
        restoreClock();
        logSpy.mockRestore();
      }
    });

    /**
     * Nothing to report is not the same as nothing happened. The service ends
     * the cook and reports no stop on two paths — a cook that already carried a
     * finish stamp, and a stop that lost the conditional stamp to the timeline
     * poll — and a reading stored after either of those lands in a session
     * whose finish is already backdated, which is the pollution the whole slice
     * exists to prevent. The flag is what says whether the cook survived.
     */
    it('stores nothing when the cook was ended without a stop to report', async () => {
      mockStaleCookService.autoStopIfStale.mockResolvedValue(null);
      mockStateService.GetState = jest
        .fn()
        .mockResolvedValueOnce(mockState)
        .mockResolvedValue({ ...mockState, smoking: false });

      for (let i = 0; i < 11; i++) {
        await gateway.handleEvent(reading());
      }

      expect(mockStaleCookService.autoStopIfStale).toHaveBeenCalledTimes(1);
      expect(mockTempsService.saveNewTemp).not.toHaveBeenCalled();
    });

    /**
     * A stored reading is the newest reading, and the newest reading is what
     * both triggers measure the silence from — so storing one on a check that
     * never answered resets the gap to nothing and the abandoned cook is never
     * noticed again. Dropping the reading costs one sample of a cook that is
     * probably not running; storing it costs the cure.
     */
    it('stores nothing when the staleness check fails', async () => {
      const errorSpy = jest.spyOn(Logger, 'error').mockImplementation();
      mockStaleCookService.autoStopIfStale.mockRejectedValue(
        new Error('mongo is down'),
      );

      for (let i = 0; i < 11; i++) {
        await gateway.handleEvent(reading());
      }

      expect(mockTempsService.saveNewTemp).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('mongo is down'),
        'Websocket',
      );
      errorSpy.mockRestore();
    });

    // A failed check answers nothing at all, so it must not be mistaken for a
    // recent store: the next sampled reading asks again rather than skipping
    // the question for an hour.
    it('asks again on the next reading after a failed check', async () => {
      const errorSpy = jest.spyOn(Logger, 'error').mockImplementation();
      mockStaleCookService.autoStopIfStale.mockRejectedValue(
        new Error('mongo is down'),
      );

      for (let i = 0; i < 22; i++) {
        await gateway.handleEvent(reading());
      }

      expect(mockStaleCookService.autoStopIfStale).toHaveBeenCalledTimes(2);
      errorSpy.mockRestore();
    });

    // The confirming read is as unable to answer as the check itself when the
    // database is unreachable, and an unanswered question is not a live cook.
    it('stores nothing when the confirming state read fails', async () => {
      const errorSpy = jest.spyOn(Logger, 'error').mockImplementation();
      mockStateService.GetState = jest
        .fn()
        .mockResolvedValueOnce(mockState)
        .mockRejectedValue(new Error('mongo is down'));

      for (let i = 0; i < 11; i++) {
        await gateway.handleEvent(reading());
      }

      expect(mockTempsService.saveNewTemp).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('handleTempLogging', () => {
    let warnSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest.spyOn(Logger, 'warn').mockImplementation();
      errorSpy = jest.spyOn(Logger, 'error').mockImplementation();
    });

    afterEach(() => {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should log warning for too cold temperatures', () => {
      const tempDto: TempDto = {
        MeatTemp: '-40',
        Meat2Temp: '160',
        Meat3Temp: '170',
        ChamberTemp: '-35',
      };

      gateway.handleTempLogging(tempDto);

      expect(warnSpy).toHaveBeenCalledWith(
        `temps too cold: ${tempDto}`,
        'Websocket',
      );
    });

    it('should log error for NaN temperatures', () => {
      const tempDto: TempDto = {
        MeatTemp: 'invalid',
        Meat2Temp: '160',
        Meat3Temp: '170',
        ChamberTemp: 'also-invalid',
      };

      gateway.handleTempLogging(tempDto);

      expect(errorSpy).toHaveBeenCalledWith(
        `temps NAN: ${tempDto}`,
        'Websocket',
      );
    });

    it('should log warning for too hot temperatures', () => {
      const tempDto: TempDto = {
        MeatTemp: '600',
        Meat2Temp: '160',
        Meat3Temp: '170',
        ChamberTemp: '700',
      };

      gateway.handleTempLogging(tempDto);

      expect(warnSpy).toHaveBeenCalledWith(
        `temps too hot: ${tempDto}`,
        'Websocket',
      );
    });

    it('should not log anything for normal temperatures', () => {
      const tempDto: TempDto = {
        MeatTemp: '150',
        Meat2Temp: '160',
        Meat3Temp: '170',
        ChamberTemp: '225',
      };

      gateway.handleTempLogging(tempDto);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleSmokeUpdate', () => {
    it('should emit smoke update and log it', () => {
      const testData = 'smoke-update-data';
      const logSpy = jest.spyOn(Logger, 'log').mockImplementation();

      gateway.handleSmokeUpdate(testData);

      expect(mockServer.emit).toHaveBeenCalledWith('smokeUpdate', testData);
      expect(logSpy).toHaveBeenCalledWith(
        `Update Smoking: ${testData}`,
        'Websocket',
      );

      logSpy.mockRestore();
    });
  });

  describe('broadcastSmokeUpdate', () => {
    /**
     * Sent on the same event a client's own flip rides, so that a screen which
     * was showing a cook the backend has since stopped learns of it — its Stop
     * button toggles what it holds, and what it holds would otherwise restart
     * the cook.
     */
    it('announces a backend-decided flip on the event every client listens on', () => {
      const update = {
        smoking: false,
        chamberName: 'Pit',
        probe1Name: 'Brisket',
        probe2Name: 'Ribs',
        probe3Name: 'Spare',
      };

      gateway.broadcastSmokeUpdate(update);

      expect(mockServer.emit).toHaveBeenCalledWith('smokeUpdate', update);
    });
  });

  describe('handleClear', () => {
    it('should emit clear event and log it', () => {
      const testData = 'clear-data';
      const logSpy = jest.spyOn(Logger, 'log').mockImplementation();

      gateway.handleClear(testData);

      expect(mockServer.emit).toHaveBeenCalledWith('clear', testData);
      expect(logSpy).toHaveBeenCalledWith(
        `Clearing smoke ${testData}`,
        'Websocket',
      );

      logSpy.mockRestore();
    });
  });

  /**
   * The appearance is one installation-wide preference, so a change made in one
   * browser has to reach every other client that is already open. It rides the
   * gateway the application already has rather than a second transport, as its
   * own event: nothing that was listening for temperatures or smoke updates has
   * to learn about it.
   */
  describe('broadcastAppearance', () => {
    it('announces the preference to every connected client', () => {
      gateway.broadcastAppearance({ mode: 'dark', resolvedMode: 'dark' });

      expect(mockServer.emit).toHaveBeenCalledWith('appearance', {
        mode: 'dark',
        resolvedMode: 'dark',
      });
    });

    it('announces nothing else', () => {
      gateway.broadcastAppearance({ mode: 'system', resolvedMode: 'light' });

      expect(mockServer.emit).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * The cook log is one list per cook, shown on every open screen at once: a
   * stamp tapped on the phone has to appear on the touchscreen without either
   * of them re-reading. The whole list rides on the announcement rather than
   * the one event that changed, so a client applies it by replacing what it
   * holds and cannot drift.
   */
  describe('broadcastCookEvents', () => {
    it('announces the whole cook log to every connected client', () => {
      const log = [
        { stampKey: 'wood', label: 'Added Wood' },
        { stampKey: 'wrap', label: 'Wrapped' },
      ];

      gateway.broadcastCookEvents(log as never);

      expect(mockServer.emit).toHaveBeenCalledWith('cookEventsUpdate', log);
      expect(mockServer.emit).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * The stamps are edited on a phone and used on a touchscreen in the garage.
   * The whole catalogue rides on the announcement so a client replaces what it
   * holds — merging a rename into a list that has since lost a stamp would put
   * the stamp back.
   */
  describe('broadcastCookLogStamps', () => {
    it('announces the whole stamp catalogue to every connected client', () => {
      const catalogue = defaultStamps();

      gateway.broadcastCookLogStamps(catalogue);

      expect(mockServer.emit).toHaveBeenCalledWith('cookLogStamps', catalogue);
      expect(mockServer.emit).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleRefresh', () => {
    it('should emit refresh event and log it', () => {
      const logSpy = jest.spyOn(Logger, 'log').mockImplementation();

      gateway.handleRefresh();

      expect(mockServer.emit).toHaveBeenCalledWith('refresh');
      expect(logSpy).toHaveBeenCalledWith('refresh smoke', 'Websocket');

      logSpy.mockRestore();
    });
  });
});
