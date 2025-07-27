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

    // Mock Response with write and end methods
    mockResponse = {
      write: jest.fn(),
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

    it('should handle undefined request body', () => {
      mockRequest.body = undefined;

      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(Logger.log).toHaveBeenCalledWith(
        '"POST" body: null',
        '/api/test Request'
      );
    });

    it('should handle complex request body', () => {
      mockRequest.body = {
        nested: {
          data: [1, 2, 3],
          boolean: true,
          null_value: null
        }
      };

      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(Logger.log).toHaveBeenCalledWith(
        '"POST" body: {"nested":{"data":[1,2,3],"boolean":true,"null_value":null}}',
        '/api/test Request'
      );
    });

    it('should handle different HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      
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
      const urls = ['/api/wifi', '/health', '/', '/api/serial/data'];
      
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

  describe('response logging', () => {
    let originalWrite: any;
    let originalEnd: any;

    beforeEach(() => {
      // Store original methods
      originalWrite = mockResponse.write;
      originalEnd = mockResponse.end;
      
      // Create proper mock functions that can be overridden
      mockResponse.write = jest.fn().mockImplementation((chunk, encoding, callback) => {
        if (typeof encoding === 'function') {
          callback = encoding;
        }
        if (callback) callback();
        return true;
      });
      
      mockResponse.end = jest.fn().mockImplementation((chunk, encoding, callback) => {
        if (typeof chunk === 'function') {
          callback = chunk;
        } else if (typeof encoding === 'function') {
          callback = encoding;
        }
        if (callback) callback();
      });
    });

    it('should log response when response ends', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate response ending with data
      const responseData = JSON.stringify({ success: true });
      
      // Trigger the end handler by calling the mocked end
      mockResponse.end!(responseData);

      expect(Logger.log).toHaveBeenCalledWith(
        expect.stringContaining('res:'),
        '/api/test Response'
      );
    });

    it('should handle response with no data', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate response ending with no data
      const endArgs: any[] = [];
      mockResponse.end!(...endArgs);

      expect(Logger.log).toHaveBeenCalledWith(
        expect.stringContaining('res:'),
        '/api/test Response'
      );
    });

    it('should capture response status code', () => {
      mockResponse.statusCode = 404;
      
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate response ending
      mockResponse.end!();

      expect(Logger.log).toHaveBeenCalledWith(
        expect.stringContaining('"statusCode":404'),
        '/api/test Response'
      );
    });

    it('should capture response headers', () => {
      const mockHeaders = { 'content-type': 'application/json', 'x-custom': 'test' };
      (mockResponse.getHeaders as jest.Mock).mockReturnValue(mockHeaders);
      
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate response ending
      mockResponse.end!();

      expect(Logger.log).toHaveBeenCalledWith(
        expect.stringContaining('"headers":{"content-type":"application/json","x-custom":"test"}'),
        '/api/test Response'
      );
    });

    it('should set origin header', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate response ending
      mockResponse.end!();

      expect(mockResponse.setHeader).toHaveBeenCalledWith('origin', 'restjs-req-res-logging-repo');
    });

    it('should handle multiple write calls before end', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate multiple writes
      const chunk1 = '{"part1":';
      const chunk2 = '"data"}';
      
      mockResponse.write!(chunk1);
      mockResponse.write!(chunk2);
      mockResponse.end!();

      expect(Logger.log).toHaveBeenCalledWith(
        expect.stringContaining('"body":"{\\"part1\\":\\"data\\"}"'),
        '/api/test Response'
      );
    });

    it('should handle write with null chunk', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate write with null
      mockResponse.write!(null);
      mockResponse.end!();

      // Should not crash
      expect(Logger.log).toHaveBeenCalled();
    });

    it('should handle end with multiple arguments', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate end with multiple arguments
      const chunk = '{"final":"data"}';
      const encoding = 'utf8';
      const callback = jest.fn();
      
      mockResponse.end!(chunk, encoding, callback);

      expect(Logger.log).toHaveBeenCalledWith(
        expect.stringContaining('"body":"{\\"final\\":\\"data\\"}"'),
        '/api/test Response'
      );
    });

    it('should handle write with drain event', () => {
      const mockOnce = jest.fn();
      mockResponse.once = mockOnce;
      
      // Mock write to return false (backpressure)
      (mockResponse.write as jest.Mock).mockReturnValue(false);
      
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate write that triggers drain
      mockResponse.write!('test data');

      expect(mockOnce).toHaveBeenCalledWith('drain', expect.any(Function));
    });

    it('should handle binary data in response', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate binary data
      const binaryData = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
      mockResponse.end!(binaryData);

      expect(Logger.log).toHaveBeenCalledWith(
        expect.stringContaining('"body":"Hello"'),
        '/api/test Response'
      );
    });

    it('should handle large response data', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate large response
      const largeData = 'x'.repeat(10000);
      mockResponse.end!(largeData);

      expect(Logger.log).toHaveBeenCalledWith(
        expect.stringContaining(`"body":"${largeData}"`),
        '/api/test Response'
      );
    });
  });

  describe('error handling', () => {
    it('should handle circular references in request body', () => {
      const circularObj: any = { test: 'data' };
      circularObj.self = circularObj;
      mockRequest.body = circularObj;

      expect(() => {
        middleware.use(mockRequest as Request, mockResponse as Response, mockNext);
      }).toThrow(); // JSON.stringify will throw on circular references
    });

    it('should handle invalid response data', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate end with invalid data that can't be converted to Buffer
      expect(() => {
        mockResponse.end!(Symbol('invalid'));
      }).toThrow();
    });

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
  });

  describe('edge cases', () => {
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

    it('should handle response without getHeaders method', () => {
      delete mockResponse.getHeaders;

      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(() => {
        mockResponse.end!();
      }).toThrow();
    });

    it('should handle response without statusCode', () => {
      delete mockResponse.statusCode;

      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      mockResponse.end!();

      expect(Logger.log).toHaveBeenCalledWith(
        expect.stringContaining('"statusCode":null'),
        '/api/test Response'
      );
    });
  });
});