import {
  getCurrentPreSmoke,
  setCurrentPreSmoke,
  getPreSmokeById,
  deletePreSmokeById,
} from './preSmokeService';
import { preSmoke } from '../components/common/interfaces/preSmoke';
import { WeightUnits } from '../components/common/interfaces/enums';

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
  mockAxios.get.mockClear();
  mockAxios.post.mockClear();
  mockAxios.delete.mockClear();
  if (mockAxios.put) mockAxios.put.mockClear();
  mockAxios.defaults.baseURL = '';

  process.env = {
    ...originalEnv,
    REACT_APP_CLOUD_URL: 'http://localhost:3001/',
  };
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  process.env = originalEnv;
  jest.restoreAllMocks();
});

describe('preSmokeService', () => {
  const mockPreSmoke: preSmoke = {
    name: 'Test Brisket',
    meatType: 'Beef',
    weight: {
      weight: 12,
      unit: WeightUnits.LB,
    },
    steps: ['Season meat', 'Let rest'],
    notes: 'Test notes',
  };

  describe('getCurrentPreSmoke', () => {
    test('should fetch current pre smoke successfully', async () => {
      mockAxios.get.mockResolvedValue({
        data: mockPreSmoke,
      });

      const result = await getCurrentPreSmoke();

      expect(mockAxios.get).toHaveBeenCalledWith('presmoke/');
      expect(result).toEqual(mockPreSmoke);
    });

    test('should handle getCurrentPreSmoke error and log it', async () => {
      const mockError = new Error('Network error');

      mockAxios.get.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await getCurrentPreSmoke();

      expect(mockAxios.get).toHaveBeenCalledWith('presmoke/');
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });

    test('should set correct baseURL from environment variable', async () => {
      process.env.REACT_APP_CLOUD_URL = 'https://api.example.com/';

      mockAxios.get.mockResolvedValue({ data: mockPreSmoke });

      await getCurrentPreSmoke();
    });
  });

  describe('setCurrentPreSmoke', () => {
    test('should post current pre smoke successfully', async () => {
      mockAxios.post.mockResolvedValue({
        data: mockPreSmoke,
      });

      const result = await setCurrentPreSmoke(mockPreSmoke);

      expect(mockAxios.post).toHaveBeenCalledWith('presmoke', mockPreSmoke);
      expect(result).toEqual({ data: mockPreSmoke });
    });

    test('should handle setCurrentPreSmoke error and log it', async () => {
      const mockError = new Error('Server error');

      mockAxios.post.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await setCurrentPreSmoke(mockPreSmoke);

      expect(mockAxios.post).toHaveBeenCalledWith('presmoke', mockPreSmoke);
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });

    test('should handle pre smoke with minimal data', async () => {
      const minimalPreSmoke: preSmoke = {
        weight: {
          weight: 5,
          unit: WeightUnits.LB,
        },
        steps: [],
      };

      mockAxios.post.mockResolvedValue({ data: minimalPreSmoke });

      const result = await setCurrentPreSmoke(minimalPreSmoke);

      expect(mockAxios.post).toHaveBeenCalledWith('presmoke', minimalPreSmoke);
      expect(result).toEqual({ data: minimalPreSmoke });
    });

    test('should handle pre smoke with oz weight unit', async () => {
      const ozPreSmoke: preSmoke = {
        name: 'Small piece',
        weight: {
          weight: 16,
          unit: WeightUnits.OZ,
        },
        steps: ['Prepare'],
      };

      mockAxios.post.mockResolvedValue({ data: ozPreSmoke });

      const result = await setCurrentPreSmoke(ozPreSmoke);

      expect(mockAxios.post).toHaveBeenCalledWith('presmoke', ozPreSmoke);
      expect(result).toEqual({ data: ozPreSmoke });
    });

    test('should set correct baseURL from environment variable', async () => {
      process.env.REACT_APP_CLOUD_URL = 'https://api.example.com/';

      mockAxios.post.mockResolvedValue({ data: mockPreSmoke });

      await setCurrentPreSmoke(mockPreSmoke);
    });
  });

  describe('getPreSmokeById', () => {
    test('should fetch pre smoke by id successfully', async () => {
      const testId = 'test-id-123';

      mockAxios.get.mockResolvedValue({
        data: mockPreSmoke,
      });

      const result = await getPreSmokeById(testId);

      expect(mockAxios.get).toHaveBeenCalledWith('presmoke/' + testId);
      expect(result).toEqual(mockPreSmoke);
    });

    test('should handle getPreSmokeById error and log it', async () => {
      const testId = 'test-id-123';
      const mockError = new Error('Not found');

      mockAxios.get.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await getPreSmokeById(testId);

      expect(mockAxios.get).toHaveBeenCalledWith('presmoke/' + testId);
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });

    test('should handle special characters in id', async () => {
      const testId = 'test-id-with-special-chars-!@#';

      mockAxios.get.mockResolvedValue({ data: mockPreSmoke });

      await getPreSmokeById(testId);

      expect(mockAxios.get).toHaveBeenCalledWith('presmoke/' + testId);
    });

    test('should set correct baseURL from environment variable', async () => {
      process.env.REACT_APP_CLOUD_URL = 'https://api.example.com/';

      const testId = 'test-id';

      mockAxios.get.mockResolvedValue({ data: mockPreSmoke });

      await getPreSmokeById(testId);
    });
  });

  describe('deletePreSmokeById', () => {
    test('should delete pre smoke by id successfully', async () => {
      const testId = 'test-id-123';

      mockAxios.delete.mockResolvedValue({});

      const result = await deletePreSmokeById(testId);

      expect(mockAxios.delete).toHaveBeenCalledWith('presmoke/' + testId);
      expect(result).toEqual({});
    });

    test('should handle deletePreSmokeById error and log it', async () => {
      const testId = 'test-id-123';
      const mockError = new Error('Delete failed');

      mockAxios.delete.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await deletePreSmokeById(testId);

      expect(mockAxios.delete).toHaveBeenCalledWith('presmoke/' + testId);
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });

    test('should handle empty string id', async () => {
      const testId = '';

      mockAxios.delete.mockResolvedValue({});

      await deletePreSmokeById(testId);

      expect(mockAxios.delete).toHaveBeenCalledWith('presmoke/');
    });

    test('should set correct baseURL from environment variable', async () => {
      process.env.REACT_APP_CLOUD_URL = 'https://api.example.com/';

      const testId = 'test-id';

      mockAxios.delete.mockResolvedValue({});

      await deletePreSmokeById(testId);
    });
  });
});
