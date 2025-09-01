import { Test, TestingModule } from '@nestjs/testing';
import { WifiManagerController } from './wifiManager.controller';
import { WifiManagerService } from './wifiManager.service';
import { wifiDto } from './wifiDto';

describe('WifiManagerController', () => {
  let controller: WifiManagerController;
  let service: WifiManagerService;
  let module: TestingModule;

  const mockWifiManagerService = {
    connectToWiFi: jest.fn(),
    disconnectFromWiFi: jest.fn(),
    getConnection: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      controllers: [WifiManagerController],
      providers: [
        {
          provide: WifiManagerService,
          useValue: mockWifiManagerService,
        },
      ],
    }).compile();

    controller = module.get<WifiManagerController>(WifiManagerController);
    service = module.get<WifiManagerService>(WifiManagerService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    if (module) {
      await module.close();
    }
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('connectWifi', () => {
    const testDto: wifiDto = {
      ssid: 'TestNetwork',
      password: 'testPassword123',
    };

    it('should successfully connect to WiFi', async () => {
      const mockResult = { success: true, message: 'Connected successfully' };
      mockWifiManagerService.connectToWiFi.mockResolvedValue(mockResult);

      const result = await controller.connectWifi(testDto);

      expect(service.connectToWiFi).toHaveBeenCalledWith(testDto);
      expect(result).toBe(mockResult);
    });

    it('should handle connection failure', async () => {
      const mockError = new Error('Connection failed');
      mockWifiManagerService.connectToWiFi.mockRejectedValue(mockError);

      await expect(controller.connectWifi(testDto)).rejects.toThrow(mockError);
      expect(service.connectToWiFi).toHaveBeenCalledWith(testDto);
    });

    it('should handle DTO with empty values', async () => {
      const emptyDto: wifiDto = { ssid: '', password: '' };
      const mockResult = { success: false, error: 'Invalid credentials' };
      mockWifiManagerService.connectToWiFi.mockResolvedValue(mockResult);

      const result = await controller.connectWifi(emptyDto);

      expect(service.connectToWiFi).toHaveBeenCalledWith(emptyDto);
      expect(result).toBe(mockResult);
    });

    it('should handle DTO with special characters', async () => {
      const specialDto: wifiDto = {
        ssid: 'Network-With_Special.Chars',
        password: 'p@ssw0rd!@#$%^&*()_+',
      };
      const mockResult = { success: true };
      mockWifiManagerService.connectToWiFi.mockResolvedValue(mockResult);

      const result = await controller.connectWifi(specialDto);

      expect(service.connectToWiFi).toHaveBeenCalledWith(specialDto);
      expect(result).toBe(mockResult);
    });

    it('should handle very long SSID and password', async () => {
      const longDto: wifiDto = {
        ssid: 'A'.repeat(100),
        password: 'B'.repeat(100),
      };
      const mockResult = { success: true };
      mockWifiManagerService.connectToWiFi.mockResolvedValue(mockResult);

      const result = await controller.connectWifi(longDto);

      expect(service.connectToWiFi).toHaveBeenCalledWith(longDto);
      expect(result).toBe(mockResult);
    });
  });

  describe('disconnectWifi', () => {
    it('should successfully disconnect from WiFi', async () => {
      const mockResult = "Device 'wlan0' successfully disconnected.";
      mockWifiManagerService.disconnectFromWiFi.mockResolvedValue(mockResult);

      const result = await controller.disconnectWifi();

      expect(service.disconnectFromWiFi).toHaveBeenCalled();
      expect(result).toBe(mockResult);
    });

    it('should handle disconnection failure', async () => {
      const mockError = new Error('Disconnection failed');
      mockWifiManagerService.disconnectFromWiFi.mockRejectedValue(mockError);

      await expect(controller.disconnectWifi()).rejects.toThrow(mockError);
      expect(service.disconnectFromWiFi).toHaveBeenCalled();
    });

    it('should handle empty response from service', async () => {
      mockWifiManagerService.disconnectFromWiFi.mockResolvedValue('');

      const result = await controller.disconnectWifi();

      expect(service.disconnectFromWiFi).toHaveBeenCalled();
      expect(result).toBe('');
    });

    it('should handle null response from service', async () => {
      mockWifiManagerService.disconnectFromWiFi.mockResolvedValue(null);

      const result = await controller.disconnectWifi();

      expect(service.disconnectFromWiFi).toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('getConnection', () => {
    it('should return current WiFi connections', async () => {
      const mockConnections = [
        { ssid: 'Network1', signal_level: -40 },
        { ssid: 'Network2', signal_level: -60 },
      ];
      mockWifiManagerService.getConnection.mockResolvedValue(mockConnections);

      const result = await controller.getConnection();

      expect(service.getConnection).toHaveBeenCalled();
      expect(result).toBe(mockConnections);
    });

    it('should handle empty connections list', async () => {
      mockWifiManagerService.getConnection.mockResolvedValue([]);

      const result = await controller.getConnection();

      expect(service.getConnection).toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should handle null connections', async () => {
      mockWifiManagerService.getConnection.mockResolvedValue(null);

      const result = await controller.getConnection();

      expect(service.getConnection).toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should handle service throwing error', async () => {
      const mockError = new Error('Failed to get connections');
      mockWifiManagerService.getConnection.mockRejectedValue(mockError);

      await expect(controller.getConnection()).rejects.toThrow(mockError);
      expect(service.getConnection).toHaveBeenCalled();
    });

    it('should handle complex connection objects', async () => {
      const mockConnections = [
        {
          ssid: 'Complex-Network',
          signal_level: -45,
          security: 'WPA2',
          frequency: 2400,
          quality: 70,
          mac: '00:11:22:33:44:55',
        },
      ];
      mockWifiManagerService.getConnection.mockResolvedValue(mockConnections);

      const result = await controller.getConnection();

      expect(service.getConnection).toHaveBeenCalled();
      expect(result).toBe(mockConnections);
    });
  });

  describe('service injection', () => {
    it('should have service injected correctly', () => {
      expect(controller['wifiManagerServicer']).toBe(service);
    });

    it('should call service methods through controller', async () => {
      const testDto: wifiDto = { ssid: 'test', password: 'test' };

      mockWifiManagerService.connectToWiFi.mockResolvedValue({ success: true });
      mockWifiManagerService.disconnectFromWiFi.mockResolvedValue(
        'disconnected',
      );
      mockWifiManagerService.getConnection.mockResolvedValue([]);

      await controller.connectWifi(testDto);
      await controller.disconnectWifi();
      await controller.getConnection();

      expect(service.connectToWiFi).toHaveBeenCalledTimes(1);
      expect(service.disconnectFromWiFi).toHaveBeenCalledTimes(1);
      expect(service.getConnection).toHaveBeenCalledTimes(1);
    });
  });

  describe('error propagation', () => {
    it('should propagate HTTP exceptions from service', async () => {
      const httpError = new Error('HTTP 400: Bad Request');
      httpError.name = 'HttpException';
      mockWifiManagerService.connectToWiFi.mockRejectedValue(httpError);

      const testDto: wifiDto = { ssid: 'test', password: 'test' };

      await expect(controller.connectWifi(testDto)).rejects.toThrow(httpError);
    });

    it('should propagate network errors from service', async () => {
      const networkError = new Error('ENETUNREACH: Network unreachable');
      mockWifiManagerService.getConnection.mockRejectedValue(networkError);

      await expect(controller.getConnection()).rejects.toThrow(networkError);
    });

    it('should propagate timeout errors from service', async () => {
      const timeoutError = new Error('ETIMEDOUT: Connection timeout');
      mockWifiManagerService.disconnectFromWiFi.mockRejectedValue(timeoutError);

      await expect(controller.disconnectWifi()).rejects.toThrow(timeoutError);
    });
  });
});
