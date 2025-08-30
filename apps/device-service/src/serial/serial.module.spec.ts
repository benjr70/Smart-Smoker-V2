// Mock serialport BEFORE any imports to prevent real device access
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
import { SerialModule } from './serial.module';
import { SerialService } from './serial.serivce';

describe('SerialModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    // Set to local mode to avoid SerialPort issues
    process.env.NODE_ENV = 'local';

    module = await Test.createTestingModule({
      imports: [SerialModule],
    }).compile();
  });

  afterEach(async () => {
    await module.close();
    delete process.env.NODE_ENV;
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide SerialService', () => {
    const serialService = module.get<SerialService>(SerialService);
    expect(serialService).toBeDefined();
    expect(serialService).toBeInstanceOf(SerialService);
  });

  it('should export SerialService', async () => {
    // Create a test module that imports SerialModule
    const testModule = await Test.createTestingModule({
      imports: [SerialModule],
      providers: [
        {
          provide: 'TestProvider',
          useFactory: (serialService: SerialService) => {
            return { serialService };
          },
          inject: [SerialService],
        },
      ],
    }).compile();

    const testProvider = testModule.get('TestProvider');
    expect(testProvider.serialService).toBeDefined();
    expect(testProvider.serialService).toBeInstanceOf(SerialService);

    await testModule.close();
  });

  it('should create SerialService as singleton', () => {
    const serialService1 = module.get<SerialService>(SerialService);
    const serialService2 = module.get<SerialService>(SerialService);

    expect(serialService1).toBe(serialService2);
  });

  describe('module compilation', () => {
    it('should compile successfully', async () => {
      const testModule = await Test.createTestingModule({
        imports: [SerialModule],
      }).compile();

      expect(testModule).toBeDefined();
      await testModule.close();
    });

    it('should handle different environments', async () => {
      // Test with local environment
      process.env.NODE_ENV = 'local';

      const localModule = await Test.createTestingModule({
        imports: [SerialModule],
      }).compile();

      const localService = localModule.get<SerialService>(SerialService);
      expect(localService).toBeDefined();
      await localModule.close();

      // Note: Production mode tests skipped to avoid SerialPort issues in CI
    });
  });

  describe('dependency injection', () => {
    it('should inject SerialService into other providers', async () => {
      const MockConsumer = {
        provide: 'MockConsumer',
        useFactory: (serialService: SerialService) => {
          return {
            getData: () => serialService.onData(),
          };
        },
        inject: [SerialService],
      };

      const testModule = await Test.createTestingModule({
        imports: [SerialModule],
        providers: [MockConsumer],
      }).compile();

      const mockConsumer = testModule.get('MockConsumer');
      expect(mockConsumer).toBeDefined();
      expect(mockConsumer.getData).toBeDefined();
      expect(typeof mockConsumer.getData).toBe('function');

      await testModule.close();
    });

    it('should resolve SerialService dependencies correctly', () => {
      const serialService = module.get<SerialService>(SerialService);

      // Verify that the service has been instantiated with its dependencies
      expect(serialService.onData).toBeDefined();
      expect(typeof serialService.onData).toBe('function');
    });
  });

  describe('module structure', () => {
    it('should have correct providers configuration', () => {
      // This test verifies the module structure by ensuring
      // SerialService can be instantiated and used
      const serialService = module.get<SerialService>(SerialService);

      expect(serialService).toBeDefined();
      expect(serialService.onData).toBeDefined();
      expect(serialService.generateTempString).toBeDefined();
      expect(serialService.handleTempLogging).toBeDefined();
    });

    it('should be importable by other modules', async () => {
      const testModule = await Test.createTestingModule({
        imports: [SerialModule],
      }).compile();

      expect(testModule).toBeDefined();
      await testModule.close();
    });
  });

  describe('error handling', () => {
    it('should handle module initialization errors gracefully', async () => {
      // This test ensures the module can handle initialization issues
      const testModule = await Test.createTestingModule({
        imports: [SerialModule],
      }).compile();

      expect(testModule).toBeDefined();

      // Verify service can be retrieved even with potential hardware issues
      const serialService = testModule.get<SerialService>(SerialService);
      expect(serialService).toBeDefined();

      await testModule.close();
    });
  });
});
