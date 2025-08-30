import { deleteSmoke } from './deleteSmokeService';
import { deletePostSmokeById } from './postSmokeService';
import { deletePreSmokeById } from './preSmokeService';
import { deleteRatingsById } from './ratingsService';
import { deleteSmokeById, deleteSmokeProfileById, getSmokeById } from './smokerService';
import { deleteTempsById } from './tempsService';

// Mock all the imported services
jest.mock('./postSmokeService');
jest.mock('./preSmokeService');
jest.mock('./ratingsService');
jest.mock('./smokerService');
jest.mock('./tempsService');

const mockDeletePostSmokeById = deletePostSmokeById as jest.MockedFunction<
  typeof deletePostSmokeById
>;
const mockDeletePreSmokeById = deletePreSmokeById as jest.MockedFunction<typeof deletePreSmokeById>;
const mockDeleteRatingsById = deleteRatingsById as jest.MockedFunction<typeof deleteRatingsById>;
const mockDeleteSmokeById = deleteSmokeById as jest.MockedFunction<typeof deleteSmokeById>;
const mockDeleteSmokeProfileById = deleteSmokeProfileById as jest.MockedFunction<
  typeof deleteSmokeProfileById
>;
const mockGetSmokeById = getSmokeById as jest.MockedFunction<typeof getSmokeById>;
const mockDeleteTempsById = deleteTempsById as jest.MockedFunction<typeof deleteTempsById>;

describe('deleteSmokeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('deleteSmoke should delete all related data when smoke is found', async () => {
    const mockSmokeId = 'test-smoke-id';
    const mockSmoke = {
      preSmokeId: 'pre-smoke-id',
      smokeProfileId: 'smoke-profile-id',
      tempsId: 'temps-id',
      postSmokeId: 'post-smoke-id',
      ratingId: 'rating-id',
    };

    mockGetSmokeById.mockResolvedValue(mockSmoke);
    mockDeletePreSmokeById.mockResolvedValue(undefined);
    mockDeleteSmokeProfileById.mockResolvedValue(undefined);
    mockDeleteTempsById.mockResolvedValue(undefined);
    mockDeletePostSmokeById.mockResolvedValue(undefined);
    mockDeleteRatingsById.mockResolvedValue(undefined);
    mockDeleteSmokeById.mockResolvedValue(undefined);

    await deleteSmoke(mockSmokeId);

    expect(mockGetSmokeById).toHaveBeenCalledWith(mockSmokeId);
    expect(mockDeletePreSmokeById).toHaveBeenCalledWith(mockSmoke.preSmokeId);
    expect(mockDeleteSmokeProfileById).toHaveBeenCalledWith(mockSmoke.smokeProfileId);
    expect(mockDeleteTempsById).toHaveBeenCalledWith(mockSmoke.tempsId);
    expect(mockDeletePostSmokeById).toHaveBeenCalledWith(mockSmoke.postSmokeId);
    expect(mockDeleteRatingsById).toHaveBeenCalledWith(mockSmoke.ratingId);
    expect(mockDeleteSmokeById).toHaveBeenCalledWith(mockSmokeId);
  });

  test('deleteSmoke should still delete smoke by id in finally block when getSmokeById succeeds', async () => {
    const mockSmokeId = 'test-smoke-id';
    const mockSmoke = {
      preSmokeId: 'pre-smoke-id',
      smokeProfileId: 'smoke-profile-id',
      tempsId: 'temps-id',
      postSmokeId: 'post-smoke-id',
      ratingId: 'rating-id',
    };

    mockGetSmokeById.mockResolvedValue(mockSmoke);
    mockDeletePreSmokeById.mockResolvedValue(undefined);
    mockDeleteSmokeProfileById.mockResolvedValue(undefined);
    mockDeleteTempsById.mockResolvedValue(undefined);
    mockDeletePostSmokeById.mockResolvedValue(undefined);
    mockDeleteRatingsById.mockResolvedValue(undefined);
    mockDeleteSmokeById.mockResolvedValue(undefined);

    await deleteSmoke(mockSmokeId);

    expect(mockDeleteSmokeById).toHaveBeenCalledWith(mockSmokeId);
  });

  test('deleteSmoke should handle errors during deletion and still call deleteSmokeById in finally', async () => {
    const mockSmokeId = 'test-smoke-id';
    const mockSmoke = {
      preSmokeId: 'pre-smoke-id',
      smokeProfileId: 'smoke-profile-id',
      tempsId: 'temps-id',
      postSmokeId: 'post-smoke-id',
      ratingId: 'rating-id',
    };

    mockGetSmokeById.mockResolvedValue(mockSmoke);
    mockDeletePreSmokeById.mockRejectedValue(new Error('Delete failed'));
    mockDeleteSmokeById.mockResolvedValue(undefined);

    const consoleLogSpy = jest.spyOn(console, 'log');

    await deleteSmoke(mockSmokeId);

    expect(mockGetSmokeById).toHaveBeenCalledWith(mockSmokeId);
    expect(mockDeletePreSmokeById).toHaveBeenCalledWith(mockSmoke.preSmokeId);
    expect(mockDeleteSmokeById).toHaveBeenCalledWith(mockSmokeId);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.any(Error));
  });

  test('deleteSmoke should handle getSmokeById rejection and still call deleteSmokeById in finally', async () => {
    const mockSmokeId = 'test-smoke-id';
    const mockError = new Error('Smoke not found');

    mockGetSmokeById.mockRejectedValue(mockError);
    mockDeleteSmokeById.mockResolvedValue(undefined);

    const consoleLogSpy = jest.spyOn(console, 'log');

    await deleteSmoke(mockSmokeId);

    expect(mockGetSmokeById).toHaveBeenCalledWith(mockSmokeId);
    expect(mockDeleteSmokeById).toHaveBeenCalledWith(mockSmokeId);
    expect(consoleLogSpy).toHaveBeenCalledWith(mockError);
  });

  test('deleteSmoke should handle deletion failure and still call deleteSmokeById in finally', async () => {
    const mockSmokeId = 'test-smoke-id';
    const mockSmoke = {
      preSmokeId: 'pre-smoke-id',
      smokeProfileId: 'smoke-profile-id',
      tempsId: 'temps-id',
      postSmokeId: 'post-smoke-id',
      ratingId: 'rating-id',
    };

    mockGetSmokeById.mockResolvedValue(mockSmoke);
    mockDeletePreSmokeById.mockResolvedValue(undefined);
    mockDeleteSmokeProfileById.mockRejectedValue(new Error('Profile delete failed'));
    mockDeleteTempsById.mockResolvedValue(undefined);
    mockDeletePostSmokeById.mockResolvedValue(undefined);
    mockDeleteRatingsById.mockResolvedValue(undefined);
    mockDeleteSmokeById.mockResolvedValue(undefined);

    const consoleLogSpy = jest.spyOn(console, 'log');

    await deleteSmoke(mockSmokeId);

    expect(mockDeletePreSmokeById).toHaveBeenCalledWith(mockSmoke.preSmokeId);
    expect(mockDeleteSmokeProfileById).toHaveBeenCalledWith(mockSmoke.smokeProfileId);
    // After deleteProfile fails, subsequent deletes are not called due to sequential await pattern
    expect(mockDeleteTempsById).not.toHaveBeenCalled();
    expect(mockDeletePostSmokeById).not.toHaveBeenCalled();
    expect(mockDeleteRatingsById).not.toHaveBeenCalled();
    // deleteSmokeById should still be called in finally block
    expect(mockDeleteSmokeById).toHaveBeenCalledWith(mockSmokeId);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.any(Error));
  });

  test('deleteSmoke should handle deleteSmokeById failure in finally block', async () => {
    const mockSmokeId = 'test-smoke-id';
    const mockSmoke = {
      preSmokeId: 'pre-smoke-id',
      smokeProfileId: 'smoke-profile-id',
      tempsId: 'temps-id',
      postSmokeId: 'post-smoke-id',
      ratingId: 'rating-id',
    };

    mockGetSmokeById.mockResolvedValue(mockSmoke);
    mockDeletePreSmokeById.mockResolvedValue(undefined);
    mockDeleteSmokeProfileById.mockResolvedValue(undefined);
    mockDeleteTempsById.mockResolvedValue(undefined);
    mockDeletePostSmokeById.mockResolvedValue(undefined);
    mockDeleteRatingsById.mockResolvedValue(undefined);
    mockDeleteSmokeById.mockRejectedValue(new Error('Final delete failed'));

    await deleteSmoke(mockSmokeId);

    expect(mockDeleteSmokeById).toHaveBeenCalledWith(mockSmokeId);
    // Note: errors in finally block don't get caught by the outer catch
  });
});
