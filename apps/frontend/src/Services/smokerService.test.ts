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
import { smokeHistory } from '../components/common/interfaces/history';
import { Smoke, SmokeEventPort } from '../api';
import { createApiClient } from '../api/client';
import { createFakeBackend, FakeBackend } from '../api/fakeBackend';

// The state/smoke/history/profile functions are now deprecated shims delegating
// to the deep API client. Mock only that client-injection boundary; below the
// seam the real client runs against an in-memory fake backend — no axios or
// socket mocking for the migrated functions.
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return { ...actual, getDefaultApiClient: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const apiModule = require('../api');

// Self-contained axios mock for the one remaining legacy function
// (deleteSmokeById) that still uses axios directly. Kept self-contained (no
// outer-scope const) so eagerly importing the real API client above — which
// pulls in the axios-based HTTP adapter at module load — cannot trip a
// temporal-dead-zone on the mock.
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

const originalEnv = process.env;

beforeEach(() => {
  process.env = {
    ...originalEnv,
    REACT_APP_CLOUD_URL: 'http://localhost:3001/',
  };
  mockAxios.get.mockClear();
  mockAxios.post.mockClear();
  mockAxios.put.mockClear();
  mockAxios.delete.mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  process.env = originalEnv;
  jest.restoreAllMocks();
});

describe('smokerService', () => {
  const mockSmokeProfile: smokeProfile = {
    chamberName: 'Main Chamber',
    probe1Name: 'Meat Probe',
    probe2Name: 'Chamber Probe',
    probe3Name: 'Water Pan',
    notes: 'Test smoke',
    woodType: 'Hickory',
  };

  const mockSmoke: Smoke = {
    preSmokeId: 'pre-1',
    tempsId: 'temps-1',
    postSmokeId: 'post-1',
    smokeProfileId: 'profile-1',
    ratingId: 'rating-1',
    date: new Date('2025-01-01T00:00:00Z'),
    status: 0,
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

  describe('state/smoke/history (deprecated shims)', () => {
    let backend: FakeBackend;
    let emitClear: jest.Mock;

    beforeEach(() => {
      emitClear = jest.fn();
      const events: SmokeEventPort = { emitClear };
      backend = createFakeBackend({
        state: { smokeId: 'smoke-id-1', smoking: false },
        smoke: {
          records: { 'smoke-id-1': mockSmoke },
          all: [mockSmoke],
          finish: mockSmoke,
        },
        history: mockSmokeHistory,
      });
      (apiModule.getDefaultApiClient as jest.Mock).mockReturnValue(
        createApiClient(backend, events)
      );
    });

    describe('toggleSmoking', () => {
      test('should toggle smoking through the client', async () => {
        const result = await toggleSmoking();

        expect(result.smoking).toBe(true);
        expect(backend.requests).toContainEqual({
          method: 'put',
          path: 'state/toggleSmoking',
          body: undefined,
        });
      });

      test('should keep rejecting (not swallow) when the backend fails', async () => {
        backend.injectFault({ method: 'put', path: 'state/toggleSmoking', status: 500 });

        await expect(toggleSmoking()).rejects.toThrow();
      });
    });

    describe('clearSmoke', () => {
      test('should clear through the client and fire the event port once', async () => {
        const result = await clearSmoke();

        expect(emitClear).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ smokeId: '', smoking: false });
        expect(backend.requests).toContainEqual({
          method: 'put',
          path: 'state/clearSmoke',
          body: undefined,
        });
      });

      test('should swallow-and-log on failure and resolve undefined', async () => {
        backend.injectFault({ method: 'put', path: 'state/clearSmoke', status: 500 });
        const consoleLogSpy = jest.spyOn(console, 'log');

        const result = await clearSmoke();

        expect(result).toBeUndefined();
        expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('getState', () => {
      test('should get the current state through the client', async () => {
        const result = await getState();

        expect(result).toEqual({ smokeId: 'smoke-id-1', smoking: false });
        expect(backend.requests).toContainEqual({
          method: 'get',
          path: 'state',
          body: undefined,
        });
      });

      test('should swallow-and-log on failure and resolve undefined', async () => {
        backend.injectFault({ method: 'get', path: 'state', status: 500 });
        const consoleLogSpy = jest.spyOn(console, 'log');

        const result = await getState();

        expect(result).toBeUndefined();
        expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('FinishSmoke', () => {
      test('should finish the current smoke through the client', async () => {
        const result = await FinishSmoke();

        expect(result).toEqual(mockSmoke);
        expect(backend.requests).toContainEqual({
          method: 'post',
          path: 'smoke/finish',
          body: undefined,
        });
      });

      test('should swallow-and-log on failure and resolve undefined', async () => {
        backend.injectFault({ method: 'post', path: 'smoke/finish', status: 500 });
        const consoleLogSpy = jest.spyOn(console, 'log');

        const result = await FinishSmoke();

        expect(result).toBeUndefined();
        expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('getSmokeHistory', () => {
      test('should get the history list through the client', async () => {
        const result = await getSmokeHistory();

        expect(result).toEqual(mockSmokeHistory);
        expect(backend.requests).toContainEqual({
          method: 'get',
          path: 'history',
          body: undefined,
        });
      });

      test('should swallow-and-log on failure and resolve undefined', async () => {
        backend.injectFault({ method: 'get', path: 'history', status: 500 });
        const consoleLogSpy = jest.spyOn(console, 'log');

        const result = await getSmokeHistory();

        expect(result).toBeUndefined();
        expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('getAllSmoke', () => {
      test('should get all smokes through the client', async () => {
        const result = await getAllSmoke();

        expect(result).toEqual([mockSmoke]);
        expect(backend.requests).toContainEqual({
          method: 'get',
          path: 'smoke/all',
          body: undefined,
        });
      });

      test('should swallow-and-log on failure and resolve undefined', async () => {
        backend.injectFault({ method: 'get', path: 'smoke/all', status: 500 });
        const consoleLogSpy = jest.spyOn(console, 'log');

        const result = await getAllSmoke();

        expect(result).toBeUndefined();
        expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('getSmokeById', () => {
      test('should get a smoke by id through the client', async () => {
        const result = await getSmokeById('smoke-id-1');

        expect(result).toEqual(mockSmoke);
        expect(backend.requests).toContainEqual({
          method: 'get',
          path: 'smoke/smoke-id-1',
          body: undefined,
        });
      });

      test('should swallow-and-log on failure and resolve undefined', async () => {
        const consoleLogSpy = jest.spyOn(console, 'log');

        const result = await getSmokeById('missing');

        expect(result).toBeUndefined();
        expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      });
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

  describe('deleteSmokeById (legacy axios)', () => {
    test('should delete smoke by id successfully', async () => {
      const testId = 'smoke-id-123';
      mockAxios.delete.mockResolvedValue({});

      const result = await deleteSmokeById(testId);

      expect(mockAxios.delete).toHaveBeenCalledWith('smoke/' + testId);
      expect(result).toEqual({});
    });

    test('should handle deleteSmokeById error and log it', async () => {
      const testId = 'smoke-id-123';
      const mockError = new Error('Delete smoke failed');
      mockAxios.delete.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await deleteSmokeById(testId);

      expect(mockAxios.delete).toHaveBeenCalledWith('smoke/' + testId);
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });
  });
});
