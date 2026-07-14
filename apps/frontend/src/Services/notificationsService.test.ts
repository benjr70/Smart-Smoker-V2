import { getNotificationSettings, setNotificationSettings } from './notificationsService';

// Create a mock that allows baseURL to be tracked
let currentBaseURL = '';
const mockAxios = {
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
  put: jest.fn(),
  defaults: {
    get baseURL() {
      return currentBaseURL;
    },
    set baseURL(value) {
      currentBaseURL = value;
    },
  },
};

jest.mock('axios', () => mockAxios);

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = {
    ...originalEnv,
    REACT_APP_CLOUD_URL: 'http://localhost:3001/',
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
        { id: 2, name: 'Push Notifications', enabled: false },
      ];

      mockAxios.get.mockResolvedValue({
        data: { settings: mockSettings },
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
        data: { settings: [] },
      });

      await getNotificationSettings();
    });
  });

  describe('setNotificationSettings', () => {
    // The component posts `{ settings: NotificationsRef.current }`; rules fetched
    // from the backend carry a persisted subdocument `_id` that the strict
    // validation edge rejects, so the service must strip it before posting.
    const editableRule = {
      type: false,
      message: 'Meat done',
      probe1: 'Chamber',
      op: '>',
      probe2: 'Probe 1',
      offset: 5,
      temperature: 165,
    };

    test('should post only whitelisted rule fields, stripping _id/__v', async () => {
      const fetchedSettings = {
        settings: [{ ...editableRule, _id: 'rule-id-1', __v: 0 }],
      };

      mockAxios.post.mockResolvedValue({ data: fetchedSettings });

      await setNotificationSettings(fetchedSettings);

      expect(mockAxios.post).toHaveBeenCalledWith('notifications/settings', {
        settings: [editableRule],
      });
      const sentRule = mockAxios.post.mock.calls[0][1].settings[0];
      expect(sentRule).not.toHaveProperty('_id');
      expect(sentRule).not.toHaveProperty('__v');
    });

    test('should preserve lastNotificationSent when present', async () => {
      const sent = '2026-07-10T00:00:00.000Z';
      const fetchedSettings = {
        settings: [{ ...editableRule, _id: 'rule-id-1', lastNotificationSent: sent }],
      };

      mockAxios.post.mockResolvedValue({ data: fetchedSettings });

      await setNotificationSettings(fetchedSettings);

      const sentRule = mockAxios.post.mock.calls[0][1].settings[0];
      expect(sentRule.lastNotificationSent).toBe(sent);
      expect(sentRule).not.toHaveProperty('_id');
    });

    test('should handle setNotificationSettings error and log it', async () => {
      const fetchedSettings = { settings: [editableRule] };
      const mockError = new Error('Server error');
      mockAxios.post.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await setNotificationSettings(fetchedSettings);

      expect(mockAxios.post).toHaveBeenCalledWith('notifications/settings', {
        settings: [editableRule],
      });
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });

    test('should send an empty settings array when given no settings', async () => {
      mockAxios.post.mockResolvedValue({ data: {} });

      await setNotificationSettings({});

      expect(mockAxios.post).toHaveBeenCalledWith('notifications/settings', {
        settings: [],
      });
    });

    test('should handle null settings without throwing', async () => {
      mockAxios.post.mockResolvedValue({ data: null });

      await setNotificationSettings(null);

      expect(mockAxios.post).toHaveBeenCalledWith('notifications/settings', {
        settings: [],
      });
    });

    test('should set correct baseURL from environment variable', async () => {
      process.env.REACT_APP_CLOUD_URL = 'https://api.example.com/';

      mockAxios.post.mockResolvedValue({ data: {} });

      await setNotificationSettings({ settings: [editableRule] });
    });
  });
});
