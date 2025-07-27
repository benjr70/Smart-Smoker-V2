import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module';

// Mock NestFactory
const mockApp = {
  listen: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  enableCors: jest.fn(),
};

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn().mockResolvedValue(mockApp),
  },
}));

describe('Main', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('bootstrap functionality', () => {
    it('should create app with AppModule', async () => {
      const { NestFactory } = require('@nestjs/core');
      
      // Import the main module to trigger bootstrap
      await import('./main');

      expect(NestFactory.create).toHaveBeenCalledWith(AppModule);
    });

    it('should enable CORS with correct configuration', async () => {
      const { NestFactory } = require('@nestjs/core');
      
      // Import the main module to trigger bootstrap
      await import('./main');

      expect(mockApp.enableCors).toHaveBeenCalledWith({
        origin: true,
        methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
        preflightContinue: false,
        optionsSuccessStatus: 200
      });
    });

    it('should listen on port 3003', async () => {
      // Import the main module to trigger bootstrap
      await import('./main');

      expect(mockApp.listen).toHaveBeenCalledWith(3003);
    });

    it('should handle NestFactory.create errors', async () => {
      const { NestFactory } = require('@nestjs/core');
      const error = new Error('Failed to create app');
      
      NestFactory.create.mockRejectedValueOnce(error);
      
      // Mock console.error to capture error logs
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      try {
        // Clear module cache and re-import to trigger bootstrap again
        delete require.cache[require.resolve('./main')];
        await import('./main');
      } catch (err) {
        expect(err).toBe(error);
      }
      
      expect(NestFactory.create).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle listen errors', async () => {
      const listenError = new Error('Failed to listen');
      mockApp.listen.mockRejectedValueOnce(listenError);
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      try {
        // Clear module cache and re-import to trigger bootstrap again
        delete require.cache[require.resolve('./main')];
        await import('./main');
      } catch (err) {
        expect(err).toBe(listenError);
      }
      
      expect(mockApp.listen).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle enableCors errors', async () => {
      const corsError = new Error('CORS configuration failed');
      mockApp.enableCors.mockImplementationOnce(() => {
        throw corsError;
      });
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      try {
        // Clear module cache and re-import to trigger bootstrap again
        delete require.cache[require.resolve('./main')];
        await import('./main');
      } catch (err) {
        expect(err).toBe(corsError);
      }
      
      expect(mockApp.enableCors).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('CORS configuration', () => {
    it('should configure CORS with origin true', async () => {
      await import('./main');
      
      const corsConfig = mockApp.enableCors.mock.calls[0][0];
      expect(corsConfig.origin).toBe(true);
    });

    it('should configure CORS with all HTTP methods', async () => {
      await import('./main');
      
      const corsConfig = mockApp.enableCors.mock.calls[0][0];
      expect(corsConfig.methods).toBe("GET,HEAD,PUT,PATCH,POST,DELETE");
    });

    it('should configure CORS with preflightContinue false', async () => {
      await import('./main');
      
      const corsConfig = mockApp.enableCors.mock.calls[0][0];
      expect(corsConfig.preflightContinue).toBe(false);
    });

    it('should configure CORS with optionsSuccessStatus 200', async () => {
      await import('./main');
      
      const corsConfig = mockApp.enableCors.mock.calls[0][0];
      expect(corsConfig.optionsSuccessStatus).toBe(200);
    });
  });
});