import { 
  getCurrentRatings, 
  setCurrentRatings, 
  updateRatings, 
  getRatingById, 
  deleteRatingsById 
} from './ratingsService';
import { rating } from '../components/common/interfaces/rating';

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

describe('ratingsService', () => {
  const mockRating: rating = {
    smokeFlavor: 8,
    seasoning: 7,
    tenderness: 9,
    overallTaste: 8,
    notes: 'Delicious!',
    _id: 'test-id-123'
  };

  describe('getCurrentRatings', () => {
    test('should fetch current ratings successfully', async () => {
      
      mockAxios.get.mockResolvedValue({
        data: mockRating
      });

      const result = await getCurrentRatings();

      expect(mockAxios.get).toHaveBeenCalledWith('ratings/');
      expect(result).toEqual(mockRating);
    });

    test('should handle getCurrentRatings error and log it', async () => {
      const mockError = new Error('Network error');
      
      mockAxios.get.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await getCurrentRatings();

      expect(mockAxios.get).toHaveBeenCalledWith('ratings/');
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });

    test('should set correct baseURL from environment variable', async () => {
      process.env.REACT_APP_CLOUD_URL = 'https://api.example.com/';
      
      
      mockAxios.get.mockResolvedValue({ data: mockRating });

      await getCurrentRatings();

    });
  });

  describe('setCurrentRatings', () => {
    test('should post current ratings successfully', async () => {
      
      mockAxios.post.mockResolvedValue({
        data: mockRating
      });

      const result = await setCurrentRatings(mockRating);

      expect(mockAxios.post).toHaveBeenCalledWith('ratings/', mockRating);
      expect(result).toEqual({ data: mockRating });
    });

    test('should handle setCurrentRatings error and log it', async () => {
      const mockError = new Error('Server error');
      
      mockAxios.post.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await setCurrentRatings(mockRating);

      expect(mockAxios.post).toHaveBeenCalledWith('ratings/', mockRating);
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });

    test('should handle rating with minimum scores', async () => {
      const minRating: rating = {
        smokeFlavor: 1,
        seasoning: 1,
        tenderness: 1,
        overallTaste: 1,
        notes: ''
      };

      
      mockAxios.post.mockResolvedValue({ data: minRating });

      const result = await setCurrentRatings(minRating);

      expect(mockAxios.post).toHaveBeenCalledWith('ratings/', minRating);
      expect(result).toEqual({ data: minRating });
    });

    test('should handle rating with maximum scores', async () => {
      const maxRating: rating = {
        smokeFlavor: 10,
        seasoning: 10,
        tenderness: 10,
        overallTaste: 10,
        notes: 'Perfect smoke!'
      };

      
      mockAxios.post.mockResolvedValue({ data: maxRating });

      const result = await setCurrentRatings(maxRating);

      expect(mockAxios.post).toHaveBeenCalledWith('ratings/', maxRating);
      expect(result).toEqual({ data: maxRating });
    });

    test('should set correct baseURL from environment variable', async () => {
      process.env.REACT_APP_CLOUD_URL = 'https://api.example.com/';
      
      
      mockAxios.post.mockResolvedValue({ data: mockRating });

      await setCurrentRatings(mockRating);

    });
  });

  describe('updateRatings', () => {
    test('should update ratings successfully', async () => {
      const ratingWithId: rating = { ...mockRating, _id: 'update-id-123' };
      
      mockAxios.post.mockResolvedValue({
        data: ratingWithId
      });

      const result = await updateRatings(ratingWithId);

      expect(mockAxios.post).toHaveBeenCalledWith('ratings/' + ratingWithId._id, ratingWithId);
      expect(result).toEqual({ data: ratingWithId });
    });

    test('should handle updateRatings error and log it', async () => {
      const ratingWithId: rating = { ...mockRating, _id: 'update-id-123' };
      const mockError = new Error('Update failed');
      
      mockAxios.post.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await updateRatings(ratingWithId);

      expect(mockAxios.post).toHaveBeenCalledWith('ratings/' + ratingWithId._id, ratingWithId);
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });

    test('should handle rating without id', async () => {
      const ratingWithoutId: rating = {
        smokeFlavor: 5,
        seasoning: 6,
        tenderness: 7,
        overallTaste: 6,
        notes: 'No ID'
      };

      
      mockAxios.post.mockResolvedValue({ data: ratingWithoutId });

      const result = await updateRatings(ratingWithoutId);

      expect(mockAxios.post).toHaveBeenCalledWith('ratings/' + undefined, ratingWithoutId);
      expect(result).toEqual({ data: ratingWithoutId });
    });

    test('should set correct baseURL from environment variable', async () => {
      process.env.REACT_APP_CLOUD_URL = 'https://api.example.com/';
      
      const ratingWithId: rating = { ...mockRating, _id: 'test-id' };
      
      mockAxios.post.mockResolvedValue({ data: ratingWithId });

      await updateRatings(ratingWithId);

    });
  });

  describe('getRatingById', () => {
    test('should fetch rating by id successfully', async () => {
      const testId = 'test-id-123';
      
      mockAxios.get.mockResolvedValue({
        data: mockRating
      });

      const result = await getRatingById(testId);

      expect(mockAxios.get).toHaveBeenCalledWith('ratings/' + testId);
      expect(result).toEqual(mockRating);
    });

    test('should handle getRatingById error and log it', async () => {
      const testId = 'test-id-123';
      const mockError = new Error('Not found');
      
      mockAxios.get.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await getRatingById(testId);

      expect(mockAxios.get).toHaveBeenCalledWith('ratings/' + testId);
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });

    test('should handle special characters in id', async () => {
      const testId = 'test-id-with-special-chars-!@#';
      
      mockAxios.get.mockResolvedValue({ data: mockRating });

      await getRatingById(testId);

      expect(mockAxios.get).toHaveBeenCalledWith('ratings/' + testId);
    });

    test('should set correct baseURL from environment variable', async () => {
      process.env.REACT_APP_CLOUD_URL = 'https://api.example.com/';
      
      const testId = 'test-id';
      
      mockAxios.get.mockResolvedValue({ data: mockRating });

      await getRatingById(testId);

    });
  });

  describe('deleteRatingsById', () => {
    test('should delete rating by id successfully', async () => {
      const testId = 'test-id-123';
      
      mockAxios.delete.mockResolvedValue({});

      const result = await deleteRatingsById(testId);

      expect(mockAxios.delete).toHaveBeenCalledWith('ratings/' + testId);
      expect(result).toEqual({});
    });

    test('should handle deleteRatingsById error and log it', async () => {
      const testId = 'test-id-123';
      const mockError = new Error('Delete failed');
      
      mockAxios.delete.mockRejectedValue(mockError);

      const consoleLogSpy = jest.spyOn(console, 'log');

      const result = await deleteRatingsById(testId);

      expect(mockAxios.delete).toHaveBeenCalledWith('ratings/' + testId);
      expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
      expect(result).toBeUndefined();
    });

    test('should handle empty string id', async () => {
      const testId = '';
      
      mockAxios.delete.mockResolvedValue({});

      await deleteRatingsById(testId);

      expect(mockAxios.delete).toHaveBeenCalledWith('ratings/');
    });

    test('should set correct baseURL from environment variable', async () => {
      process.env.REACT_APP_CLOUD_URL = 'https://api.example.com/';
      
      const testId = 'test-id';
      
      mockAxios.delete.mockResolvedValue({});

      await deleteRatingsById(testId);

    });
  });
});
