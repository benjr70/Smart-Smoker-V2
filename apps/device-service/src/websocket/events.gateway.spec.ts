import { Test, TestingModule } from '@nestjs/testing';
import { EventsGateway } from './events.gateway';
import { SerialService } from '../serial/serial.serivce';
import { Subject } from 'rxjs';

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

  beforeEach(async () => {
    jest.clearAllMocks();
    
    dataSubject = new Subject<string>();
    mockSerialService.onData.mockReturnValue(dataSubject);

    const module: TestingModule = await Test.createTestingModule({
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