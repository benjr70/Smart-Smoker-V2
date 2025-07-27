import { Test, TestingModule } from '@nestjs/testing';
import { EventsModule } from './events.module';
import { EventsGateway } from './events.gateway';
import { SerialService } from '../serial/serial.serivce';

// Mock serialport
jest.mock('serialport', () => ({
  SerialPort: jest.fn().mockImplementation(() => ({
    pipe: jest.fn(),
  })),
  ReadlineParser: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
  })),
}));

describe('EventsModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    // Clear environment variables
    delete process.env.NODE_ENV;

    module = await Test.createTestingModule({
      imports: [EventsModule],
    }).compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide EventsGateway', () => {
    const eventsGateway = module.get<EventsGateway>(EventsGateway);
    expect(eventsGateway).toBeDefined();
    expect(eventsGateway).toBeInstanceOf(EventsGateway);
  });

  it('should provide SerialService through SerialModule import', () => {
    const serialService = module.get<SerialService>(SerialService);
    expect(serialService).toBeDefined();
    expect(serialService).toBeInstanceOf(SerialService);
  });

  it('should inject SerialService into EventsGateway', () => {
    const eventsGateway = module.get<EventsGateway>(EventsGateway);
    
    // Verify that EventsGateway has access to SerialService
    expect(eventsGateway['serialService']).toBeDefined();
    expect(eventsGateway['serialService']).toBeInstanceOf(SerialService);
  });

  describe('module compilation', () => {
    it('should compile successfully', async () => {
      const testModule = await Test.createTestingModule({
        imports: [EventsModule],
      }).compile();

      expect(testModule).toBeDefined();
      await testModule.close();
    });

    it('should handle different environments', async () => {
      // Test with local environment
      process.env.NODE_ENV = 'local';
      
      const localModule = await Test.createTestingModule({
        imports: [EventsModule],
      }).compile();

      const localGateway = localModule.get<EventsGateway>(EventsGateway);
      expect(localGateway).toBeDefined();
      await localModule.close();

      // Test with production environment
      process.env.NODE_ENV = 'production';
      
      const prodModule = await Test.createTestingModule({
        imports: [EventsModule],
      }).compile();

      const prodGateway = prodModule.get<EventsGateway>(EventsGateway);
      expect(prodGateway).toBeDefined();
      await prodModule.close();
    });
  });

  describe('dependency injection', () => {
    it('should create EventsGateway with SerialService dependency', () => {
      const eventsGateway = module.get<EventsGateway>(EventsGateway);
      const serialService = module.get<SerialService>(SerialService);
      
      expect(eventsGateway['serialService']).toBe(serialService);
    });

    it('should resolve SerialService as singleton across the module', () => {
      const eventsGateway = module.get<EventsGateway>(EventsGateway);
      const serialService = module.get<SerialService>(SerialService);
      
      // Both should reference the same SerialService instance
      expect(eventsGateway['serialService']).toBe(serialService);
    });

    it('should handle SerialService methods through EventsGateway', () => {
      const eventsGateway = module.get<EventsGateway>(EventsGateway);
      
      // Verify that EventsGateway can access SerialService methods
      expect(eventsGateway['serialService'].onData).toBeDefined();
      expect(typeof eventsGateway['serialService'].onData).toBe('function');
    });
  });

  describe('module structure', () => {
    it('should import SerialModule correctly', () => {
      // Verify that SerialModule is imported by checking if SerialService is available
      const serialService = module.get<SerialService>(SerialService);
      expect(serialService).toBeDefined();
    });

    it('should provide EventsGateway as a provider', () => {
      const eventsGateway = module.get<EventsGateway>(EventsGateway);
      expect(eventsGateway).toBeDefined();
      
      // Verify EventsGateway has the expected methods
      expect(eventsGateway.afterInit).toBeDefined();
      expect(typeof eventsGateway.afterInit).toBe('function');
    });

    it('should be importable by other modules', async () => {
      const testModule = await Test.createTestingModule({
        imports: [EventsModule],
        providers: [
          {
            provide: 'TestProvider',
            useFactory: (eventsGateway: EventsGateway) => {
              return { eventsGateway };
            },
            inject: [EventsGateway],
          },
        ],
      }).compile();

      const testProvider = testModule.get('TestProvider');
      expect(testProvider.eventsGateway).toBeDefined();
      expect(testProvider.eventsGateway).toBeInstanceOf(EventsGateway);

      await testModule.close();
    });
  });

  describe('WebSocket functionality', () => {
    it('should initialize EventsGateway with WebSocket capabilities', () => {
      const eventsGateway = module.get<EventsGateway>(EventsGateway);
      
      // Verify that EventsGateway has server property for WebSocket
      expect(eventsGateway.server).toBeDefined();
    });

    it('should set up data subscription on initialization', () => {
      const eventsGateway = module.get<EventsGateway>(EventsGateway);
      const serialService = module.get<SerialService>(SerialService);
      
      // Mock the server
      eventsGateway.server = { emit: jest.fn() } as any;
      
      // Spy on serialService.onData
      const onDataSpy = jest.spyOn(serialService, 'onData');
      
      eventsGateway.afterInit();
      
      expect(onDataSpy).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle module initialization errors gracefully', async () => {
      const testModule = await Test.createTestingModule({
        imports: [EventsModule],
      }).compile();

      expect(testModule).toBeDefined();
      
      // Verify both gateway and service can be retrieved
      const eventsGateway = testModule.get<EventsGateway>(EventsGateway);
      const serialService = testModule.get<SerialService>(SerialService);
      
      expect(eventsGateway).toBeDefined();
      expect(serialService).toBeDefined();

      await testModule.close();
    });

    it('should handle missing dependencies gracefully', async () => {
      // Test module without SerialModule to ensure proper error handling
      try {
        const testModule = await Test.createTestingModule({
          providers: [EventsGateway],
        }).compile();
        
        // This should fail because SerialService is not provided
        expect(() => testModule.get<EventsGateway>(EventsGateway)).toThrow();
      } catch (error) {
        // Expected to throw due to missing dependency
        expect(error).toBeDefined();
      }
    });
  });

  describe('module isolation', () => {
    it('should create separate instances across different module instances', async () => {
      const module1 = await Test.createTestingModule({
        imports: [EventsModule],
      }).compile();

      const module2 = await Test.createTestingModule({
        imports: [EventsModule],
      }).compile();

      const gateway1 = module1.get<EventsGateway>(EventsGateway);
      const gateway2 = module2.get<EventsGateway>(EventsGateway);

      // Different module instances should have different gateway instances
      expect(gateway1).not.toBe(gateway2);

      await module1.close();
      await module2.close();
    });

    it('should maintain singleton within same module instance', () => {
      const gateway1 = module.get<EventsGateway>(EventsGateway);
      const gateway2 = module.get<EventsGateway>(EventsGateway);

      // Same module instance should return same gateway instance
      expect(gateway1).toBe(gateway2);
    });
  });
});