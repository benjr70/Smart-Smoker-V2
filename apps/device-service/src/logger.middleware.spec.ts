import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { LoggerMiddleware } from './logger.middleware';
import { Request, Response, NextFunction } from 'express';

describe('LoggerMiddleware', () => {
  let middleware: LoggerMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let module: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Mock Logger
    jest.spyOn(Logger, 'log').mockImplementation();

    module = await Test.createTestingModule({
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

    // Mock Response with minimal functionality
    mockResponse = {
      write: jest.fn().mockReturnValue(true),
      end: jest.fn(),
      getHeaders: jest.fn().mockReturnValue({ 'content-type': 'application/json' }),
      setHeader: jest.fn(),
      statusCode: 200,
      once: jest.fn(),
    };
  });

  afterEach(async () => {
    jest.clearAllMocks();
    
    // Clean up test module
    if (module) {
      await module.close();
    }
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

    it('should handle different URLs', () => {
      const urls = ['/api/users', '/health', '/api/v1/data'];
      
      urls.forEach(url => {
        jest.clearAllMocks();
        mockRequest.url = url;
        
        middleware.use(mockRequest as Request, mockResponse as Response, mockNext);
        
        expect(Logger.log).toHaveBeenCalledWith(
          '"POST" body: {"test":"data"}',
          `${url} Request`
        );
      });
    });
  });

  describe('response logging basic functionality', () => {
    it('should override response methods', () => {
      const originalWrite = mockResponse.write;
      const originalEnd = mockResponse.end;
      
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Response methods should be overridden
      expect(mockResponse.write).not.toBe(originalWrite);
      expect(mockResponse.end).not.toBe(originalEnd);
    });

    it('should set origin header when response ends', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate response ending
      const overriddenEnd = mockResponse.end as jest.Mock;
      overriddenEnd();

      expect(mockResponse.setHeader).toHaveBeenCalledWith('origin', 'restjs-req-res-logging-repo');
    });

    it('should log response when response ends', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate response ending
      const overriddenEnd = mockResponse.end as jest.Mock;
      overriddenEnd();

      expect(Logger.log).toHaveBeenCalledWith(
        expect.stringContaining('res:'),
        '/api/test Response'
      );
    });
  });

  describe('error handling', () => {
    it('should handle request without method', () => {
      delete mockRequest.method;

      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(Logger.log).toHaveBeenCalledWith(
        'undefined body: {"test":"data"}',
        '/api/test Request'
      );
    });

    it('should handle request without URL', () => {
      delete mockRequest.url;

      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(Logger.log).toHaveBeenCalledWith(
        '"POST" body: {"test":"data"}',
        'undefined Request'
      );
    });

    it('should handle complex request bodies', () => {
      mockRequest.body = {
        nested: { data: { value: 123 } },
        array: [1, 2, 3],
        string: 'test',
        number: 42,
        boolean: true,
        null: null
      };

      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(Logger.log).toHaveBeenCalledWith(
        expect.stringContaining('"POST" body:'),
        '/api/test Request'
      );
    });
  });
});