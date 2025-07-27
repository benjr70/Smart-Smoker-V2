import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { WifiManagerService } from './wifiManager.service';
import { wifiDto } from './wifiDto';
import { exec } from 'child_process';

// Mock node-wifi
const mockWifi = {
  init: jest.fn(),
  getCurrentConnections: jest.fn(),
  scan: jest.fn(),
  connect: jest.fn(),
};

jest.mock('node-wifi', () => mockWifi);

// Mock child_process
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

describe('WifiManagerService', () => {
  let service: WifiManagerService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [WifiManagerService],
    }).compile();

    service = module.get<WifiManagerService>(WifiManagerService);
  });

  describe('constructor', () => {
    it('should initialize wifi with wlan0 interface', () => {
      expect(mockWifi.init).toHaveBeenCalledWith({
        iface: 'wlan0'
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

    it('should handle null connections', () => {
      mockWifi.getCurrentConnections.mockReturnValue(null);

      const result = service.getConnection();

      expect(result).toBeNull();
    });
  });

  describe('connectToWiFi', () => {
    const testDto: wifiDto = {
      ssid: 'TestNetwork',
      password: 'testPassword123'
    };

    it('should successfully connect to WiFi', async () => {
      const mockResult = { success: true };
      mockWifi.scan.mockResolvedValue([]);
      mockWifi.connect.mockResolvedValue(mockResult);

      const result = await service.connectToWiFi(testDto);

      expect(mockWifi.scan).toHaveBeenCalled();
      expect(mockWifi.connect).toHaveBeenCalledWith({
        ssid: testDto.ssid,
        password: testDto.password
      });
      expect(result).toBe(mockResult);
    });

    it('should handle scan failure', async () => {
      const scanError = new Error('Scan failed');
      mockWifi.scan.mockRejectedValue(scanError);

      await expect(service.connectToWiFi(testDto)).rejects.toThrow(scanError);
      expect(mockWifi.connect).not.toHaveBeenCalled();
    });

    it('should handle connection failure and throw HttpException', async () => {
      const connectionError = new Error('Connection failed\nDetailed error message');
      mockWifi.scan.mockResolvedValue([]);
      mockWifi.connect.mockRejectedValue(connectionError);

      await expect(service.connectToWiFi(testDto)).rejects.toThrow(HttpException);

      try {
        await service.connectToWiFi(testDto);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(error.getResponse()).toEqual({
          status: HttpStatus.BAD_REQUEST,
          error: 'Detailed error message',
        });
      }
    });

    it('should handle connection error without detailed message', async () => {
      const connectionError = new Error('Simple error');
      mockWifi.scan.mockResolvedValue([]);
      mockWifi.connect.mockRejectedValue(connectionError);

      await expect(service.connectToWiFi(testDto)).rejects.toThrow(HttpException);

      try {
        await service.connectToWiFi(testDto);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(error.getResponse()).toEqual({
          status: HttpStatus.BAD_REQUEST,
          error: undefined,
        });
      }
    });

    it('should handle network not found error', async () => {
      const networkError = new Error('Command failed: nmcli -w 10 device wifi connect hhhhhhh password  ifname wlan0\\nError: No network with SSID \'hhhhhhh\' found.\\n');
      mockWifi.scan.mockResolvedValue([]);
      mockWifi.connect.mockRejectedValue(networkError);

      await expect(service.connectToWiFi(testDto)).rejects.toThrow(HttpException);

      try {
        await service.connectToWiFi(testDto);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        const response = error.getResponse();
        expect(response.error).toContain('No network with SSID');
      }
    });

    it('should handle empty DTO', async () => {
      const emptyDto: wifiDto = { ssid: '', password: '' };
      mockWifi.scan.mockResolvedValue([]);
      mockWifi.connect.mockResolvedValue({ success: true });

      const result = await service.connectToWiFi(emptyDto);

      expect(mockWifi.connect).toHaveBeenCalledWith({
        ssid: '',
        password: ''
      });
      expect(result).toEqual({ success: true });
    });
  });

  describe('disconnectFromWiFi', () => {
    it('should successfully disconnect from WiFi', async () => {
      const mockStdout = 'Device \'wlan0\' successfully disconnected.';
      (exec as unknown as jest.Mock).mockImplementation((command, callback) => {
        callback(null, mockStdout, '');
      });

      const result = await service.disconnectFromWiFi();

      expect(exec).toHaveBeenCalledWith(
        'nmcli device disconnect wlan0',
        expect.any(Function)
      );
      expect(result).toBe(mockStdout);
    });

    it('should handle disconnection error', async () => {
      const mockError = new Error('Disconnection failed');
      const mockStderr = 'Error: Could not disconnect wlan0';
      (exec as unknown as jest.Mock).mockImplementation((command, callback) => {
        callback(mockError, '', mockStderr);
      });

      await expect(service.disconnectFromWiFi()).rejects.toBe(mockStderr);

      expect(exec).toHaveBeenCalledWith(
        'nmcli device disconnect wlan0',
        expect.any(Function)
      );
    });

    it('should handle disconnection when no device is connected', async () => {
      const mockStderr = 'Error: Device \'wlan0\' is not active';
      (exec as unknown as jest.Mock).mockImplementation((command, callback) => {
        callback(new Error('Not active'), '', mockStderr);
      });

      await expect(service.disconnectFromWiFi()).rejects.toBe(mockStderr);
    });

    it('should handle partial success with warnings', async () => {
      const mockStdout = 'Device \'wlan0\' successfully disconnected.\nWarning: Connection may still be active';
      (exec as unknown as jest.Mock).mockImplementation((command, callback) => {
        callback(null, mockStdout, '');
      });

      const result = await service.disconnectFromWiFi();

      expect(result).toBe(mockStdout);
    });

    it('should handle empty stdout and stderr', async () => {
      (exec as unknown as jest.Mock).mockImplementation((command, callback) => {
        callback(null, '', '');
      });

      const result = await service.disconnectFromWiFi();

      expect(result).toBe('');
    });
  });

  describe('error handling edge cases', () => {
    it('should handle wifi.connect throwing non-Error objects', async () => {
      const testDto: wifiDto = { ssid: 'test', password: 'test' };
      mockWifi.scan.mockResolvedValue([]);
      mockWifi.connect.mockRejectedValue('String error');

      await expect(service.connectToWiFi(testDto)).rejects.toThrow();
    });

    it('should handle exec callback with undefined error and stderr', async () => {
      (exec as unknown as jest.Mock).mockImplementation((command, callback) => {
        callback(undefined, 'success', '');
      });

      const result = await service.disconnectFromWiFi();
      expect(result).toBe('success');
    });
  });
});