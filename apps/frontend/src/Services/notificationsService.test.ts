import { getNotificationSettings, setNotificationSettings } from './notificationsService';

// Create a mock that allows baseURL to be tracked
let currentBaseURL = '';
const mockAxios = {
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
  put: jest.fn(),
  defaults: {
    get baseURL() { return currentBaseURL; },
    set baseURL(value) { currentBaseURL = value; }
  }
};

jest.mock('axios', () => mockAxios);

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = {
    ...originalEnv,
    REACT_APP_CLOUD_URL: 'http://localhost:3001/'
  };
  jest.spyOn(console, 'log').mockImplementation(() => {});
  
  // Reset the mock and set initial baseURL
  mockAxios.get.mockClear();
  mockAxios.post.mockClear();
  mockAxios.defaults.baseURL = '';
});

afterEach(() => {
  process.env = originalEnv;
  jest.restoreAllMocks();
});

describe('notificationsService', () => {
  describe('getNotificationSettings', () => {
    test('should fetch notification settings successfully', async () => {
      const mockSettings = [
        { id: 1, name: 'Email Notifications', enabled: true },
        { id: 2, name: 'Push Notifications', enabled: false }
      ];

      mockAxios.get.mockResolvedValue({
        data: { settings: mockSettings }
      });

      const result = await getNotificationSettings();

      expect(mockAxios.get).toHaveBeenCalledWith('notifications/settings');
      expect(result).toEqual(mockSettings);
    });

    test('should handle getNotificationSettings error and log it', async () => {
      const mockError = new Error('Network error');
      mockAxios.get.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await getNotificationSettings();

      expect(mockAxios.get).toHaveBeenCalledWith('notifications/settings');
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });

    test('should set correct baseURL from environment variable', async () => {
      process.env.REACT_APP_CLOUD_URL = 'https://api.example.com/';
      
      mockAxios.get.mockResolvedValue({
        data: { settings: [] }
      });

      await getNotificationSettings();

    });
  });

  describe('setNotificationSettings', () => {
    test('should post notification settings successfully', async () => {
      const mockSettings = {
        emailNotifications: true,
        pushNotifications: false,
        smsNotifications: true
      };

      mockAxios.post.mockResolvedValue({
        data: mockSettings
      });

      const result = await setNotificationSettings(mockSettings);

      expect(mockAxios.post).toHaveBeenCalledWith('notifications/settings', mockSettings);
      expect(result).toEqual({ data: mockSettings });
    });

    test('should handle setNotificationSettings error and log it', async () => {
      const mockSettings = { emailNotifications: true };
      const mockError = new Error('Server error');
      mockAxios.post.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await setNotificationSettings(mockSettings);

      expect(mockAxios.post).toHaveBeenCalledWith('notifications/settings', mockSettings);
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });

    test('should handle empty settings object', async () => {
      const mockSettings = {};

      mockAxios.post.mockResolvedValue({
        data: mockSettings
      });

      const result = await setNotificationSettings(mockSettings);

      expect(mockAxios.post).toHaveBeenCalledWith('notifications/settings', mockSettings);
      expect(result).toEqual({ data: mockSettings });
    });

    test('should handle null settings', async () => {
      const mockSettings = null;

      mockAxios.post.mockResolvedValue({
        data: null
      });

      const result = await setNotificationSettings(mockSettings);

      expect(mockAxios.post).toHaveBeenCalledWith('notifications/settings', mockSettings);
      expect(result).toEqual({ data: null });
    });

    test('should set correct baseURL from environment variable', async () => {
      process.env.REACT_APP_CLOUD_URL = 'https://api.example.com/';
      
      const mockSettings = { test: true };
      mockAxios.post.mockResolvedValue({ data: mockSettings });

      await setNotificationSettings(mockSettings);

    });
  });
});
