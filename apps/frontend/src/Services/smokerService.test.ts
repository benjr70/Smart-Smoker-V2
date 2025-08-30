import {
  toggleSmoking,
  clearSmoke,
  getState,
  setSmokeProfile,
  getSmokeProfileById,
  FinishSmoke,
  getCurrentSmokeProfile,
  getSmokeHistory,
  getAllSmoke,
  getSmokeById,
  deleteSmokeProfileById,
  deleteSmokeById,
  smokeProfile,
} from './smokerService';
import { State } from '../components/common/interfaces/state';
import { smokeHistory } from '../components/common/interfaces/history';

// Mock socket.io-client
const mockSocket = {
  emit: jest.fn(),
};

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

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
  process.env = {
    ...originalEnv,
    REACT_APP_CLOUD_URL: 'http://localhost:3001/',
    WS_URL: 'ws://localhost:3002',
  };
  mockAxios.get.mockClear();
  mockAxios.post.mockClear();
  mockAxios.put.mockClear();
  mockAxios.delete.mockClear();
  mockSocket.emit.mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  process.env = originalEnv;
  jest.restoreAllMocks();
});

describe('smokerService', () => {
  const mockState: State = {
    smokeId: 'test-smoke-id',
    smoking: true,
  };

  const mockSmokeProfile: smokeProfile = {
    chamberName: 'Main Chamber',
    probe1Name: 'Meat Probe',
    probe2Name: 'Chamber Probe',
    probe3Name: 'Water Pan',
    notes: 'Test smoke',
    woodType: 'Hickory',
  };

  const mockSmokeHistory: smokeHistory[] = [
    {
      name: 'Test Brisket',
      meatType: 'Beef',
      weight: '12',
      weightUnit: 'lbs',
      woodType: 'Hickory',
      date: '2025-01-01',
      smokeId: 'smoke-id-1',
      overAllRating: '8',
    },
  ];

  describe('toggleSmoking', () => {
    test('should toggle smoking successfully', async () => {
      const mockAxios = require('axios');
      mockAxios.put.mockResolvedValue({
        data: mockState,
      });

      const result = await toggleSmoking();

      expect(mockAxios.put).toHaveBeenCalledWith('state/toggleSmoking');
      expect(result).toEqual(mockState);
    });

    test('should handle toggleSmoking when axios throws error', async () => {
      const mockError = new Error('Server error');
      const mockAxios = require('axios');
      mockAxios.put.mockRejectedValue(mockError);

      await expect(toggleSmoking()).rejects.toThrow('Server error');
      expect(mockAxios.put).toHaveBeenCalledWith('state/toggleSmoking');
    });

    test('should set correct baseURL from environment variable', async () => {
      process.env.REACT_APP_CLOUD_URL = 'https://api.example.com/';

      const mockAxios = require('axios');
      mockAxios.put.mockResolvedValue({ data: mockState });

      await toggleSmoking();
    });
  });

  describe('clearSmoke', () => {
    test('should clear smoke successfully with socket emission', async () => {
      const mockSocket = {
        emit: jest.fn(),
      };
      const { io } = require('socket.io-client');
      io.mockReturnValue(mockSocket);

      const mockAxios = require('axios');
      mockAxios.put.mockResolvedValue({
        data: mockState,
      });

      const result = await clearSmoke();

      expect(io).toHaveBeenCalledWith('ws://localhost:3002');
      expect(mockSocket.emit).toHaveBeenCalledWith('clear', true);
      expect(mockAxios.put).toHaveBeenCalledWith('state/clearSmoke');
      expect(result).toEqual(mockState);
    });

    test('should handle clearSmoke error and log it', async () => {
      const mockSocket = {
        emit: jest.fn(),
      };
      const { io } = require('socket.io-client');
      io.mockReturnValue(mockSocket);

      const mockError = new Error('Clear failed');
      const mockAxios = require('axios');
      mockAxios.put.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await clearSmoke();

      expect(mockSocket.emit).toHaveBeenCalledWith('clear', true);
      expect(mockAxios.put).toHaveBeenCalledWith('state/clearSmoke');
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });

    test('should handle missing WS_URL environment variable', async () => {
      delete process.env.WS_URL;

      const mockSocket = {
        emit: jest.fn(),
      };
      const { io } = require('socket.io-client');
      io.mockReturnValue(mockSocket);

      const mockAxios = require('axios');
      mockAxios.put.mockResolvedValue({ data: mockState });

      await clearSmoke();

      expect(io).toHaveBeenCalledWith('');
      expect(mockSocket.emit).toHaveBeenCalledWith('clear', true);
    });
  });

  describe('getState', () => {
    test('should get state successfully', async () => {
      const mockAxios = require('axios');
      mockAxios.get.mockResolvedValue({
        data: mockState,
      });

      const result = await getState();

      expect(mockAxios.get).toHaveBeenCalledWith('state');
      expect(result).toEqual(mockState);
    });

    test('should handle getState error and log it', async () => {
      const mockError = new Error('Get state failed');
      const mockAxios = require('axios');
      mockAxios.get.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await getState();

      expect(mockAxios.get).toHaveBeenCalledWith('state');
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });
  });

  describe('setSmokeProfile', () => {
    test('should set smoke profile successfully', async () => {
      const mockAxios = require('axios');
      mockAxios.post.mockResolvedValue({
        data: mockSmokeProfile,
      });

      const result = await setSmokeProfile(mockSmokeProfile);

      expect(mockAxios.post).toHaveBeenCalledWith('smokeProfile/current', mockSmokeProfile);
      expect(result).toEqual({ data: mockSmokeProfile });
    });

    test('should handle setSmokeProfile error and log it', async () => {
      const mockError = new Error('Set profile failed');
      const mockAxios = require('axios');
      mockAxios.post.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await setSmokeProfile(mockSmokeProfile);

      expect(mockAxios.post).toHaveBeenCalledWith('smokeProfile/current', mockSmokeProfile);
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });
  });

  describe('getSmokeProfileById', () => {
    test('should get smoke profile by id successfully', async () => {
      const testId = 'profile-id-123';
      const mockAxios = require('axios');
      mockAxios.get.mockResolvedValue({
        data: mockSmokeProfile,
      });

      const result = await getSmokeProfileById(testId);

      expect(mockAxios.get).toHaveBeenCalledWith('smokeProfile/' + testId);
      expect(result).toEqual(mockSmokeProfile);
    });

    test('should handle missing notes and woodType fields', async () => {
      const testId = 'profile-id-123';
      const profileWithoutOptionalFields = {
        chamberName: 'Main Chamber',
        probe1Name: 'Meat Probe',
        probe2Name: 'Chamber Probe',
        probe3Name: 'Water Pan',
        // notes and woodType missing
      };

      const mockAxios = require('axios');
      mockAxios.get.mockResolvedValue({
        data: profileWithoutOptionalFields,
      });

      const result = await getSmokeProfileById(testId);

      expect(result.notes).toBe('');
      expect(result.woodType).toBe('');
    });

    test('should handle getSmokeProfileById error and log it', async () => {
      const testId = 'profile-id-123';
      const mockError = new Error('Profile not found');
      const mockAxios = require('axios');
      mockAxios.get.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await getSmokeProfileById(testId);

      expect(mockAxios.get).toHaveBeenCalledWith('smokeProfile/' + testId);
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });
  });

  describe('FinishSmoke', () => {
    test('should finish smoke successfully', async () => {
      const mockFinishResponse = { message: 'Smoke finished' };
      const mockAxios = require('axios');
      mockAxios.post.mockResolvedValue({
        data: mockFinishResponse,
      });

      const result = await FinishSmoke();

      expect(mockAxios.post).toHaveBeenCalledWith('smoke/finish');
      expect(result).toEqual(mockFinishResponse);
    });

    test('should handle FinishSmoke error and log it', async () => {
      const mockError = new Error('Finish smoke failed');
      const mockAxios = require('axios');
      mockAxios.post.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await FinishSmoke();

      expect(mockAxios.post).toHaveBeenCalledWith('smoke/finish');
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });
  });

  describe('getCurrentSmokeProfile', () => {
    test('should get current smoke profile successfully', async () => {
      const mockAxios = require('axios');
      mockAxios.get.mockResolvedValue({
        data: mockSmokeProfile,
      });

      const result = await getCurrentSmokeProfile();

      expect(mockAxios.get).toHaveBeenCalledWith('smokeProfile/current');
      expect(result).toEqual(mockSmokeProfile);
    });

    test('should handle missing notes and woodType fields in current profile', async () => {
      const profileWithoutOptionalFields = {
        chamberName: 'Main Chamber',
        probe1Name: 'Meat Probe',
        probe2Name: 'Chamber Probe',
        probe3Name: 'Water Pan',
      };

      const mockAxios = require('axios');
      mockAxios.get.mockResolvedValue({
        data: profileWithoutOptionalFields,
      });

      const result = await getCurrentSmokeProfile();

      expect(result.notes).toBe('');
      expect(result.woodType).toBe('');
    });

    test('should handle getCurrentSmokeProfile error and log it', async () => {
      const mockError = new Error('Get current profile failed');
      const mockAxios = require('axios');
      mockAxios.get.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await getCurrentSmokeProfile();

      expect(mockAxios.get).toHaveBeenCalledWith('smokeProfile/current');
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });
  });

  describe('getSmokeHistory', () => {
    test('should get smoke history successfully', async () => {
      const mockAxios = require('axios');
      mockAxios.get.mockResolvedValue({
        data: mockSmokeHistory,
      });

      const result = await getSmokeHistory();

      expect(mockAxios.get).toHaveBeenCalledWith('history');
      expect(result).toEqual(mockSmokeHistory);
    });

    test('should handle getSmokeHistory error and log it', async () => {
      const mockError = new Error('Get history failed');
      const mockAxios = require('axios');
      mockAxios.get.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await getSmokeHistory();

      expect(mockAxios.get).toHaveBeenCalledWith('history');
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });
  });

  describe('getAllSmoke', () => {
    test('should get all smoke successfully', async () => {
      const mockAllSmoke = [{ id: '1' }, { id: '2' }];
      const mockAxios = require('axios');
      mockAxios.get.mockResolvedValue({
        data: mockAllSmoke,
      });

      const result = await getAllSmoke();

      expect(mockAxios.get).toHaveBeenCalledWith('smoke/all');
      expect(result).toEqual(mockAllSmoke);
    });

    test('should handle getAllSmoke error and log it', async () => {
      const mockError = new Error('Get all smoke failed');
      const mockAxios = require('axios');
      mockAxios.get.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await getAllSmoke();

      expect(mockAxios.get).toHaveBeenCalledWith('smoke/all');
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });
  });

  describe('getSmokeById', () => {
    test('should get smoke by id successfully', async () => {
      const testId = 'smoke-id-123';
      const mockSmoke = { id: testId, duration: 180 };
      const mockAxios = require('axios');
      mockAxios.get.mockResolvedValue({
        data: mockSmoke,
      });

      const result = await getSmokeById(testId);

      expect(mockAxios.get).toHaveBeenCalledWith('smoke/' + testId);
      expect(result).toEqual(mockSmoke);
    });

    test('should handle getSmokeById error and log it', async () => {
      const testId = 'smoke-id-123';
      const mockError = new Error('Smoke not found');
      const mockAxios = require('axios');
      mockAxios.get.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await getSmokeById(testId);

      expect(mockAxios.get).toHaveBeenCalledWith('smoke/' + testId);
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });
  });

  describe('deleteSmokeProfileById', () => {
    test('should delete smoke profile by id successfully', async () => {
      const testId = 'profile-id-123';
      const mockAxios = require('axios');
      mockAxios.delete.mockResolvedValue({});

      const result = await deleteSmokeProfileById(testId);

      expect(mockAxios.delete).toHaveBeenCalledWith('smokeProfile/' + testId);
      expect(result).toEqual({});
    });

    test('should handle deleteSmokeProfileById error and log it', async () => {
      const testId = 'profile-id-123';
      const mockError = new Error('Delete profile failed');
      const mockAxios = require('axios');
      mockAxios.delete.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await deleteSmokeProfileById(testId);

      expect(mockAxios.delete).toHaveBeenCalledWith('smokeProfile/' + testId);
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });
  });

  describe('deleteSmokeById', () => {
    test('should delete smoke by id successfully', async () => {
      const testId = 'smoke-id-123';
      const mockAxios = require('axios');
      mockAxios.delete.mockResolvedValue({});

      const result = await deleteSmokeById(testId);

      expect(mockAxios.delete).toHaveBeenCalledWith('smoke/' + testId);
      expect(result).toEqual({});
    });

    test('should handle deleteSmokeById error and log it', async () => {
      const testId = 'smoke-id-123';
      const mockError = new Error('Delete smoke failed');
      const mockAxios = require('axios');
      mockAxios.delete.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await deleteSmokeById(testId);

      expect(mockAxios.delete).toHaveBeenCalledWith('smoke/' + testId);
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });
  });
});
