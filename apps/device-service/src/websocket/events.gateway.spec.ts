import { Test, TestingModule } from '@nestjs/testing';
import { EventsGateway } from './events.gateway';
import { SerialService } from '../serial/serial.serivce';
import { Server } from 'socket.io';
import { Subject } from 'rxjs';

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let serialService: SerialService;
  let mockServer: jest.Mocked<Server>;
  let dataSubject: Subject<string>;

  const mockSerialService = {
    onData: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Create a new Subject for each test
    dataSubject = new Subject<string>();
    mockSerialService.onData.mockReturnValue(dataSubject);

    // Mock the Socket.IO server
    mockServer = {
      emit: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsGateway,
        {
          provide: SerialService,
          useValue: mockSerialService,
        },
      ],
    }).compile();

    gateway = module.get<EventsGateway>(EventsGateway);
    serialService = module.get<SerialService>(SerialService);
    
    // Assign the mock server to the gateway
    gateway.server = mockServer;
  });

  afterEach(() => {
    // Clean up the subject
    if (dataSubject && !dataSubject.closed) {
      dataSubject.complete();
    }
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('constructor', () => {
    it('should inject SerialService correctly', () => {
      expect(gateway['serialService']).toBe(serialService);
    });
  });

  describe('afterInit', () => {
    it('should subscribe to serial data and emit through WebSocket', () => {
      const testData = '{"Meat":150,"Chamber":250}';
      
      // Call afterInit to set up the subscription
      gateway.afterInit();

      // Verify that onData was called
      expect(serialService.onData).toHaveBeenCalled();

      // Emit test data through the subject
      dataSubject.next(testData);

      // Verify that the server emitted the data
      expect(mockServer.emit).toHaveBeenCalledWith('temp', testData);
    });

    it('should handle multiple data emissions', () => {
      const testData1 = '{"Meat":100,"Chamber":200}';
      const testData2 = '{"Meat":150,"Chamber":250}';
      const testData3 = '{"Meat":200,"Chamber":300}';

      gateway.afterInit();

      // Emit multiple data points
      dataSubject.next(testData1);
      dataSubject.next(testData2);
      dataSubject.next(testData3);

      // Verify all emissions
      expect(mockServer.emit).toHaveBeenCalledTimes(3);
      expect(mockServer.emit).toHaveBeenNthCalledWith(1, 'temp', testData1);
      expect(mockServer.emit).toHaveBeenNthCalledWith(2, 'temp', testData2);
      expect(mockServer.emit).toHaveBeenNthCalledWith(3, 'temp', testData3);
    });

    it('should handle empty data strings', () => {
      const emptyData = '';

      gateway.afterInit();
      dataSubject.next(emptyData);

      expect(mockServer.emit).toHaveBeenCalledWith('temp', emptyData);
    });

    it('should handle complex JSON data', () => {
      const complexData = JSON.stringify({
        Meat: 175.5,
        Meat2: 180.2,
        Meat3: 185.7,
        Chamber: 250.3,
        timestamp: Date.now(),
        status: 'normal'
      });

      gateway.afterInit();
      dataSubject.next(complexData);

      expect(mockServer.emit).toHaveBeenCalledWith('temp', complexData);
    });

    it('should handle malformed JSON data', () => {
      const malformedData = '{"Meat":150,"Chamber":}';

      gateway.afterInit();
      dataSubject.next(malformedData);

      expect(mockServer.emit).toHaveBeenCalledWith('temp', malformedData);
    });

    it('should handle null and undefined data', () => {
      gateway.afterInit();

      dataSubject.next(null as any);
      dataSubject.next(undefined as any);

      expect(mockServer.emit).toHaveBeenCalledTimes(2);
      expect(mockServer.emit).toHaveBeenNthCalledWith(1, 'temp', null);
      expect(mockServer.emit).toHaveBeenNthCalledWith(2, 'temp', undefined);
    });

    it('should handle rapid data emissions', () => {
      gateway.afterInit();

      // Emit data rapidly
      for (let i = 0; i < 100; i++) {
        const data = JSON.stringify({ Meat: i, Chamber: i * 2 });
        dataSubject.next(data);
      }

      expect(mockServer.emit).toHaveBeenCalledTimes(100);
    });

    it('should continue working after errors in emission', () => {
      // Mock server.emit to throw an error on the first call
      mockServer.emit
        .mockImplementationOnce(() => {
          throw new Error('WebSocket error');
        })
        .mockImplementation(() => {
          return true as any;
        });

      gateway.afterInit();

      const testData1 = '{"Meat":100,"Chamber":200}';
      const testData2 = '{"Meat":150,"Chamber":250}';

      // This should throw an error but not break the subscription
      expect(() => dataSubject.next(testData1)).toThrow('WebSocket error');
      
      // This should work normally
      dataSubject.next(testData2);

      expect(mockServer.emit).toHaveBeenCalledTimes(2);
      expect(mockServer.emit).toHaveBeenNthCalledWith(2, 'temp', testData2);
    });

    it('should handle subscription when server is not initialized', () => {
      // Remove the server to test edge case
      gateway.server = undefined as any;

      gateway.afterInit();

      const testData = '{"Meat":150,"Chamber":250}';
      
      // This should throw an error because server is undefined
      expect(() => dataSubject.next(testData)).toThrow();
    });

    it('should handle multiple calls to afterInit', () => {
      // Call afterInit multiple times
      gateway.afterInit();
      gateway.afterInit();
      gateway.afterInit();

      // Verify onData was called multiple times (creating multiple subscriptions)
      expect(serialService.onData).toHaveBeenCalledTimes(3);

      const testData = '{"Meat":150,"Chamber":250}';
      dataSubject.next(testData);

      // With multiple subscriptions, the emit should be called multiple times
      expect(mockServer.emit).toHaveBeenCalledTimes(3);
    });
  });

  describe('server property', () => {
    it('should have a server property', () => {
      expect(gateway.server).toBeDefined();
    });

    it('should allow server to be set', () => {
      const newMockServer = { emit: jest.fn() } as any;
      gateway.server = newMockServer;
      
      expect(gateway.server).toBe(newMockServer);
    });
  });

  describe('WebSocket integration', () => {
    it('should emit on the correct event channel', () => {
      gateway.afterInit();
      
      const testData = '{"Meat":175,"Chamber":275}';
      dataSubject.next(testData);

      expect(mockServer.emit).toHaveBeenCalledWith('temp', testData);
      
      // Verify it's not emitting on other channels
      expect(mockServer.emit).not.toHaveBeenCalledWith('temperature', testData);
      expect(mockServer.emit).not.toHaveBeenCalledWith('data', testData);
      expect(mockServer.emit).not.toHaveBeenCalledWith('serial', testData);
    });

    it('should handle different data formats consistently', () => {
      gateway.afterInit();

      const formats = [
        '123',
        'plain text',
        '{"simple":true}',
        '{"complex":{"nested":{"data":123}}}',
        '[1,2,3,4,5]',
        'true',
        'false',
        'null'
      ];

      formats.forEach(format => {
        dataSubject.next(format);
      });

      expect(mockServer.emit).toHaveBeenCalledTimes(formats.length);
      formats.forEach((format, index) => {
        expect(mockServer.emit).toHaveBeenNthCalledWith(index + 1, 'temp', format);
      });
    });
  });

  describe('error handling', () => {
    it('should handle SerialService onData returning null', () => {
      mockSerialService.onData.mockReturnValue(null);

      expect(() => gateway.afterInit()).toThrow();
    });

    it('should handle SerialService onData throwing error', () => {
      mockSerialService.onData.mockImplementation(() => {
        throw new Error('SerialService error');
      });

      expect(() => gateway.afterInit()).toThrow('SerialService error');
    });
  });
});