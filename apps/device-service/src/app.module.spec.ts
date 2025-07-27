import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SerialModule } from './serial/serial.module';
import { EventsModule } from './websocket/events.module';
import { WifiManagerModule } from './wifiManager/wifiManager.module';
import { LoggerMiddleware } from './logger.middleware';
import { MiddlewareConsumer, RequestMethod } from '@nestjs/common';

describe('AppModule', () => {
  let appModule: AppModule;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    appModule = module.get<AppModule>(AppModule);
  });

  afterEach(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(appModule).toBeDefined();
  });

  it('should have AppController', () => {
    const appController = module.get<AppController>(AppController);
    expect(appController).toBeDefined();
  });

  it('should have AppService', () => {
    const appService = module.get<AppService>(AppService);
    expect(appService).toBeDefined();
  });

  it('should import SerialModule', () => {
    expect(() => module.get(SerialModule)).not.toThrow();
  });

  it('should import EventsModule', () => {
    expect(() => module.get(EventsModule)).not.toThrow();
  });

  it('should import WifiManagerModule', () => {
    expect(() => module.get(WifiManagerModule)).not.toThrow();
  });

  describe('configure middleware', () => {
    let mockConsumer: jest.Mocked<MiddlewareConsumer>;

    beforeEach(() => {
      mockConsumer = {
        apply: jest.fn().mockReturnThis(),
        exclude: jest.fn().mockReturnThis(),
        forRoutes: jest.fn().mockReturnThis(),
      } as any;
    });

    it('should configure LoggerMiddleware', () => {
      appModule.configure(mockConsumer);

      expect(mockConsumer.apply).toHaveBeenCalledWith(LoggerMiddleware);
    });

    it('should exclude specific routes from logging', () => {
      appModule.configure(mockConsumer);

      expect(mockConsumer.exclude).toHaveBeenCalledWith({
        path: 'api/wifiManager/connection',
        method: RequestMethod.ALL,
      });
    });

    it('should apply middleware to all routes after exclusions', () => {
      appModule.configure(mockConsumer);

      expect(mockConsumer.forRoutes).toHaveBeenCalledWith({
        path: '*',
        method: RequestMethod.ALL,
      });
    });

    it('should chain middleware configuration correctly', () => {
      appModule.configure(mockConsumer);

      // Verify the chain: apply -> exclude -> forRoutes
      expect(mockConsumer.apply).toHaveBeenCalled();
      expect(mockConsumer.exclude).toHaveBeenCalled();
      expect(mockConsumer.forRoutes).toHaveBeenCalled();
    });
  });

  describe('module compilation', () => {
    it('should compile successfully', async () => {
      const testModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      expect(testModule).toBeDefined();
      await testModule.close();
    });

    it('should resolve all dependencies correctly', async () => {
      const testModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      // Test that all main dependencies can be resolved
      expect(() => testModule.get(AppController)).not.toThrow();
      expect(() => testModule.get(AppService)).not.toThrow();
      
      await testModule.close();
    });
  });

  describe('module structure', () => {
    it('should have correct module imports', () => {
      // This test verifies the module structure by checking that
      // the module can be instantiated and all dependencies resolve
      expect(appModule).toBeDefined();
      
      // Verify that the module contains the expected providers
      const appService = module.get<AppService>(AppService);
      const appController = module.get<AppController>(AppController);
      
      expect(appService).toBeDefined();
      expect(appController).toBeDefined();
    });

    it('should implement NestModule interface', () => {
      expect(typeof appModule.configure).toBe('function');
    });
  });

  describe('error handling', () => {
    it('should handle missing consumer in configure', () => {
      expect(() => {
        appModule.configure(null as any);
      }).toThrow();
    });

    it('should handle invalid consumer in configure', () => {
      const invalidConsumer = {} as MiddlewareConsumer;
      
      expect(() => {
        appModule.configure(invalidConsumer);
      }).toThrow();
    });
  });
});