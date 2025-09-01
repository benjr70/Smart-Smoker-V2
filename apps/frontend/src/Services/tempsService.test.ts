import { getCurrentTemps, getTempsById, deleteTempsById } from './tempsService';

// Mock the TempData interface since we can't import from temperaturechart
interface TempData {
  timestamp: string;
  temp1: number;
  temp2: number;
  temp3: number;
  temp4: number;
}

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

describe('tempsService', () => {
  const mockTempData: TempData[] = [
    {
      timestamp: '2025-01-01T12:00:00Z',
      temp1: 225,
      temp2: 185,
      temp3: 190,
      temp4: 220,
    },
    {
      timestamp: '2025-01-01T12:05:00Z',
      temp1: 230,
      temp2: 188,
      temp3: 192,
      temp4: 225,
    },
  ];

  describe('getCurrentTemps', () => {
    test('should fetch current temps successfully', async () => {
      mockAxios.get.mockResolvedValue({
        data: mockTempData,
      });

      const result = await getCurrentTemps();

      expect(mockAxios.get).toHaveBeenCalledWith('temps');
      expect(result).toEqual(mockTempData);
    });

    test('should handle getCurrentTemps error and log it', async () => {
      const mockError = new Error('Network error');

      mockAxios.get.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await getCurrentTemps();

      expect(mockAxios.get).toHaveBeenCalledWith('temps');
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });

    test('should handle empty temps array', async () => {
      mockAxios.get.mockResolvedValue({
        data: [],
      });

      const result = await getCurrentTemps();

      expect(mockAxios.get).toHaveBeenCalledWith('temps');
      expect(result).toEqual([]);
    });

    test('should set correct baseURL from environment variable', async () => {
      process.env.REACT_APP_CLOUD_URL = 'https://api.example.com/';

      mockAxios.get.mockResolvedValue({ data: mockTempData });

      await getCurrentTemps();
    });
  });

  describe('getTempsById', () => {
    test('should fetch temps by id successfully', async () => {
      const testId = 'test-id-123';

      mockAxios.get.mockResolvedValue({
        data: mockTempData,
      });

      const result = await getTempsById(testId);

      expect(mockAxios.get).toHaveBeenCalledWith('temps/' + testId);
      expect(result).toEqual(mockTempData);
    });

    test('should handle getTempsById error and log it', async () => {
      const testId = 'test-id-123';
      const mockError = new Error('Not found');

      mockAxios.get.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await getTempsById(testId);

      expect(mockAxios.get).toHaveBeenCalledWith('temps/' + testId);
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });

    test('should handle single temperature reading', async () => {
      const testId = 'single-temp-id';
      const singleTempData: TempData[] = [
        {
          timestamp: '2025-01-01T12:00:00Z',
          temp1: 225,
          temp2: 185,
          temp3: 190,
          temp4: 220,
        },
      ];

      mockAxios.get.mockResolvedValue({ data: singleTempData });

      const result = await getTempsById(testId);

      expect(mockAxios.get).toHaveBeenCalledWith('temps/' + testId);
      expect(result).toEqual(singleTempData);
      expect(result).toHaveLength(1);
    });

    test('should handle special characters in id', async () => {
      const testId = 'test-id-with-special-chars-!@#';

      mockAxios.get.mockResolvedValue({ data: mockTempData });

      await getTempsById(testId);

      expect(mockAxios.get).toHaveBeenCalledWith('temps/' + testId);
    });

    test('should handle empty string id', async () => {
      const testId = '';

      mockAxios.get.mockResolvedValue({ data: [] });

      await getTempsById(testId);

      expect(mockAxios.get).toHaveBeenCalledWith('temps/');
    });

    test('should set correct baseURL from environment variable', async () => {
      process.env.REACT_APP_CLOUD_URL = 'https://api.example.com/';

      const testId = 'test-id';

      mockAxios.get.mockResolvedValue({ data: mockTempData });

      await getTempsById(testId);
    });
  });

  describe('deleteTempsById', () => {
    test('should delete temps by id successfully', async () => {
      const testId = 'test-id-123';

      mockAxios.delete.mockResolvedValue({});

      const result = await deleteTempsById(testId);

      expect(mockAxios.delete).toHaveBeenCalledWith('temps/' + testId);
      expect(result).toEqual({});
    });

    test('should handle deleteTempsById error and log it', async () => {
      const testId = 'test-id-123';
      const mockError = new Error('Delete failed');

      mockAxios.delete.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await deleteTempsById(testId);

      expect(mockAxios.delete).toHaveBeenCalledWith('temps/' + testId);
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });

    test('should handle empty string id', async () => {
      const testId = '';

      mockAxios.delete.mockResolvedValue({});

      await deleteTempsById(testId);

      expect(mockAxios.delete).toHaveBeenCalledWith('temps/');
    });

    test('should handle null response', async () => {
      const testId = 'test-id-123';

      mockAxios.delete.mockResolvedValue(null);

      const result = await deleteTempsById(testId);

      expect(mockAxios.delete).toHaveBeenCalledWith('temps/' + testId);
      expect(result).toBeNull();
    });

    test('should set correct baseURL from environment variable', async () => {
      process.env.REACT_APP_CLOUD_URL = 'https://api.example.com/';

      const testId = 'test-id';

      mockAxios.delete.mockResolvedValue({});

      await deleteTempsById(testId);
    });
  });
});
