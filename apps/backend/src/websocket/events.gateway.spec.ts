import { Test, TestingModule } from '@nestjs/testing';
import { EventsGateway } from './events.gateway';
import { StateService } from '../State/state.service';
import { TempsService } from '../temps/temps.service';
import { TempDto } from '../temps/tempDto';
import { Logger } from '@nestjs/common';

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

    // Deliberately only the two collaborators the gateway is allowed to have.
    // Alert evaluation is owned by the notifications service on its own
    // interval, so a gateway that still reached for it could not be constructed
    // here at all.
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
