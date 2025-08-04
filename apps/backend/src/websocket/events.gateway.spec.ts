import { Test, TestingModule } from '@nestjs/testing';
import { EventsGateway } from './events.gateway';
import { StateService } from '../State/state.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TempsService } from '../temps/temps.service';
import { TempDto } from '../temps/tempDto';
import { Logger } from '@nestjs/common';

// Mock the socket.io Server type
interface MockServer {
  emit: jest.Mock;
}

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let mockStateService: Partial<StateService>;
  let mockNotificationsService: Partial<NotificationsService>;
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

    mockNotificationsService = {
      checkForNotification: jest.fn(),
    };

    mockTempsService = {
      saveNewTemp: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsGateway,
        {
          provide: StateService,
          useValue: mockStateService,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
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

      expect(mockServer.emit).toHaveBeenCalledWith('events', testData);
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

      expect(warnSpy).toHaveBeenCalledWith(`temps too cold: ${tempDto}`, 'Websocket');
    });

    it('should log error for NaN temperatures', () => {
      const tempDto: TempDto = {
        MeatTemp: 'invalid',
        Meat2Temp: '160',
        Meat3Temp: '170',
        ChamberTemp: 'also-invalid',
      };

      gateway.handleTempLogging(tempDto);

      expect(errorSpy).toHaveBeenCalledWith(`temps NAN: ${tempDto}`, 'Websocket');
    });

    it('should log warning for too hot temperatures', () => {
      const tempDto: TempDto = {
        MeatTemp: '600',
        Meat2Temp: '160',
        Meat3Temp: '170',
        ChamberTemp: '700',
      };

      gateway.handleTempLogging(tempDto);

      expect(warnSpy).toHaveBeenCalledWith(`temps too hot: ${tempDto}`, 'Websocket');
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
      expect(logSpy).toHaveBeenCalledWith(`Update Smoking: ${testData}`, 'Websocket');

      logSpy.mockRestore();
    });
  });

  describe('handleClear', () => {
    it('should emit clear event and log it', () => {
      const testData = 'clear-data';
      const logSpy = jest.spyOn(Logger, 'log').mockImplementation();

      gateway.handleClear(testData);

      expect(mockServer.emit).toHaveBeenCalledWith('clear', testData);
      expect(logSpy).toHaveBeenCalledWith(`Clearing smoke ${testData}`, 'Websocket');

      logSpy.mockRestore();
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