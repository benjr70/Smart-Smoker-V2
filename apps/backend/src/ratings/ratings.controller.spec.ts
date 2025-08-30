import { Test, TestingModule } from '@nestjs/testing';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';
import { RatingsDto } from './ratingsDto';
import { Ratings } from './ratings.schema';

describe('RatingsController', () => {
  let controller: RatingsController;
  let service: RatingsService;

  const mockRatingsDto: RatingsDto = {
    smokeFlavor: 4,
    seasoning: 5,
    tenderness: 3,
    overallTaste: 4,
    notes: 'Great flavor, could be more tender',
  };

  const mockRatings = {
    _id: 'rating-id-123',
    ...mockRatingsDto,
  };

  const mockRatingsService = {
    getCurrentRating: jest.fn(),
    saveCurrentRatings: jest.fn(),
    update: jest.fn(),
    getById: jest.fn(),
    Delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RatingsController],
      providers: [
        {
          provide: RatingsService,
          useValue: mockRatingsService,
        },
      ],
    }).compile();

    controller = module.get<RatingsController>(RatingsController);
    service = module.get<RatingsService>(RatingsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getCurrentRatings', () => {
    it('should return current ratings', async () => {
      mockRatingsService.getCurrentRating.mockResolvedValue(mockRatings);

      const result = await controller.getCurrentRatings();

      expect(service.getCurrentRating).toHaveBeenCalled();
      expect(result).toEqual(mockRatings);
    });

    it('should handle service errors', async () => {
      const error = new Error('No current smoke found');
      mockRatingsService.getCurrentRating.mockRejectedValue(error);

      await expect(controller.getCurrentRatings()).rejects.toThrow(
        'No current smoke found',
      );
    });
  });

  describe('saveCurrentRatings', () => {
    it('should save current ratings', async () => {
      mockRatingsService.saveCurrentRatings.mockResolvedValue(mockRatings);

      const result = await controller.saveCurrentRatings(mockRatingsDto);

      expect(service.saveCurrentRatings).toHaveBeenCalledWith(mockRatingsDto);
      expect(result).toEqual(mockRatings);
    });

    it('should handle validation errors', async () => {
      const error = new Error('Invalid rating values');
      mockRatingsService.saveCurrentRatings.mockRejectedValue(error);

      await expect(
        controller.saveCurrentRatings(mockRatingsDto),
      ).rejects.toThrow('Invalid rating values');
    });
  });

  describe('updateRatings', () => {
    it('should update ratings by id', async () => {
      const id = 'rating-id-123';
      mockRatingsService.update.mockResolvedValue(mockRatings);

      const result = await controller.updateRatings(id, mockRatingsDto);

      expect(service.update).toHaveBeenCalledWith(id, mockRatingsDto);
      expect(result).toEqual(mockRatings);
    });

    it('should handle non-existent rating updates', async () => {
      const id = 'non-existent-id';
      const error = new Error('Rating not found');
      mockRatingsService.update.mockRejectedValue(error);

      await expect(
        controller.updateRatings(id, mockRatingsDto),
      ).rejects.toThrow('Rating not found');
    });
  });

  describe('getRatingById', () => {
    it('should return rating by id', async () => {
      const id = 'rating-id-123';
      mockRatingsService.getById.mockResolvedValue(mockRatings);

      const result = await controller.getRatingById(id);

      expect(service.getById).toHaveBeenCalledWith(id);
      expect(result).toEqual(mockRatings);
    });

    it('should return null for non-existent rating', async () => {
      const id = 'non-existent-id';
      mockRatingsService.getById.mockResolvedValue(null);

      const result = await controller.getRatingById(id);

      expect(service.getById).toHaveBeenCalledWith(id);
      expect(result).toBeNull();
    });

    it('should handle service errors', async () => {
      const id = 'invalid-id';
      const error = new Error('Invalid ObjectId');
      mockRatingsService.getById.mockRejectedValue(error);

      await expect(controller.getRatingById(id)).rejects.toThrow(
        'Invalid ObjectId',
      );
    });
  });

  describe('DeleteById', () => {
    it('should delete rating by id', async () => {
      const id = 'rating-id-123';
      const deleteResult = { deletedCount: 1 };
      mockRatingsService.Delete.mockResolvedValue(deleteResult);

      const result = await controller.DeleteById(id);

      expect(service.Delete).toHaveBeenCalledWith(id);
      expect(result).toEqual(deleteResult);
    });

    it('should handle deletion of non-existent rating', async () => {
      const id = 'non-existent-id';
      const deleteResult = { deletedCount: 0 };
      mockRatingsService.Delete.mockResolvedValue(deleteResult);

      const result = await controller.DeleteById(id);

      expect(service.Delete).toHaveBeenCalledWith(id);
      expect(result).toEqual(deleteResult);
    });

    it('should handle deletion errors', async () => {
      const id = 'invalid-id';
      const error = new Error('Database error');
      mockRatingsService.Delete.mockRejectedValue(error);

      await expect(controller.DeleteById(id)).rejects.toThrow('Database error');
    });
  });
});
