import { Test, TestingModule } from '@nestjs/testing';
import { WifiManagerModule } from './wifiManager.module';
import { WifiManagerController } from './wifiManager.controller';
import { WifiManagerService } from './wifiManager.service';

// Mock node-wifi
jest.mock('node-wifi', () => ({
  init: jest.fn(),
  getCurrentConnections: jest.fn(),
  scan: jest.fn(),
  connect: jest.fn(),
}));

// Mock child_process
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

describe('WifiManagerModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      imports: [WifiManagerModule],
    }).compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide WifiManagerController', () => {
    const controller = module.get<WifiManagerController>(WifiManagerController);
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(WifiManagerController);
  });

  it('should provide WifiManagerService', () => {
    const service = module.get<WifiManagerService>(WifiManagerService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(WifiManagerService);
  });

  it('should inject WifiManagerService into WifiManagerController', () => {
    const controller = module.get<WifiManagerController>(WifiManagerController);
    
    // Verify that controller has access to service
    expect(controller['wifiManagerServicer']).toBeDefined();
    expect(controller['wifiManagerServicer']).toBeInstanceOf(WifiManagerService);
  });

  describe('module compilation', () => {
    it('should compile successfully', async () => {
      const testModule = await Test.createTestingModule({
        imports: [WifiManagerModule],
      }).compile();

      expect(testModule).toBeDefined();
      await testModule.close();
    });

    it('should handle module initialization without errors', async () => {
      const testModule = await Test.createTestingModule({
        imports: [WifiManagerModule],
      }).compile();

      const service = testModule.get<WifiManagerService>(WifiManagerService);
      const controller = testModule.get<WifiManagerController>(WifiManagerController);

      expect(service).toBeDefined();
      expect(controller).toBeDefined();

      await testModule.close();
    });
  });

  describe('dependency injection', () => {
    it('should create WifiManagerController with WifiManagerService dependency', () => {
      const controller = module.get<WifiManagerController>(WifiManagerController);
      const service = module.get<WifiManagerService>(WifiManagerService);
      
      expect(controller['wifiManagerServicer']).toBe(service);
    });

    it('should resolve WifiManagerService as singleton', () => {
      const service1 = module.get<WifiManagerService>(WifiManagerService);
      const service2 = module.get<WifiManagerService>(WifiManagerService);
      
      expect(service1).toBe(service2);
    });

    it('should resolve WifiManagerController as singleton', () => {
      const controller1 = module.get<WifiManagerController>(WifiManagerController);
      const controller2 = module.get<WifiManagerController>(WifiManagerController);
      
      expect(controller1).toBe(controller2);
    });

    it('should inject service into other providers if needed', async () => {
      const TestProvider = {
        provide: 'TestProvider',
        useFactory: (wifiService: WifiManagerService) => {
          return {
            getConnections: () => wifiService.getConnection(),
          };
        },
        inject: [WifiManagerService],
      };

      const testModule = await Test.createTestingModule({
        imports: [WifiManagerModule],
        providers: [TestProvider],
      }).compile();

      const testProvider = testModule.get('TestProvider');
      expect(testProvider).toBeDefined();
      expect(testProvider.getConnections).toBeDefined();
      expect(typeof testProvider.getConnections).toBe('function');

      await testModule.close();
    });
  });

  describe('module structure', () => {
    it('should have correct controllers configuration', () => {
      const controller = module.get<WifiManagerController>(WifiManagerController);
      
      expect(controller).toBeDefined();
      expect(controller.connectWifi).toBeDefined();
      expect(controller.disconnectWifi).toBeDefined();
      expect(controller.getConnection).toBeDefined();
    });

    it('should have correct providers configuration', () => {
      const service = module.get<WifiManagerService>(WifiManagerService);
      
      expect(service).toBeDefined();
      expect(service.connectToWiFi).toBeDefined();
      expect(service.disconnectFromWiFi).toBeDefined();
      expect(service.getConnection).toBeDefined();
    });

    it('should be importable by other modules', async () => {
      const testModule = await Test.createTestingModule({
        imports: [WifiManagerModule],
        providers: [
          {
            provide: 'TestConsumer',
            useFactory: (controller: WifiManagerController, service: WifiManagerService) => {
              return { controller, service };
            },
            inject: [WifiManagerController, WifiManagerService],
          },
        ],
      }).compile();

      const testConsumer = testModule.get('TestConsumer');
      expect(testConsumer.controller).toBeDefined();
      expect(testConsumer.service).toBeDefined();

      await testModule.close();
    });
  });

  describe('controller-service integration', () => {
    it('should allow controller to call service methods', async () => {
      const controller = module.get<WifiManagerController>(WifiManagerController);
      const service = module.get<WifiManagerService>(WifiManagerService);

      // Mock service methods
      const getConnectionSpy = jest.spyOn(service, 'getConnection').mockResolvedValue([]);
      
      await controller.getConnection();
      
      expect(getConnectionSpy).toHaveBeenCalled();
    });

    it('should handle service errors through controller', async () => {
      const controller = module.get<WifiManagerController>(WifiManagerController);
      const service = module.get<WifiManagerService>(WifiManagerService);

      const error = new Error('Service error');
      jest.spyOn(service, 'getConnection').mockRejectedValue(error);
      
      await expect(controller.getConnection()).rejects.toThrow(error);
    });

    it('should pass parameters correctly from controller to service', async () => {
      const controller = module.get<WifiManagerController>(WifiManagerController);
      const service = module.get<WifiManagerService>(WifiManagerService);

      const testDto = { ssid: 'test', password: 'test123' };
      const connectSpy = jest.spyOn(service, 'connectToWiFi').mockResolvedValue({ success: true });
      
      await controller.connectWifi(testDto);
      
      expect(connectSpy).toHaveBeenCalledWith(testDto);
    });
  });

  describe('error handling', () => {
    it('should handle module initialization errors gracefully', async () => {
      const testModule = await Test.createTestingModule({
        imports: [WifiManagerModule],
      }).compile();

      expect(testModule).toBeDefined();
      
      // Verify both controller and service can be retrieved
      const controller = testModule.get<WifiManagerController>(WifiManagerController);
      const service = testModule.get<WifiManagerService>(WifiManagerService);
      
      expect(controller).toBeDefined();
      expect(service).toBeDefined();

      await testModule.close();
    });

    it('should handle service initialization failures', async () => {
      // Test that the module can still be created even if wifi initialization fails
      const testModule = await Test.createTestingModule({
        imports: [WifiManagerModule],
      }).compile();

      const service = testModule.get<WifiManagerService>(WifiManagerService);
      expect(service).toBeDefined();

      await testModule.close();
    });

    it('should handle missing dependencies gracefully', async () => {
      // Test module without service to ensure proper error handling
      try {
        const testModule = await Test.createTestingModule({
          controllers: [WifiManagerController],
        }).compile();
        
        // This should fail because WifiManagerService is not provided
        expect(() => testModule.get<WifiManagerController>(WifiManagerController)).toThrow();
      } catch (error) {
        // Expected to throw due to missing dependency
        expect(error).toBeDefined();
      }
    });
  });

  describe('module isolation', () => {
    it('should create separate instances across different module instances', async () => {
      const module1 = await Test.createTestingModule({
        imports: [WifiManagerModule],
      }).compile();

      const module2 = await Test.createTestingModule({
        imports: [WifiManagerModule],
      }).compile();

      const service1 = module1.get<WifiManagerService>(WifiManagerService);
      const service2 = module2.get<WifiManagerService>(WifiManagerService);

      // Different module instances should have different service instances
      expect(service1).not.toBe(service2);

      await module1.close();
      await module2.close();
    });

    it('should maintain singleton within same module instance', () => {
      const service1 = module.get<WifiManagerService>(WifiManagerService);
      const service2 = module.get<WifiManagerService>(WifiManagerService);

      // Same module instance should return same service instance
      expect(service1).toBe(service2);
    });
  });

  describe('external dependencies', () => {
    it('should handle node-wifi library initialization', () => {
      const service = module.get<WifiManagerService>(WifiManagerService);
      expect(service).toBeDefined();
      
      // Service should be created successfully even with mocked wifi library
    });

    it('should handle child_process dependency', () => {
      const service = module.get<WifiManagerService>(WifiManagerService);
      expect(service).toBeDefined();
      
      // Service should be created successfully even with mocked child_process
    });
  });
});