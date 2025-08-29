import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { WifiManagerService } from './wifiManager.service';
import { wifiDto } from './wifiDto';
import { exec } from 'child_process';

// Mock child_process
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

// Mock node-wifi
jest.mock('node-wifi', () => ({
  init: jest.fn(),
  getCurrentConnections: jest.fn(),
  scan: jest.fn(),
  connect: jest.fn(),
}));

const mockExec = exec as jest.MockedFunction<typeof exec>;

describe('WifiManagerService', () => {
  let service: WifiManagerService;
  let mockWifi: any;
  let module: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Get the mocked module
    mockWifi = require('node-wifi');

    module = await Test.createTestingModule({
      providers: [WifiManagerService],
    }).compile();

    service = module.get<WifiManagerService>(WifiManagerService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    if (module) {
      await module.close();
    }
  });

  describe('constructor', () => {
    it('should initialize wifi with wlan0 interface', () => {
      expect(mockWifi.init).toHaveBeenCalledWith({
        iface: 'wlan0',
      });
    });
  });

  describe('getConnection', () => {
    it('should return current wifi connections', () => {
      const mockConnections = [{ ssid: 'TestNetwork', signal_level: -50 }];
      mockWifi.getCurrentConnections.mockReturnValue(mockConnections);

      const result = service.getConnection();

      expect(mockWifi.getCurrentConnections).toHaveBeenCalled();
      expect(result).toBe(mockConnections);
    });

    it('should handle empty connections', () => {
      mockWifi.getCurrentConnections.mockReturnValue([]);

      const result = service.getConnection();

      expect(result).toEqual([]);
    });
  });

  describe('connectToWiFi', () => {
    const testDto: wifiDto = {
      ssid: 'TestNetwork',
      password: 'testPassword123',
    };

    it('should successfully connect to WiFi', async () => {
      const mockResult = { success: true };
      mockWifi.scan.mockResolvedValue([]);
      mockWifi.connect.mockResolvedValue(mockResult);

      const result = await service.connectToWiFi(testDto);

      expect(mockWifi.scan).toHaveBeenCalled();
      expect(mockWifi.connect).toHaveBeenCalledWith({
        ssid: testDto.ssid,
        password: testDto.password,
      });
      expect(result).toBe(mockResult);
    });

    it('should handle connection failure and throw HttpException', async () => {
      const connectionError = new Error(
        'Connection failed\nDetailed error message',
      );
      mockWifi.scan.mockResolvedValue([]);
      mockWifi.connect.mockRejectedValue(connectionError);

      await expect(service.connectToWiFi(testDto)).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('disconnectFromWiFi', () => {
    it('should successfully disconnect from WiFi', async () => {
      const mockStdout = 'Device disconnected';
      mockExec.mockImplementation((command: string, callback: any) => {
        callback(null, mockStdout, '');
        return {} as any;
      });

      const result = await service.disconnectFromWiFi();

      expect(mockExec).toHaveBeenCalledWith(
        'nmcli device disconnect wlan0',
        expect.any(Function),
      );
      expect(result).toBe(mockStdout);
    });

    it('should handle disconnection error', async () => {
      const mockStderr = 'Error: Could not disconnect';
      mockExec.mockImplementation((command: string, callback: any) => {
        callback(new Error('Failed'), '', mockStderr);
        return {} as any;
      });

      await expect(service.disconnectFromWiFi()).rejects.toBe(mockStderr);
    });
  });
});
