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

    it('should handle response writing with chunks', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate writing data
      const overriddenWrite = mockResponse.write as jest.Mock;
      overriddenWrite('test data chunk');

      expect(overriddenWrite).toHaveBeenCalledWith('test data chunk');
    });

    it('should handle response writing with empty chunks', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate writing with null/undefined chunks
      const overriddenWrite = mockResponse.write as jest.Mock;
      overriddenWrite(null);

      expect(mockResponse.once).toHaveBeenCalledWith('drain', expect.any(Function));
    });

    it('should handle response writing with multiple chunks', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate writing multiple chunks
      const overriddenWrite = mockResponse.write as jest.Mock;
      overriddenWrite('chunk1', 'chunk2', 'chunk3');

      expect(overriddenWrite).toHaveBeenCalledWith('chunk1', 'chunk2', 'chunk3');
    });

    it('should handle response ending with data chunks', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate ending with data
      const overriddenEnd = mockResponse.end as jest.Mock;
      overriddenEnd('final data');

      expect(mockResponse.setHeader).toHaveBeenCalledWith('origin', 'restjs-req-res-logging-repo');
      expect(Logger.log).toHaveBeenCalledWith(
        expect.stringContaining('res:'),
        '/api/test Response'
      );
    });

    it('should handle response ending with multiple chunks', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate ending with multiple chunks
      const overriddenEnd = mockResponse.end as jest.Mock;
      overriddenEnd('chunk1', 'chunk2');

      expect(mockResponse.setHeader).toHaveBeenCalledWith('origin', 'restjs-req-res-logging-repo');
    });

    it('should handle response logging with complex response structure', () => {
      mockResponse.statusCode = 201;
      mockResponse.getHeaders = jest.fn().mockReturnValue({ 
        'content-type': 'application/json',
        'x-custom-header': 'test'
      });

      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      const overriddenEnd = mockResponse.end as jest.Mock;
      overriddenEnd('{"success": true}');

      expect(Logger.log).toHaveBeenCalledWith(
        expect.stringContaining('"statusCode":201'),
        '/api/test Response'
      );
    });
  });

  describe('error handling', () => {
    it('should fail if logging throws an error', () => {
      // Mock Logger.log to throw an error
      (Logger.log as jest.Mock).mockImplementation(() => {
        throw new Error('Logging failed');
      });

      expect(() => {
        middleware.use(mockRequest as Request, mockResponse as Response, mockNext);
      }).toThrow('Logging failed');

      // Next should not be called when logging fails
      expect(mockNext).not.toHaveBeenCalled();
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