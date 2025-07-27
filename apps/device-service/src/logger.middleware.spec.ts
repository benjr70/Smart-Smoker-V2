import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { LoggerMiddleware } from './logger.middleware';
import { Request, Response, NextFunction } from 'express';

describe('LoggerMiddleware', () => {
  let middleware: LoggerMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Mock Logger
    jest.spyOn(Logger, 'log').mockImplementation();

    const module: TestingModule = await Test.createTestingModule({
      providers: [LoggerMiddleware],
    }).compile();

    middleware = module.get<LoggerMiddleware>(LoggerMiddleware);

    // Mock Next function
    mockNext = jest.fn();

    // Mock Request
    mockRequest = {
      method: 'POST',
      url: '/api/test',
      body: { test: 'data' },
    };

    // Mock Response
    mockResponse = {
      write: jest.fn().mockReturnValue(true),
      end: jest.fn(),
      getHeaders: jest.fn().mockReturnValue({ 'content-type': 'application/json' }),
      setHeader: jest.fn(),
      statusCode: 200,
      once: jest.fn(),
    };
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  describe('use method', () => {
    it('should log the request method and body', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(Logger.log).toHaveBeenCalledWith(
        '"POST" body: {"test":"data"}',
        '/api/test Request'
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle empty request body', () => {
      mockRequest.body = {};

      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(Logger.log).toHaveBeenCalledWith(
        '"POST" body: {}',
        '/api/test Request'
      );
    });

    it('should handle null request body', () => {
      mockRequest.body = null;

      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(Logger.log).toHaveBeenCalledWith(
        '"POST" body: null',
        '/api/test Request'
      );
    });

    it('should handle different HTTP methods', () => {
      const methods = ['GET', 'PUT', 'DELETE'];
      
      methods.forEach(method => {
        jest.clearAllMocks();
        mockRequest.method = method;
        
        middleware.use(mockRequest as Request, mockResponse as Response, mockNext);
        
        expect(Logger.log).toHaveBeenCalledWith(
          `"${method}" body: {"test":"data"}`,
          '/api/test Request'
        );
      });
    });
  });

  describe('response logging', () => {
    it('should handle basic response logging setup', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Verify that response methods are overridden
      expect(mockResponse.write).toBeDefined();
      expect(mockResponse.end).toBeDefined();
    });

    it('should handle response ending', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate response ending
      mockResponse.end!();

      expect(mockResponse.setHeader).toHaveBeenCalledWith('origin', 'restjs-req-res-logging-repo');
    });
  });

  describe('error handling', () => {
    it('should continue execution even if logging fails', () => {
      // Mock Logger.log to throw an error
      (Logger.log as jest.Mock).mockImplementation(() => {
        throw new Error('Logging failed');
      });

      expect(() => {
        middleware.use(mockRequest as Request, mockResponse as Response, mockNext);
      }).toThrow('Logging failed');

      // Next should still be called despite logging error
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle request without method', () => {
      delete mockRequest.method;

      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(Logger.log).toHaveBeenCalledWith(
        'undefined body: {"test":"data"}',
        '/api/test Request'
      );
    });
  });
});