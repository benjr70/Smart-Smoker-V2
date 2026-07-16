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
import { createApiClient } from '../api/client';
import { createFakeBackend, FakeBackend } from '../api/fakeBackend';

// Mock socket.io-client
const mockSocket = {
  emit: jest.fn(),
};

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

// The profile functions are now deprecated shims delegating to the deep API
// client. Mock only that client-injection boundary; below the seam the real
// client runs against an in-memory fake backend (no axios mocking for profile).
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return { ...actual, getDefaultApiClient: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const apiModule = require('../api');

// Self-contained axios mock for the remaining (non-profile) legacy functions
// that still use axios directly. Kept self-contained (no outer-scope const) so
// eagerly importing the real API client above — which pulls in the axios-based
// HTTP adapter at module load — cannot trip a temporal-dead-zone on the mock.
jest.mock('axios', () => {
  let currentBaseURL = '';
  return {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    put: jest.fn(),
    defaults: {
      get baseURL() {
        return currentBaseURL;
      },
      set baseURL(value: string) {
        currentBaseURL = value;
      },
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockAxios = require('axios');

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

  describe('smokeProfile (deprecated shims)', () => {
    let backend: FakeBackend;

    beforeEach(() => {
      backend = createFakeBackend({
        smokeProfile: {
          current: mockSmokeProfile,
          records: { 'profile-id-123': mockSmokeProfile },
        },
      });
      (apiModule.getDefaultApiClient as jest.Mock).mockReturnValue(createApiClient(backend));
    });

    describe('setSmokeProfile', () => {
      test('should save the current profile through the client', async () => {
        await setSmokeProfile(mockSmokeProfile);

        expect(backend.store.smokeProfile.current).toEqual(mockSmokeProfile);
        expect(backend.requests).toContainEqual({
          method: 'post',
          path: 'smokeProfile/current',
          body: mockSmokeProfile,
        });
      });

      test('should strip persisted _id/__v before posting', async () => {
        const fetchedProfile = {
          ...mockSmokeProfile,
          _id: 'profile-id-1',
          __v: 5,
        } as smokeProfile;

        await setSmokeProfile(fetchedProfile);

        const post = backend.requests.find(r => r.method === 'post');
        expect(post?.body).toEqual(mockSmokeProfile);
        expect(post?.body).not.toHaveProperty('_id');
        expect(post?.body).not.toHaveProperty('__v');
      });

      test('should swallow-and-log on failure and resolve undefined', async () => {
        backend.injectFault({ method: 'post', path: 'smokeProfile/current', status: 500 });
        const consoleLogSpy = jest.spyOn(console, 'log');

        const result = await setSmokeProfile(mockSmokeProfile);

        expect(result).toBeUndefined();
        expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('getSmokeProfileById', () => {
      test('should get smoke profile by id successfully', async () => {
        const result = await getSmokeProfileById('profile-id-123');

        expect(result).toEqual(mockSmokeProfile);
        expect(backend.requests).toContainEqual({
          method: 'get',
          path: 'smokeProfile/profile-id-123',
          body: undefined,
        });
      });

      test('should default missing notes and woodType fields to empty strings', async () => {
        backend = createFakeBackend({
          smokeProfile: {
            records: {
              'profile-id-123': {
                chamberName: 'Main Chamber',
                probe1Name: 'Meat Probe',
                probe2Name: 'Chamber Probe',
                probe3Name: 'Water Pan',
                // notes and woodType missing
              },
            },
          },
        });
        (apiModule.getDefaultApiClient as jest.Mock).mockReturnValue(createApiClient(backend));

        const result = await getSmokeProfileById('profile-id-123');

        expect(result.notes).toBe('');
        expect(result.woodType).toBe('');
      });

      test('should swallow-and-log on failure and resolve undefined', async () => {
        const consoleLogSpy = jest.spyOn(console, 'log');

        const result = await getSmokeProfileById('missing');

        expect(result).toBeUndefined();
        expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('getCurrentSmokeProfile', () => {
      test('should get the current smoke profile successfully', async () => {
        const result = await getCurrentSmokeProfile();

        expect(result).toEqual(mockSmokeProfile);
        expect(backend.requests).toContainEqual({
          method: 'get',
          path: 'smokeProfile/current',
          body: undefined,
        });
      });

      test('should default missing notes and woodType fields to empty strings', async () => {
        backend = createFakeBackend({
          smokeProfile: {
            current: {
              chamberName: 'Main Chamber',
              probe1Name: 'Meat Probe',
              probe2Name: 'Chamber Probe',
              probe3Name: 'Water Pan',
            },
          },
        });
        (apiModule.getDefaultApiClient as jest.Mock).mockReturnValue(createApiClient(backend));

        const result = await getCurrentSmokeProfile();

        expect(result.notes).toBe('');
        expect(result.woodType).toBe('');
      });

      test('should swallow-and-log on failure and resolve undefined', async () => {
        backend.injectFault({ method: 'get', path: 'smokeProfile/current', status: 500 });
        const consoleLogSpy = jest.spyOn(console, 'log');

        const result = await getCurrentSmokeProfile();

        expect(result).toBeUndefined();
        expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('deleteSmokeProfileById', () => {
      test('should delete a stored profile through the client', async () => {
        await deleteSmokeProfileById('profile-id-123');

        expect(backend.store.smokeProfile.records['profile-id-123']).toBeUndefined();
        expect(backend.requests).toContainEqual({
          method: 'delete',
          path: 'smokeProfile/profile-id-123',
          body: undefined,
        });
      });

      test('should swallow-and-log on failure and resolve undefined', async () => {
        backend.injectFault({
          method: 'delete',
          path: 'smokeProfile/profile-id-123',
          status: 500,
        });
        const consoleLogSpy = jest.spyOn(console, 'log');

        const result = await deleteSmokeProfileById('profile-id-123');

        expect(result).toBeUndefined();
        expect(consoleLogSpy).toHaveBeenCalledTimes(1);
        // the faulted delete must leave the record intact
        expect(backend.store.smokeProfile.records['profile-id-123']).toEqual(mockSmokeProfile);
      });
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
