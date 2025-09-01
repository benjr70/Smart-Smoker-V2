import { connectToWiFi, getConnection, wifiManager } from './deviceService';

// Mock axios
jest.mock('axios', () => ({
  create: jest.fn(),
  defaults: {
    baseURL: '',
  },
  post: jest.fn(),
  get: jest.fn(),
}));

const mockAxios = require('axios');

describe('deviceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAxios.defaults.baseURL = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('connectToWiFi', () => {
    it('should successfully connect to WiFi with valid credentials', async () => {
      const mockCredentials: wifiManager = {
        ssid: 'TestNetwork',
        password: 'password123',
      };
      const mockResponse = { data: { success: true, message: 'Connected' } };

      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await connectToWiFi(mockCredentials);

      expect(mockAxios.defaults.baseURL).toBe('http://localhost:3003');
      expect(mockAxios.post).toHaveBeenCalledWith('api/wifiManager/connect', mockCredentials);
      expect(result).toEqual({ success: true, message: 'Connected' });
    });

    it('should handle connection failure', async () => {
      const mockCredentials: wifiManager = {
        ssid: 'InvalidNetwork',
        password: 'wrongpassword',
      };
      const mockError = new Error('Connection failed');

      mockAxios.post.mockRejectedValue(mockError);

      await expect(connectToWiFi(mockCredentials)).rejects.toThrow('Connection failed');
      expect(mockAxios.post).toHaveBeenCalledWith('api/wifiManager/connect', mockCredentials);
    });

    it('should handle empty credentials', async () => {
      const mockCredentials: wifiManager = {
        ssid: '',
        password: '',
      };
      const mockResponse = { data: { success: false, message: 'Invalid credentials' } };

      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await connectToWiFi(mockCredentials);

      expect(result).toEqual({ success: false, message: 'Invalid credentials' });
    });

    it('should handle network timeout', async () => {
      const mockCredentials: wifiManager = {
        ssid: 'TestNetwork',
        password: 'password123',
      };
      const timeoutError = new Error('timeout of 5000ms exceeded');

      mockAxios.post.mockRejectedValue(timeoutError);

      await expect(connectToWiFi(mockCredentials)).rejects.toThrow('timeout of 5000ms exceeded');
    });
  });

  describe('getConnection', () => {
    it('should successfully get connection status', async () => {
      const mockConnectionData = [{ ssid: 'ConnectedNetwork', status: 'connected' }];
      const mockResponse = { data: mockConnectionData };

      mockAxios.get.mockResolvedValue(mockResponse);

      const result = await getConnection();

      expect(mockAxios.defaults.baseURL).toBe('http://localhost:3003');
      expect(mockAxios.get).toHaveBeenCalledWith('api/wifiManager/connection');
      expect(result).toEqual(mockConnectionData);
    });

    it('should handle empty connection list', async () => {
      const mockResponse = { data: [] };

      mockAxios.get.mockResolvedValue(mockResponse);

      const result = await getConnection();

      expect(result).toEqual([]);
      expect(mockAxios.get).toHaveBeenCalledWith('api/wifiManager/connection');
    });

    it('should handle connection check failure', async () => {
      const mockError = new Error('Network error');

      mockAxios.get.mockRejectedValue(mockError);

      await expect(getConnection()).rejects.toThrow('Network error');
      expect(mockAxios.get).toHaveBeenCalledWith('api/wifiManager/connection');
    });

    it('should handle server error response', async () => {
      const serverError = {
        response: {
          status: 500,
          data: { error: 'Internal server error' },
        },
      };

      mockAxios.get.mockRejectedValue(serverError);

      await expect(getConnection()).rejects.toEqual(serverError);
    });

    it('should handle multiple connections', async () => {
      const mockConnectionData = [
        { ssid: 'Network1', status: 'connected' },
        { ssid: 'Network2', status: 'available' },
      ];
      const mockResponse = { data: mockConnectionData };

      mockAxios.get.mockResolvedValue(mockResponse);

      const result = await getConnection();

      expect(result).toEqual(mockConnectionData);
      expect(result).toHaveLength(2);
    });
  });
});
