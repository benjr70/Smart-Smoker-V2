import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { SerialService } from './serial.serivce';

// Mock serialport with proper cleanup
const mockParser = {
  on: jest.fn(),
  removeAllListeners: jest.fn(),
};

const mockPort = {
  pipe: jest.fn(),
  close: jest.fn(),
  removeAllListeners: jest.fn(),
};

jest.mock('serialport', () => ({
  SerialPort: jest.fn().mockImplementation(() => mockPort),
  ReadlineParser: jest.fn().mockImplementation(() => mockParser),
}));

describe('SerialService', () => {
  let service: SerialService;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Mock Logger methods
    jest.spyOn(Logger, 'log').mockImplementation();
    jest.spyOn(Logger, 'debug').mockImplementation();
    jest.spyOn(Logger, 'warn').mockImplementation();
    jest.spyOn(Logger, 'error').mockImplementation();

    // Reset environment variable
    delete process.env.NODE_ENV;

    const module: TestingModule = await Test.createTestingModule({
      providers: [SerialService],
    }).compile();

    service = module.get<SerialService>(SerialService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    
    // Clean up any service instances to prevent memory leaks
    if (service && typeof service.onDestroy === 'function') {
      service.onDestroy();
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('constructor', () => {
    it('should initialize in local mode when NODE_ENV is local', async () => {
      process.env.NODE_ENV = 'local';

      const module: TestingModule = await Test.createTestingModule({
        providers: [SerialService],
      }).compile();

      const localService = module.get<SerialService>(SerialService);

      expect(Logger.log).toHaveBeenCalledWith('Running in emulator mode', 'SerialService');
      expect(localService).toBeDefined();
    });

    it('should initialize in production mode when NODE_ENV is not local', async () => {
      process.env.NODE_ENV = 'production';

      const module: TestingModule = await Test.createTestingModule({
        providers: [SerialService],
      }).compile();

      const prodService = module.get<SerialService>(SerialService);

      expect(Logger.log).toHaveBeenCalledWith('Running in production mode', 'SerialService');
      expect(prodService).toBeDefined();
    });

    it('should handle production mode data parsing errors', async () => {
      process.env.NODE_ENV = 'production';

      const module: TestingModule = await Test.createTestingModule({
        providers: [SerialService],
      }).compile();

      const prodService = module.get<SerialService>(SerialService);

      // Get the data handler function
      const dataHandler = mockParser.on.mock.calls.find(call => call[0] === 'data')[1];

      // Simulate error in data processing
      const mockData = { toString: () => { throw new Error('Parse error'); } };
      dataHandler(mockData);

      expect(Logger.error).toHaveBeenCalledWith(
        expect.any(Error),
        'SerialService'
      );
    });

    it('should handle production mode data processing successfully', async () => {
      process.env.NODE_ENV = 'production';

      const module: TestingModule = await Test.createTestingModule({
        providers: [SerialService],
      }).compile();

      const prodService = module.get<SerialService>(SerialService);

      // Get the data handler function
      const dataHandler = mockParser.on.mock.calls.find(call => call[0] === 'data')[1];

      // Simulate successful data processing
      const mockData = { toString: () => '{"Meat": 150, "Chamber": 200}' };
      dataHandler(mockData);

      expect(Logger.debug).toHaveBeenCalledWith(
        'raw data {"Meat": 150, "Chamber": 200}',
        'SerialService'
      );
    });
  });

  describe('onData', () => {
    it('should return a Subject', () => {
      const result = service.onData();
      expect(result).toBeDefined();
      expect(typeof result.subscribe).toBe('function');
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

    it('should warn when temperatures are too hot', () => {
      const tempString = JSON.stringify({ Meat: 600, Chamber: 100 });
      
      service.handleTempLogging(tempString);

      expect(Logger.warn).toHaveBeenCalledWith(
        'temps too hot: {"Meat":600,"Chamber":100}',
        'SerialService'
      );
    });

    it('should not log anything for normal temperatures', () => {
      const tempString = JSON.stringify({ Meat: 150, Chamber: 250 });
      
      service.handleTempLogging(tempString);

      expect(Logger.warn).not.toHaveBeenCalled();
      expect(Logger.error).not.toHaveBeenCalled();
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

    it('should reset all temperatures when any exceeds 500', () => {
      const inputTemp = { Meat: 501, Meat2: 200, Meat3: 300, Chamber: 400 };
      
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
  });

  describe('onDestroy', () => {
    it('should clear interval in local mode', () => {
      process.env.NODE_ENV = 'local';
      
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      // Create a new service instance in local mode
      const localService = new (require('./serial.serivce').SerialService)();
      
      // Call onDestroy
      localService.onDestroy();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
      
      clearIntervalSpy.mockRestore();
    });

    it('should close port in production mode', () => {
      process.env.NODE_ENV = 'production';
      
      // Create a new service instance in production mode
      const prodService = new (require('./serial.serivce').SerialService)();
      
      // Mock the port close method
      prodService.port = { close: jest.fn() };
      
      // Call onDestroy
      prodService.onDestroy();
      
      expect(prodService.port.close).toHaveBeenCalled();
    });

    it('should handle onDestroy when no interval or port exists', () => {
      // This should not throw an error
      expect(() => service.onDestroy()).not.toThrow();
    });
  });
});