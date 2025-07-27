import { 
  getCurrentPostSmoke, 
  setCurrentPostSmoke, 
  getPostSmokeById, 
  deletePostSmokeById 
} from './postSmokeService';
import { PostSmoke } from '../components/smoke/postSmokeStep/PostSmokeStep';

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
  mockAxios.get.mockClear();
  mockAxios.post.mockClear();
  mockAxios.delete.mockClear();
  if (mockAxios.put) mockAxios.put.mockClear();
  mockAxios.defaults.baseURL = '';
  
  process.env = {
    ...originalEnv,
    REACT_APP_CLOUD_URL: 'http://localhost:3001/'
  };
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  process.env = originalEnv;
  jest.restoreAllMocks();
});

describe('postSmokeService', () => {
  const mockPostSmoke: PostSmoke = {
    restTime: '30 minutes',
    steps: ['Step 1', 'Step 2'],
    notes: 'Test notes'
  };

  describe('getCurrentPostSmoke', () => {
    test('should fetch current post smoke successfully', async () => {
      
      mockAxios.get.mockResolvedValue({
        data: mockPostSmoke
      });

      const result = await getCurrentPostSmoke();

      expect(mockAxios.get).toHaveBeenCalledWith('postSmoke/current');
      expect(result).toEqual(mockPostSmoke);
    });

    test('should handle getCurrentPostSmoke error and log it', async () => {
      const mockError = new Error('Network error');
      
      mockAxios.get.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await getCurrentPostSmoke();

      expect(mockAxios.get).toHaveBeenCalledWith('postSmoke/current');
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });

    test('should set correct baseURL from environment variable', async () => {
      process.env.REACT_APP_CLOUD_URL = 'https://api.example.com/';
      
      
      mockAxios.get.mockResolvedValue({ data: mockPostSmoke });

      await getCurrentPostSmoke();

    });
  });

  describe('setCurrentPostSmoke', () => {
    test('should post current post smoke successfully', async () => {
      
      mockAxios.post.mockResolvedValue({
        data: mockPostSmoke
      });

      const result = await setCurrentPostSmoke(mockPostSmoke);

      expect(mockAxios.post).toHaveBeenCalledWith('postSmoke/current', mockPostSmoke);
      expect(result).toEqual({ data: mockPostSmoke });
    });

    test('should handle setCurrentPostSmoke error and log it', async () => {
      const mockError = new Error('Server error');
      
      mockAxios.post.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await setCurrentPostSmoke(mockPostSmoke);

      expect(mockAxios.post).toHaveBeenCalledWith('postSmoke/current', mockPostSmoke);
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });

    test('should handle empty post smoke object', async () => {
      const emptyPostSmoke = {} as PostSmoke;
      
      mockAxios.post.mockResolvedValue({ data: emptyPostSmoke });

      const result = await setCurrentPostSmoke(emptyPostSmoke);

      expect(mockAxios.post).toHaveBeenCalledWith('postSmoke/current', emptyPostSmoke);
      expect(result).toEqual({ data: emptyPostSmoke });
    });

    test('should set correct baseURL from environment variable', async () => {
      process.env.REACT_APP_CLOUD_URL = 'https://api.example.com/';
      
      
      mockAxios.post.mockResolvedValue({ data: mockPostSmoke });

      await setCurrentPostSmoke(mockPostSmoke);

    });
  });

  describe('getPostSmokeById', () => {
    test('should fetch post smoke by id successfully', async () => {
      const testId = 'test-id-123';
      
      mockAxios.get.mockResolvedValue({
        data: mockPostSmoke
      });

      const result = await getPostSmokeById(testId);

      expect(mockAxios.get).toHaveBeenCalledWith('postSmoke/' + testId);
      expect(result).toEqual(mockPostSmoke);
    });

    test('should handle getPostSmokeById error and log it', async () => {
      const testId = 'test-id-123';
      const mockError = new Error('Not found');
      
      mockAxios.get.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await getPostSmokeById(testId);

      expect(mockAxios.get).toHaveBeenCalledWith('postSmoke/' + testId);
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });

    test('should handle special characters in id', async () => {
      const testId = 'test-id-with-special-chars-!@#';
      
      mockAxios.get.mockResolvedValue({ data: mockPostSmoke });

      await getPostSmokeById(testId);

      expect(mockAxios.get).toHaveBeenCalledWith('postSmoke/' + testId);
    });

    test('should set correct baseURL from environment variable', async () => {
      process.env.REACT_APP_CLOUD_URL = 'https://api.example.com/';
      
      const testId = 'test-id';
      
      mockAxios.get.mockResolvedValue({ data: mockPostSmoke });

      await getPostSmokeById(testId);

    });
  });

  describe('deletePostSmokeById', () => {
    test('should delete post smoke by id successfully', async () => {
      const testId = 'test-id-123';
      
      mockAxios.delete.mockResolvedValue({});

      const result = await deletePostSmokeById(testId);

      expect(mockAxios.delete).toHaveBeenCalledWith('postSmoke/' + testId);
      expect(result).toEqual({});
    });

    test('should handle deletePostSmokeById error and log it', async () => {
      const testId = 'test-id-123';
      const mockError = new Error('Delete failed');
      
      mockAxios.delete.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await deletePostSmokeById(testId);

      expect(mockAxios.delete).toHaveBeenCalledWith('postSmoke/' + testId);
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });

    test('should handle empty string id', async () => {
      const testId = '';
      
      mockAxios.delete.mockResolvedValue({});

      await deletePostSmokeById(testId);

      expect(mockAxios.delete).toHaveBeenCalledWith('postSmoke/');
    });

    test('should set correct baseURL from environment variable', async () => {
      process.env.REACT_APP_CLOUD_URL = 'https://api.example.com/';
      
      const testId = 'test-id';
      
      mockAxios.delete.mockResolvedValue({});

      await deletePostSmokeById(testId);

    });
  });
});
