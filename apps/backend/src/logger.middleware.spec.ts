import { LoggerMiddleware } from './logger.middleware';
import { Request, Response, NextFunction } from 'express';
import { Logger } from '@nestjs/common';

describe('LoggerMiddleware', () => {
  let middleware: LoggerMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    middleware = new LoggerMiddleware();

    mockRequest = {
      method: 'GET',
      url: '/api/test',
      body: { test: 'data' },
    };

    mockResponse = {
      write: jest.fn(),
      end: jest.fn(),
      setHeader: jest.fn(),
      getHeaders: jest
        .fn()
        .mockReturnValue({ 'content-type': 'application/json' }),
      statusCode: 200,
      once: jest.fn(),
    };

    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  describe('use', () => {
    it('should log request and call next', () => {
      const logSpy = jest.spyOn(Logger, 'log').mockImplementation();

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(logSpy).toHaveBeenCalledWith(
        `"GET" body: {"test":"data"}`,
        '/api/test Request',
      );
      expect(mockNext).toHaveBeenCalled();

      logSpy.mockRestore();
    });

    it('should handle empty request body', () => {
      const logSpy = jest.spyOn(Logger, 'log').mockImplementation();
      mockRequest.body = undefined;

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(logSpy).toHaveBeenCalledWith(
        `"GET" body: undefined`,
        '/api/test Request',
      );
      expect(mockNext).toHaveBeenCalled();

      logSpy.mockRestore();
    });

    it('should modify response methods for logging', () => {
      const originalWrite = mockResponse.write;
      const originalEnd = mockResponse.end;

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      // Check that response methods were modified
      expect(mockResponse.write).not.toBe(originalWrite);
      expect(mockResponse.end).not.toBe(originalEnd);
    });

    it('should handle response write with data', () => {
      const logSpy = jest.spyOn(Logger, 'log').mockImplementation();
      const originalWrite = jest.fn().mockReturnValue(true);
      mockResponse.write = originalWrite;

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      // Call the modified write method with data
      const testData = 'test response data';
      (mockResponse.write as any)(testData);

      expect(originalWrite).toHaveBeenCalledWith(testData);
      logSpy.mockRestore();
    });

    it('should handle response end and log response', () => {
      const logSpy = jest.spyOn(Logger, 'log').mockImplementation();
      const originalEnd = jest.fn();
      mockResponse.end = originalEnd;

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      // Call the modified end method with data
      const responseData = '{"status":"success"}';
      (mockResponse.end as any)(responseData);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'origin',
        'restjs-req-res-logging-repo',
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('res:'),
        '/api/test Response',
      );
      expect(originalEnd).toHaveBeenCalledWith(responseData);
      logSpy.mockRestore();
    });
  });
});
