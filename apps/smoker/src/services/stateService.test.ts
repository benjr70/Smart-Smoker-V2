import {
  toggleSmoking,
  getState,
  getCurrentSmokeProfile,
  State,
  smokeProfile,
} from './stateService';

// Mock environment variable before importing
const mockEnvUrl = 'http://test-api.com';
process.env.REACT_APP_CLOUD_URL_API = mockEnvUrl;

// Mock axios
jest.mock('axios', () => ({
  create: jest.fn(),
  defaults: {
    baseURL: '',
  },
  put: jest.fn(),
  get: jest.fn(),
}));

const mockAxios = require('axios');

describe('stateService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAxios.defaults.baseURL = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('toggleSmoking', () => {
    it('should successfully toggle smoking state to true', async () => {
      const mockState: State = {
        smokeId: 'smoke123',
        smoking: true,
      };
      const mockResponse = { data: mockState };

      mockAxios.put.mockResolvedValue(mockResponse);

      const result = await toggleSmoking();

      expect(mockAxios.put).toHaveBeenCalledWith('state/toggleSmoking');
      expect(result).toEqual(mockState);
    });

    it('should successfully toggle smoking state to false', async () => {
      const mockState: State = {
        smokeId: 'smoke123',
        smoking: false,
      };
      const mockResponse = { data: mockState };

      mockAxios.put.mockResolvedValue(mockResponse);

      const result = await toggleSmoking();

      expect(result).toEqual(mockState);
      expect(result.smoking).toBe(false);
    });

    it('should handle toggle smoking API error', async () => {
      const apiError = new Error('API is not available');

      mockAxios.put.mockRejectedValue(apiError);

      await expect(toggleSmoking()).rejects.toThrow('API is not available');
      expect(mockAxios.put).toHaveBeenCalledWith('state/toggleSmoking');
    });

    it('should handle network timeout', async () => {
      const timeoutError = new Error('timeout of 5000ms exceeded');

      mockAxios.put.mockRejectedValue(timeoutError);

      await expect(toggleSmoking()).rejects.toThrow('timeout of 5000ms exceeded');
    });

    it('should handle server error response', async () => {
      const serverError = {
        response: {
          status: 500,
          data: { error: 'Internal server error' },
        },
      };

      mockAxios.put.mockRejectedValue(serverError);

      await expect(toggleSmoking()).rejects.toEqual(serverError);
    });
  });

  describe('getState', () => {
    it('should successfully get current state', async () => {
      const mockState: State = {
        smokeId: 'current-smoke-456',
        smoking: true,
      };
      const mockResponse = { data: mockState };

      mockAxios.get.mockResolvedValue(mockResponse);

      const result = await getState();

      expect(mockAxios.get).toHaveBeenCalledWith('state');
      expect(result).toEqual(mockState);
    });

    it('should handle state not found', async () => {
      const notFoundError = {
        response: {
          status: 404,
          data: { error: 'State not found' },
        },
      };

      mockAxios.get.mockRejectedValue(notFoundError);

      await expect(getState()).rejects.toEqual(notFoundError);
    });

    it('should handle get state API error', async () => {
      const apiError = new Error('Failed to fetch state');

      mockAxios.get.mockRejectedValue(apiError);

      await expect(getState()).rejects.toThrow('Failed to fetch state');
      expect(mockAxios.get).toHaveBeenCalledWith('state');
    });

    it('should handle empty state response', async () => {
      const mockState: State = {
        smokeId: '',
        smoking: false,
      };
      const mockResponse = { data: mockState };

      mockAxios.get.mockResolvedValue(mockResponse);

      const result = await getState();

      expect(result).toEqual(mockState);
      expect(result.smokeId).toBe('');
      expect(result.smoking).toBe(false);
    });
  });

  describe('getCurrentSmokeProfile', () => {
    it('should successfully get current smoke profile with all fields', async () => {
      const mockProfile: smokeProfile = {
        chamberName: 'Main Chamber',
        probe1Name: 'Brisket Probe',
        probe2Name: 'Ambient Probe',
        probe3Name: 'Spare Probe',
        notes: 'Test smoking session',
        woodType: 'Hickory',
      };
      const mockResponse = { data: mockProfile };

      mockAxios.get.mockResolvedValue(mockResponse);

      const result = await getCurrentSmokeProfile();

      expect(mockAxios.get).toHaveBeenCalledWith('smokeProfile/current');
      expect(result).toEqual(mockProfile);
    });

    it('should handle profile with missing notes field', async () => {
      const mockProfile = {
        chamberName: 'Main Chamber',
        probe1Name: 'Brisket Probe',
        probe2Name: 'Ambient Probe',
        probe3Name: 'Spare Probe',
        woodType: 'Oak',
        // notes field missing
      };
      const mockResponse = { data: mockProfile };

      mockAxios.get.mockResolvedValue(mockResponse);

      const result = await getCurrentSmokeProfile();

      expect(result.notes).toBe('');
      expect(result.woodType).toBe('Oak');
    });

    it('should handle profile with missing woodType field', async () => {
      const mockProfile = {
        chamberName: 'Main Chamber',
        probe1Name: 'Brisket Probe',
        probe2Name: 'Ambient Probe',
        probe3Name: 'Spare Probe',
        notes: 'Test run',
        // woodType field missing
      };
      const mockResponse = { data: mockProfile };

      mockAxios.get.mockResolvedValue(mockResponse);

      const result = await getCurrentSmokeProfile();

      expect(result.notes).toBe('Test run');
      expect(result.woodType).toBe('');
    });

    it('should handle profile with both notes and woodType missing', async () => {
      const mockProfile = {
        chamberName: 'Main Chamber',
        probe1Name: 'Brisket Probe',
        probe2Name: 'Ambient Probe',
        probe3Name: 'Spare Probe',
        // notes and woodType fields missing
      };
      const mockResponse = { data: mockProfile };

      mockAxios.get.mockResolvedValue(mockResponse);

      const result = await getCurrentSmokeProfile();

      expect(result.notes).toBe('');
      expect(result.woodType).toBe('');
    });

    it('should handle API error with console.log', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const apiError = new Error('Profile not found');

      mockAxios.get.mockRejectedValue(apiError);

      const result = await getCurrentSmokeProfile();

      expect(consoleLogSpy).toHaveBeenCalledWith(apiError);
      expect(result).toBeUndefined();

      consoleLogSpy.mockRestore();
    });

    it('should handle network timeout error', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const timeoutError = new Error('timeout of 5000ms exceeded');

      mockAxios.get.mockRejectedValue(timeoutError);

      const result = await getCurrentSmokeProfile();

      expect(consoleLogSpy).toHaveBeenCalledWith(timeoutError);
      expect(result).toBeUndefined();

      consoleLogSpy.mockRestore();
    });

    it('should handle server error response', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const serverError = {
        response: {
          status: 500,
          data: { error: 'Internal server error' },
        },
      };

      mockAxios.get.mockRejectedValue(serverError);

      const result = await getCurrentSmokeProfile();

      expect(consoleLogSpy).toHaveBeenCalledWith(serverError);
      expect(result).toBeUndefined();

      consoleLogSpy.mockRestore();
    });
  });
});
