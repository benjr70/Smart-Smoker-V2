import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { SerialService } from './serial.serivce';
import { SerialPort, ReadlineParser } from 'serialport';
import { Subject } from 'rxjs';

// Mock serialport
jest.mock('serialport', () => ({
  SerialPort: jest.fn().mockImplementation(() => ({
    pipe: jest.fn(),
  })),
  ReadlineParser: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
  })),
}));

describe('SerialService', () => {
  let service: SerialService;
  let mockSerialPort: jest.Mocked<SerialPort>;
  let mockParser: jest.Mocked<ReadlineParser>;

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Only use fake timers when needed
    if (!jest.isMockFunction(setTimeout)) {
      jest.useFakeTimers();
    }

    // Mock Logger methods
    jest.spyOn(Logger, 'log').mockImplementation();
    jest.spyOn(Logger, 'debug').mockImplementation();
    jest.spyOn(Logger, 'warn').mockImplementation();
    jest.spyOn(Logger, 'error').mockImplementation();

    // Reset environment variable
    delete process.env.NODE_ENV;

    mockParser = {
      on: jest.fn(),
    } as any;

    mockSerialPort = {
      pipe: jest.fn(),
    } as any;

    (ReadlineParser as unknown as jest.Mock).mockReturnValue(mockParser);
    (SerialPort as unknown as jest.Mock).mockReturnValue(mockSerialPort);

    const module: TestingModule = await Test.createTestingModule({
      providers: [SerialService],
    }).compile();

    service = module.get<SerialService>(SerialService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize in local mode when NODE_ENV is local', async () => {
      // Set environment to local
      process.env.NODE_ENV = 'local';

      const module: TestingModule = await Test.createTestingModule({
        providers: [SerialService],
      }).compile();

      const localService = module.get<SerialService>(SerialService);

      expect(Logger.log).toHaveBeenCalledWith('Running in emulator mode', 'SerialService');
      expect(localService).toBeDefined();
    });

    it('should initialize in production mode when NODE_ENV is not local', async () => {
      // Set environment to production
      process.env.NODE_ENV = 'production';

      const module: TestingModule = await Test.createTestingModule({
        providers: [SerialService],
      }).compile();

      const prodService = module.get<SerialService>(SerialService);

      expect(Logger.log).toHaveBeenCalledWith('Running in production mode', 'SerialService');
      expect(SerialPort).toHaveBeenCalledWith({
        path: '/dev/ttyS0',
        baudRate: 9600,
      });
      expect(mockSerialPort.pipe).toHaveBeenCalledWith(mockParser);
      expect(prodService).toBeDefined();
    });

    it('should handle empty NODE_ENV as production mode', async () => {
      process.env.NODE_ENV = '';

      const module: TestingModule = await Test.createTestingModule({
        providers: [SerialService],
      }).compile();

      const service = module.get<SerialService>(SerialService);

      expect(Logger.log).toHaveBeenCalledWith('Running in production mode', 'SerialService');
      expect(service).toBeDefined();
    });

    it('should trim whitespace from NODE_ENV', async () => {
      process.env.NODE_ENV = '  local  ';

      const module: TestingModule = await Test.createTestingModule({
        providers: [SerialService],
      }).compile();

      const service = module.get<SerialService>(SerialService);

      expect(Logger.log).toHaveBeenCalledWith('Running in emulator mode', 'SerialService');
      expect(service).toBeDefined();
    });
  });

  describe('onData', () => {
    it('should return a Subject', () => {
      const result = service.onData();
      expect(result).toBeInstanceOf(Subject);
    });

    it('should return the same Subject instance', () => {
      const result1 = service.onData();
      const result2 = service.onData();
      expect(result1).toBe(result2);
    });
  });

  describe('handleTempLogging', () => {
    it('should warn when meat temperature is too cold', () => {
      const tempString = JSON.stringify({ Meat: -40, Chamber: 100 });
      
      service.handleTempLogging(tempString);

      expect(Logger.warn).toHaveBeenCalledWith(
        'temps too cold: {"Meat":-40,"Chamber":100}',
        'SerialService'
      );
    });

    it('should warn when chamber temperature is too cold', () => {
      const tempString = JSON.stringify({ Meat: 100, Chamber: -40 });
      
      service.handleTempLogging(tempString);

      expect(Logger.warn).toHaveBeenCalledWith(
        'temps too cold: {"Meat":100,"Chamber":-40}',
        'SerialService'
      );
    });

    it('should error when meat temperature is NaN', () => {
      const tempString = JSON.stringify({ Meat: 'invalid', Chamber: 100 });
      
      service.handleTempLogging(tempString);

      expect(Logger.error).toHaveBeenCalledWith(
        'temps NAN: {"Meat":"invalid","Chamber":100}',
        'SerialService'
      );
    });

    it('should error when chamber temperature is NaN', () => {
      const tempString = JSON.stringify({ Meat: 100, Chamber: 'invalid' });
      
      service.handleTempLogging(tempString);

      expect(Logger.error).toHaveBeenCalledWith(
        'temps NAN: {"Meat":100,"Chamber":"invalid"}',
        'SerialService'
      );
    });

    it('should warn when meat temperature is too hot', () => {
      const tempString = JSON.stringify({ Meat: 600, Chamber: 100 });
      
      service.handleTempLogging(tempString);

      expect(Logger.warn).toHaveBeenCalledWith(
        'temps too hot: {"Meat":600,"Chamber":100}',
        'SerialService'
      );
    });

    it('should warn when chamber temperature is too hot', () => {
      const tempString = JSON.stringify({ Meat: 100, Chamber: 600 });
      
      service.handleTempLogging(tempString);

      expect(Logger.warn).toHaveBeenCalledWith(
        'temps too hot: {"Meat":100,"Chamber":600}',
        'SerialService'
      );
    });

    it('should not log anything for normal temperatures', () => {
      const tempString = JSON.stringify({ Meat: 150, Chamber: 250 });
      
      service.handleTempLogging(tempString);

      expect(Logger.warn).not.toHaveBeenCalled();
      expect(Logger.error).not.toHaveBeenCalled();
    });

    it('should handle edge case temperatures at boundaries', () => {
      // Test boundary values
      service.handleTempLogging(JSON.stringify({ Meat: -30, Chamber: 100 }));
      expect(Logger.warn).not.toHaveBeenCalled();

      service.handleTempLogging(JSON.stringify({ Meat: 500, Chamber: 100 }));
      expect(Logger.warn).not.toHaveBeenCalled();

      service.handleTempLogging(JSON.stringify({ Meat: -31, Chamber: 100 }));
      expect(Logger.warn).toHaveBeenCalledWith(
        'temps too cold: {"Meat":-31,"Chamber":100}',
        'SerialService'
      );

      service.handleTempLogging(JSON.stringify({ Meat: 501, Chamber: 100 }));
      expect(Logger.warn).toHaveBeenCalledWith(
        'temps too hot: {"Meat":501,"Chamber":100}',
        'SerialService'
      );
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

    it('should handle boundary case at exactly 500', () => {
      const inputTemp = { Meat: 500, Meat2: 500, Meat3: 500, Chamber: 500 };
      
      const result = service.generateTempString(inputTemp);

      expect(result).toEqual({
        Meat: 501,
        Meat2: 502,
        Meat3: 503,
        Chamber: 504,
      });
    });

    it('should handle zero temperatures', () => {
      const inputTemp = { Meat: 0, Meat2: 0, Meat3: 0, Chamber: 0 };
      
      const result = service.generateTempString(inputTemp);

      expect(result).toEqual({
        Meat: 1,
        Meat2: 2,
        Meat3: 3,
        Chamber: 4,
      });
    });

    it('should handle negative temperatures', () => {
      const inputTemp = { Meat: -10, Meat2: -20, Meat3: -30, Chamber: -40 };
      
      const result = service.generateTempString(inputTemp);

      expect(result).toEqual({
        Meat: -9,
        Meat2: -18,
        Meat3: -27,
        Chamber: -36,
      });
    });
  });

  describe('production mode data handling', () => {
    beforeEach(async () => {
      process.env.NODE_ENV = 'production';

      const module: TestingModule = await Test.createTestingModule({
        providers: [SerialService],
      }).compile();

      service = module.get<SerialService>(SerialService);
    });

    it('should handle serial data in production mode', () => {
      const testData = '{"Meat":150,"Chamber":250}';
      const mockData = {
        toString: jest.fn().mockReturnValue(testData),
      };

      // Get the data callback that was registered
      const dataCallback = mockParser.on.mock.calls.find(call => call[0] === 'data')[1];
      
      // Spy on the dataSubject.next method
      const nextSpy = jest.spyOn(service['dataSubject'], 'next');

      // Simulate serial data
      dataCallback(mockData);

      expect(Logger.debug).toHaveBeenCalledWith(`raw data ${mockData}`, 'SerialService');
      expect(nextSpy).toHaveBeenCalledWith(testData);
    });

    it('should handle errors in production mode data parsing', () => {
      const mockData = {
        toString: jest.fn().mockImplementation(() => {
          throw new Error('Parse error');
        }),
      };

      // Get the data callback that was registered
      const dataCallback = mockParser.on.mock.calls.find(call => call[0] === 'data')[1];

      // Simulate serial data with error
      dataCallback(mockData);

      expect(Logger.error).toHaveBeenCalledWith(expect.any(Error), 'SerialService');
    });
  });

  describe('local mode timer behavior', () => {
    beforeEach(async () => {
      process.env.NODE_ENV = 'local';

      const module: TestingModule = await Test.createTestingModule({
        providers: [SerialService],
      }).compile();

      service = module.get<SerialService>(SerialService);
    });

    it('should emit temperature data every 500ms in local mode', () => {
      const nextSpy = jest.spyOn(service['dataSubject'], 'next');
      const handleTempLoggingSpy = jest.spyOn(service, 'handleTempLogging');

      // Fast-forward time by 500ms
      jest.advanceTimersByTime(500);

      expect(nextSpy).toHaveBeenCalledTimes(1);
      expect(handleTempLoggingSpy).toHaveBeenCalledTimes(1);

      // Fast-forward another 500ms
      jest.advanceTimersByTime(500);

      expect(nextSpy).toHaveBeenCalledTimes(2);
      expect(handleTempLoggingSpy).toHaveBeenCalledTimes(2);
    });

    it('should generate progressive temperature data over time', () => {
      const nextSpy = jest.spyOn(service['dataSubject'], 'next');

      // First interval
      jest.advanceTimersByTime(500);
      const firstCall = JSON.parse(nextSpy.mock.calls[0][0]);
      expect(firstCall).toEqual({ Meat: 1, Meat2: 2, Meat3: 3, Chamber: 4 });

      // Second interval
      jest.advanceTimersByTime(500);
      const secondCall = JSON.parse(nextSpy.mock.calls[1][0]);
      expect(secondCall).toEqual({ Meat: 2, Meat2: 4, Meat3: 6, Chamber: 8 });
    });

    it('should reset temperatures when they exceed 500 in local mode', () => {
      const nextSpy = jest.spyOn(service['dataSubject'], 'next');

      // Advance time to reach temperature > 500
      // Initial: {0,0,0,0} -> after 125 intervals: {125, 250, 375, 500}
      // After 126 intervals: {126, 252, 378, 504} -> exceeds 500 for Chamber
      jest.advanceTimersByTime(500 * 126);

      // Check the last emitted value
      const lastCall = JSON.parse(nextSpy.mock.calls[nextSpy.mock.calls.length - 1][0]);
      
      // Should be reset to 1,2,3,4 since temperatures exceeded 500
      expect(lastCall).toEqual({ Meat: 1, Meat2: 2, Meat3: 3, Chamber: 4 });
    });
  });
});