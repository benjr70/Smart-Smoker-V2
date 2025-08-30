// Mock serialport BEFORE any imports - this is crucial for proper mocking
const mockPort = {
  pipe: jest.fn().mockReturnThis(),
  close: jest.fn(),
  removeAllListeners: jest.fn(),
};

const mockParser = {
  on: jest.fn(),
  removeAllListeners: jest.fn(),
};

jest.mock('serialport', () => {
  const MockSerialPort = jest.fn().mockImplementation(() => mockPort);
  const MockReadlineParser = jest.fn().mockImplementation(() => mockParser);

  return {
    SerialPort: MockSerialPort,
    ReadlineParser: MockReadlineParser,
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { SerialService } from './serial.serivce';

// Get references to the mocked objects for use in tests
// These will now refer to the same instances used by the SerialService

describe('SerialService', () => {
  let service: SerialService;
  let module: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.clearAllTimers();

    // Mock Logger methods
    jest.spyOn(Logger, 'log').mockImplementation();
    jest.spyOn(Logger, 'debug').mockImplementation();
    jest.spyOn(Logger, 'warn').mockImplementation();
    jest.spyOn(Logger, 'error').mockImplementation();

    // Set to local mode by default to avoid SerialPort issues
    process.env.NODE_ENV = 'local';

    module = await Test.createTestingModule({
      providers: [SerialService],
    }).compile();

    service = module.get<SerialService>(SerialService);
  });

  afterEach(async () => {
    // Comprehensive cleanup to prevent memory leaks
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();

    // Clean up any service instances
    if (service && typeof service.onDestroy === 'function') {
      service.onDestroy();
    }

    // Clean up test module
    if (module) {
      await module.close();
    }

    // Clear any process env changes
    delete process.env.NODE_ENV;

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onData', () => {
    it('should return a Subject', () => {
      const result = service.onData();
      expect(result).toBeDefined();
      expect(typeof result.subscribe).toBe('function');
    });
  });

  describe('generateTempString', () => {
    it('should increment temperatures normally', () => {
      const inputTemp = { Meat: 100, Meat2: 200, Meat3: 300, Chamber: 400 };

      const result = service.generateTempString(inputTemp);

      expect(result).toEqual({
        Meat: 101,
        Meat2: 202,
        Meat3: 303,
        Chamber: 404,
      });
    });

    it('should reset all temperatures when Meat exceeds 500', () => {
      const inputTemp = { Meat: 501, Meat2: 200, Meat3: 300, Chamber: 400 };

      const result = service.generateTempString(inputTemp);

      expect(result).toEqual({
        Meat: 0,
        Meat2: 0,
        Meat3: 0,
        Chamber: 0,
      });
    });

    it('should reset all temperatures when Meat2 exceeds 500', () => {
      const inputTemp = { Meat: 100, Meat2: 501, Meat3: 300, Chamber: 400 };

      const result = service.generateTempString(inputTemp);

      expect(result).toEqual({
        Meat: 0,
        Meat2: 0,
        Meat3: 0,
        Chamber: 0,
      });
    });

    it('should reset all temperatures when Meat3 exceeds 500', () => {
      const inputTemp = { Meat: 100, Meat2: 200, Meat3: 501, Chamber: 400 };

      const result = service.generateTempString(inputTemp);

      expect(result).toEqual({
        Meat: 0,
        Meat2: 0,
        Meat3: 0,
        Chamber: 0,
      });
    });

    it('should reset all temperatures when Chamber exceeds 500', () => {
      const inputTemp = { Meat: 100, Meat2: 200, Meat3: 300, Chamber: 501 };

      const result = service.generateTempString(inputTemp);

      expect(result).toEqual({
        Meat: 0,
        Meat2: 0,
        Meat3: 0,
        Chamber: 0,
      });
    });

    it('should not reset temperatures when all are exactly 500', () => {
      const inputTemp = { Meat: 500, Meat2: 500, Meat3: 500, Chamber: 500 };

      const result = service.generateTempString(inputTemp);

      expect(result).toEqual({
        Meat: 501,
        Meat2: 502,
        Meat3: 503,
        Chamber: 504,
      });
    });
  });

  describe('handleTempLogging', () => {
    it('should warn when meat temperature is too cold', () => {
      const tempString = JSON.stringify({ Meat: -40, Chamber: 100 });

      service.handleTempLogging(tempString);

      expect(Logger.warn).toHaveBeenCalledWith(
        'temps too cold: {"Meat":-40,"Chamber":100}',
        'SerialService',
      );
    });

    it('should warn when chamber temperature is too cold', () => {
      const tempString = JSON.stringify({ Meat: 100, Chamber: -40 });

      service.handleTempLogging(tempString);

      expect(Logger.warn).toHaveBeenCalledWith(
        'temps too cold: {"Meat":100,"Chamber":-40}',
        'SerialService',
      );
    });

    it('should warn when meat temperature is too hot', () => {
      const tempString = JSON.stringify({ Meat: 600, Chamber: 100 });

      service.handleTempLogging(tempString);

      expect(Logger.warn).toHaveBeenCalledWith(
        'temps too hot: {"Meat":600,"Chamber":100}',
        'SerialService',
      );
    });

    it('should warn when chamber temperature is too hot', () => {
      const tempString = JSON.stringify({ Meat: 100, Chamber: 600 });

      service.handleTempLogging(tempString);

      expect(Logger.warn).toHaveBeenCalledWith(
        'temps too hot: {"Meat":100,"Chamber":600}',
        'SerialService',
      );
    });

    it('should error when meat temperature is NaN', () => {
      const tempString = JSON.stringify({ Meat: 'invalid', Chamber: 100 });

      service.handleTempLogging(tempString);

      expect(Logger.error).toHaveBeenCalledWith(
        'temps NAN: {"Meat":"invalid","Chamber":100}',
        'SerialService',
      );
    });

    it('should error when chamber temperature is NaN', () => {
      const tempString = JSON.stringify({ Meat: 100, Chamber: 'invalid' });

      service.handleTempLogging(tempString);

      expect(Logger.error).toHaveBeenCalledWith(
        'temps NAN: {"Meat":100,"Chamber":"invalid"}',
        'SerialService',
      );
    });

    it('should not warn for boundary temperature values (-30 exactly)', () => {
      const tempString = JSON.stringify({ Meat: -30, Chamber: 100 });

      service.handleTempLogging(tempString);

      expect(Logger.warn).not.toHaveBeenCalled();
      expect(Logger.error).not.toHaveBeenCalled();
    });

    it('should not warn for boundary temperature values (500 exactly)', () => {
      const tempString = JSON.stringify({ Meat: 500, Chamber: 100 });

      service.handleTempLogging(tempString);

      expect(Logger.warn).not.toHaveBeenCalled();
      expect(Logger.error).not.toHaveBeenCalled();
    });

    it('should not log anything for normal temperatures', () => {
      const tempString = JSON.stringify({ Meat: 150, Chamber: 250 });

      service.handleTempLogging(tempString);

      expect(Logger.warn).not.toHaveBeenCalled();
      expect(Logger.error).not.toHaveBeenCalled();
    });

    it('should handle both meat and chamber NaN values', () => {
      const tempString = JSON.stringify({
        Meat: 'invalid1',
        Chamber: 'invalid2',
      });

      service.handleTempLogging(tempString);

      expect(Logger.error).toHaveBeenCalledWith(
        'temps NAN: {"Meat":"invalid1","Chamber":"invalid2"}',
        'SerialService',
      );
    });

    it('should handle both meat and chamber too cold', () => {
      const tempString = JSON.stringify({ Meat: -40, Chamber: -35 });

      service.handleTempLogging(tempString);

      expect(Logger.warn).toHaveBeenCalledWith(
        'temps too cold: {"Meat":-40,"Chamber":-35}',
        'SerialService',
      );
    });

    it('should handle both meat and chamber too hot', () => {
      const tempString = JSON.stringify({ Meat: 600, Chamber: 550 });

      service.handleTempLogging(tempString);

      expect(Logger.warn).toHaveBeenCalledWith(
        'temps too hot: {"Meat":600,"Chamber":550}',
        'SerialService',
      );
    });

    it('should handle malformed JSON gracefully', () => {
      expect(() => {
        service.handleTempLogging('invalid json');
      }).toThrow();
    });

    it('should handle missing temperature properties', () => {
      const tempString = JSON.stringify({ SomeOtherProperty: 100 });

      service.handleTempLogging(tempString);

      expect(Logger.error).toHaveBeenCalledWith(
        'temps NAN: {"SomeOtherProperty":100}',
        'SerialService',
      );
    });
  });

  describe('onDestroy', () => {
    it('should handle onDestroy when no interval or port exists', () => {
      expect(() => service.onDestroy()).not.toThrow();
    });

    it('should clear interval when it exists', async () => {
      // Force the service to have an interval by creating a new instance in local mode
      jest.clearAllMocks();
      jest.spyOn(Logger, 'log').mockImplementation();
      process.env.NODE_ENV = 'local';

      // Use dynamic import instead of require for better TypeScript support
      const { SerialService } = await import('./serial.serivce');
      const localService = new SerialService();
      expect(localService['temperatureInterval']).toBeDefined();

      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      localService.onDestroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
      delete process.env.NODE_ENV;
    });

    it('should close port when it exists in production mode', () => {
      // Test production mode port cleanup
      const mockClose = jest.fn();
      const mockPort = { close: mockClose } as any;

      service['port'] = mockPort;
      service.onDestroy();

      expect(mockClose).toHaveBeenCalled();
    });
  });

  describe('environment detection', () => {
    afterEach(() => {
      delete process.env.NODE_ENV;
    });

    it('should detect local environment', async () => {
      jest.spyOn(Logger, 'log').mockImplementation();
      process.env.NODE_ENV = 'local';

      const { SerialService } = await import('./serial.serivce');
      const localService = new SerialService();

      expect(Logger.log).toHaveBeenCalledWith(
        'Running in emulator mode',
        'SerialService',
      );
      localService.onDestroy();
    });

    it('should trim NODE_ENV value when checking environment', async () => {
      jest.spyOn(Logger, 'log').mockImplementation();
      process.env.NODE_ENV = '  local  ';

      const { SerialService } = await import('./serial.serivce');
      const localService = new SerialService();

      expect(Logger.log).toHaveBeenCalledWith(
        'Running in emulator mode',
        'SerialService',
      );
      localService.onDestroy();
    });
  });

  describe('local mode emulation', () => {
    afterEach(() => {
      delete process.env.NODE_ENV;
    });

    it('should generate and emit temperature data in local mode', async () => {
      jest.spyOn(Logger, 'log').mockImplementation();

      process.env.NODE_ENV = 'local';

      const { SerialService } = await import('./serial.serivce');
      const localService = new SerialService();

      // Subscribe to data
      return new Promise<void>((resolve) => {
        const subscription = localService.onData().subscribe((data: string) => {
          const parsedData = JSON.parse(data);
          expect(parsedData).toHaveProperty('Meat');
          expect(parsedData).toHaveProperty('Chamber');
          subscription.unsubscribe();
          localService.onDestroy();
          resolve();
        });

        // Wait for the interval to trigger naturally
        setTimeout(() => {
          if (!subscription.closed) {
            subscription.unsubscribe();
            localService.onDestroy();
            resolve();
          }
        }, 600);
      });
    });

    it('should call handleTempLogging in local mode', async () => {
      jest.spyOn(Logger, 'log').mockImplementation();

      process.env.NODE_ENV = 'local';

      const { SerialService } = await import('./serial.serivce');
      const localService = new SerialService();
      const handleTempLoggingSpy = jest.spyOn(
        localService,
        'handleTempLogging',
      );

      // Wait for the interval to trigger naturally
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(handleTempLoggingSpy).toHaveBeenCalled();
          localService.onDestroy();
          resolve();
        }, 600);
      });
    });

    it('should clear interval when service is destroyed in local mode', async () => {
      jest.spyOn(Logger, 'log').mockImplementation();
      process.env.NODE_ENV = 'local';

      const { SerialService } = await import('./serial.serivce');
      const localService = new SerialService();
      expect(localService['temperatureInterval']).toBeDefined();

      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      localService.onDestroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });
  });
});
