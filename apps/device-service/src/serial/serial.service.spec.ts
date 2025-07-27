// Mock serialport BEFORE any imports - this is crucial for proper mocking
jest.mock('serialport', () => {
  const mockPort = {
    pipe: jest.fn().mockReturnThis(),
    close: jest.fn(),
    removeAllListeners: jest.fn(),
  };
  
  const mockParser = {
    on: jest.fn(),
    removeAllListeners: jest.fn(),
  };
  
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
const mockParser = {
  on: jest.fn(),
  removeAllListeners: jest.fn(),
};

const mockPort = {
  pipe: jest.fn().mockReturnThis(),
  close: jest.fn(),
  removeAllListeners: jest.fn(),
};

// Global cleanup to prevent memory leaks
global.beforeEach = global.beforeEach || function() {};
global.afterEach = global.afterEach || function() {};

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

    it('should error when meat temperature is NaN', () => {
      const tempString = JSON.stringify({ Meat: 'invalid', Chamber: 100 });
      
      service.handleTempLogging(tempString);

      expect(Logger.error).toHaveBeenCalledWith(
        'temps NAN: {"Meat":"invalid","Chamber":100}',
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

  describe('onDestroy', () => {
    it('should handle onDestroy when no interval or port exists', () => {
      expect(() => service.onDestroy()).not.toThrow();
    });
  });
});