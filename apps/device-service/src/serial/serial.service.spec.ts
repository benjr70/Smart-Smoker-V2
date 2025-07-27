import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { SerialService } from './serial.serivce';

// Mock serialport
jest.mock('serialport');

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
});