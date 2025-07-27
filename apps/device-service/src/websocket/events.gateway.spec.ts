// Mock serialport BEFORE any imports to prevent real device access
jest.mock('serialport', () => {
  const mockPort = {
    pipe: jest.fn().mockReturnThis(),
    close: jest.fn(),
    removeAllListeners: jest.fn(),
  };
  
  const mockParser = {
    on: jest.fn(),
    removeAllListeners: jest.fn(),
  };
  
  const MockSerialPort = jest.fn().mockImplementation(() => mockPort);
  const MockReadlineParser = jest.fn().mockImplementation(() => mockParser);
  
  return {
    SerialPort: MockSerialPort,
    ReadlineParser: MockReadlineParser,
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { EventsGateway } from './events.gateway';
import { SerialService } from '../serial/serial.serivce';
import { Subject, Subscription } from 'rxjs';

// Mock Socket.IO Server
const mockServer = {
  emit: jest.fn(),
};

// Mock SerialService
const mockSerialService = {
  onData: jest.fn(),
};

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let serialService: SerialService;
  let dataSubject: Subject<string>;
  let module: TestingModule;
  let subscriptions: Subscription[] = [];

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Clean up previous subscriptions
    subscriptions.forEach(sub => sub.unsubscribe());
    subscriptions = [];
    
    dataSubject = new Subject<string>();
    mockSerialService.onData.mockReturnValue(dataSubject);

    module = await Test.createTestingModule({
      providers: [
        EventsGateway,
        { provide: SerialService, useValue: mockSerialService },
      ],
    }).compile();

    gateway = module.get<EventsGateway>(EventsGateway);
    serialService = module.get<SerialService>(SerialService);
    
    // Set the mock server
    gateway.server = mockServer as any;
  });

  afterEach(async () => {
    // Clean up all subscriptions to prevent memory leaks
    subscriptions.forEach(sub => {
      if (sub && !sub.closed) {
        sub.unsubscribe();
      }
    });
    subscriptions = [];
    
    // Complete and clean up the data subject
    if (dataSubject && !dataSubject.closed) {
      dataSubject.complete();
    }
    
    // Clean up test module
    if (module) {
      await module.close();
    }
    
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('afterInit', () => {
    it('should subscribe to serial data and emit temp events', () => {
      gateway.afterInit();

      expect(serialService.onData).toHaveBeenCalled();

      // Simulate data emission
      const testData = '{"Meat": 150, "Chamber": 200}';
      dataSubject.next(testData);

      expect(mockServer.emit).toHaveBeenCalledWith('temp', testData);
    });

    it('should handle multiple data emissions', () => {
      gateway.afterInit();

      const testData1 = '{"Meat": 150, "Chamber": 200}';
      const testData2 = '{"Meat": 160, "Chamber": 210}';

      dataSubject.next(testData1);
      dataSubject.next(testData2);

      expect(mockServer.emit).toHaveBeenCalledTimes(2);
      expect(mockServer.emit).toHaveBeenNthCalledWith(1, 'temp', testData1);
      expect(mockServer.emit).toHaveBeenNthCalledWith(2, 'temp', testData2);
    });

    it('should handle empty data', () => {
      gateway.afterInit();

      dataSubject.next('');

      expect(mockServer.emit).toHaveBeenCalledWith('temp', '');
    });
  });
});