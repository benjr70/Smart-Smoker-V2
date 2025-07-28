import { getCurrentTemps, postTempsBatch } from './tempsService';
import { TempData } from 'temperaturechart/src/tempChart';

// Mock environment variable before importing
const mockEnvUrl = 'http://test-api.com';
process.env.REACT_APP_CLOUD_URL_API = mockEnvUrl;

// Mock axios
jest.mock('axios', () => ({
  create: jest.fn(),
  defaults: {
    baseURL: '',
  },
  get: jest.fn(),
  post: jest.fn(),
}));

const mockAxios = require('axios');

describe('tempsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAxios.defaults.baseURL = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getCurrentTemps', () => {
    it('should successfully get current temperature data', async () => {
      const mockTempData: TempData[] = [
        { 
          chamber: 225, 
          probe1: 185, 
          probe2: 190, 
          probe3: 0, 
          date: new Date('2023-01-01T12:00:00Z'),
          smokeId: 'smoke123'
        },
        { 
          chamber: 230, 
          probe1: 190, 
          probe2: 195, 
          probe3: 0, 
          date: new Date('2023-01-01T12:05:00Z'),
          smokeId: 'smoke123'
        }
      ];
      const mockResponse = { data: mockTempData };

      mockAxios.get.mockResolvedValue(mockResponse);

      const result = await getCurrentTemps();

      expect(mockAxios.get).toHaveBeenCalledWith('temps');
      expect(result).toEqual(mockTempData);
      expect(result).toHaveLength(2);
    });

    it('should handle empty temperature data', async () => {
      const mockResponse = { data: [] };

      mockAxios.get.mockResolvedValue(mockResponse);

      const result = await getCurrentTemps();

      expect(result).toEqual([]);
      expect(mockAxios.get).toHaveBeenCalledWith('temps');
    });

    it('should handle API error when getting temperatures', async () => {
      const apiError = new Error('Failed to fetch temperature data');

      mockAxios.get.mockRejectedValue(apiError);

      await expect(getCurrentTemps()).rejects.toThrow('Failed to fetch temperature data');
      expect(mockAxios.get).toHaveBeenCalledWith('temps');
    });

    it('should handle network timeout', async () => {
      const timeoutError = new Error('timeout of 5000ms exceeded');

      mockAxios.get.mockRejectedValue(timeoutError);

      await expect(getCurrentTemps()).rejects.toThrow('timeout of 5000ms exceeded');
    });

    it('should handle server error response', async () => {
      const serverError = {
        response: {
          status: 500,
          data: { error: 'Internal server error' }
        }
      };

      mockAxios.get.mockRejectedValue(serverError);

      await expect(getCurrentTemps()).rejects.toEqual(serverError);
    });

    it('should handle single temperature reading', async () => {
      const mockTempData: TempData[] = [
        { 
          chamber: 225, 
          probe1: 185, 
          probe2: 190, 
          probe3: 0, 
          date: new Date('2023-01-01T12:00:00Z'),
          smokeId: 'smoke123'
        }
      ];
      const mockResponse = { data: mockTempData };

      mockAxios.get.mockResolvedValue(mockResponse);

      const result = await getCurrentTemps();

      expect(result).toEqual(mockTempData);
      expect(result).toHaveLength(1);
    });
  });

  describe('postTempsBatch', () => {
    it('should successfully post temperature batch data', async () => {
      const mockBatch: TempData[] = [
        { 
          chamber: 225, 
          probe1: 185, 
          probe2: 190, 
          probe3: 0, 
          date: new Date('2023-01-01T12:00:00Z'),
          smokeId: 'smoke123'
        },
        { 
          chamber: 230, 
          probe1: 190, 
          probe2: 195, 
          probe3: 0, 
          date: new Date('2023-01-01T12:05:00Z'),
          smokeId: 'smoke123'
        }
      ];
      const mockResponse = { data: { success: true, count: 2 } };

      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await postTempsBatch(mockBatch);

      expect(mockAxios.post).toHaveBeenCalledWith('temps/batch', mockBatch);
      expect(result).toEqual({ success: true, count: 2 });
    });

    it('should handle empty batch array', async () => {
      const emptyBatch: TempData[] = [];
      const mockResponse = { data: { success: true, count: 0 } };

      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await postTempsBatch(emptyBatch);

      expect(mockAxios.post).toHaveBeenCalledWith('temps/batch', emptyBatch);
      expect(result).toEqual({ success: true, count: 0 });
    });

    it('should handle single item batch', async () => {
      const singleBatch: TempData[] = [
        { 
          chamber: 225, 
          probe1: 185, 
          probe2: 190, 
          probe3: 0, 
          date: new Date('2023-01-01T12:00:00Z'),
          smokeId: 'smoke123'
        }
      ];
      const mockResponse = { data: { success: true, count: 1 } };

      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await postTempsBatch(singleBatch);

      expect(mockAxios.post).toHaveBeenCalledWith('temps/batch', singleBatch);
      expect(result).toEqual({ success: true, count: 1 });
    });

    it('should handle API error when posting batch', async () => {
      const mockBatch: TempData[] = [
        { 
          chamber: 225, 
          probe1: 185, 
          probe2: 190, 
          probe3: 0, 
          date: new Date('2023-01-01T12:00:00Z'),
          smokeId: 'smoke123'
        }
      ];
      const apiError = new Error('Failed to save temperature batch');

      mockAxios.post.mockRejectedValue(apiError);

      await expect(postTempsBatch(mockBatch)).rejects.toThrow('Failed to save temperature batch');
      expect(mockAxios.post).toHaveBeenCalledWith('temps/batch', mockBatch);
    });

    it('should handle network timeout during batch post', async () => {
      const mockBatch: TempData[] = [
        { 
          chamber: 225, 
          probe1: 185, 
          probe2: 190, 
          probe3: 0, 
          date: new Date('2023-01-01T12:00:00Z'),
          smokeId: 'smoke123'
        }
      ];
      const timeoutError = new Error('timeout of 5000ms exceeded');

      mockAxios.post.mockRejectedValue(timeoutError);

      await expect(postTempsBatch(mockBatch)).rejects.toThrow('timeout of 5000ms exceeded');
    });

    it('should handle server error response during batch post', async () => {
      const mockBatch: TempData[] = [
        { 
          chamber: 225, 
          probe1: 185, 
          probe2: 190, 
          probe3: 0, 
          date: new Date('2023-01-01T12:00:00Z'),
          smokeId: 'smoke123'
        }
      ];
      const serverError = {
        response: {
          status: 500,
          data: { error: 'Database connection failed' }
        }
      };

      mockAxios.post.mockRejectedValue(serverError);

      await expect(postTempsBatch(mockBatch)).rejects.toEqual(serverError);
    });

    it('should handle large batch data', async () => {
      const largeBatch: TempData[] = Array.from({ length: 100 }, (_, i) => ({
        chamber: 225 + i, 
        probe1: 185 + i, 
        probe2: 190 + i, 
        probe3: 0, 
        date: new Date(`2023-01-01T${12 + Math.floor(i/60)}:${i%60}:00Z`),
        smokeId: 'smoke123'
      }));
      const mockResponse = { data: { success: true, count: 100 } };

      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await postTempsBatch(largeBatch);

      expect(mockAxios.post).toHaveBeenCalledWith('temps/batch', largeBatch);
      expect(result).toEqual({ success: true, count: 100 });
    });
  });
});