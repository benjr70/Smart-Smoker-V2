import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { RatingsService } from './ratings.service';
import { Ratings } from './ratings.schema';
import { RatingsDto } from './ratingsDto';
import { SmokeService } from '../smoke/smoke.service';
import { SmokeDto } from '../smoke/smokeDto';

describe('RatingsService', () => {
  let service: RatingsService;
  let mockRatingsModel: any;
  let mockSmokeService: any;

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

  const mockSmoke = {
    _id: 'smoke-id-123',
    smokeProfileId: 'profile-id',
    preSmokeId: 'pre-smoke-id',
    postSmokeId: 'post-smoke-id',
    tempsId: 'temps-id',
    ratingId: 'rating-id-123',
    status: 1,
  };

  const mockSmokeWithoutRating = {
    _id: 'smoke-id-456',
    smokeProfileId: 'profile-id',
    preSmokeId: 'pre-smoke-id',
    postSmokeId: 'post-smoke-id',
    tempsId: 'temps-id',
    ratingId: null,
    status: 1,
  };

  beforeEach(async () => {
    // Mock Ratings model
    mockRatingsModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ ...dto, _id: 'new-rating-id' }),
    }));

    mockRatingsModel.findById = jest.fn().mockResolvedValue(mockRatings);
    mockRatingsModel.deleteOne = jest
      .fn()
      .mockResolvedValue({ deletedCount: 1 });
    mockRatingsModel.findByIdAndUpdate = jest
      .fn()
      .mockResolvedValue(mockRatings);

    // Mock SmokeService
    mockSmokeService = {
      getCurrentSmoke: jest.fn(),
      Update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatingsService,
        {
          provide: getModelToken('Ratings'),
          useValue: mockRatingsModel,
        },
        {
          provide: SmokeService,
          useValue: mockSmokeService,
        },
      ],
    }).compile();

    service = module.get<RatingsService>(RatingsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCurrentRating', () => {
    it('should return current rating when smoke has ratingId', async () => {
      mockSmokeService.getCurrentSmoke.mockResolvedValue(mockSmoke);

      const result = await service.getCurrentRating();

      expect(mockSmokeService.getCurrentSmoke).toHaveBeenCalled();
      expect(mockRatingsModel.findById).toHaveBeenCalledWith(
        mockSmoke.ratingId,
      );
      expect(result).toEqual(mockRatings);
    });

    it('should handle smoke service errors', async () => {
      const error = new Error('Smoke not found');
      mockSmokeService.getCurrentSmoke.mockRejectedValue(error);

      await expect(service.getCurrentRating()).rejects.toThrow(
        'Smoke not found',
      );
    });
  });

  describe('saveCurrentRatings', () => {
    it('should update existing rating when smoke has ratingId', async () => {
      mockSmokeService.getCurrentSmoke.mockResolvedValue(mockSmoke);
      jest.spyOn(service, 'update').mockResolvedValue(mockRatings);

      const result = await service.saveCurrentRatings(mockRatingsDto);

      expect(mockSmokeService.getCurrentSmoke).toHaveBeenCalled();
      expect(service.update).toHaveBeenCalledWith(
        mockSmoke.ratingId,
        mockRatingsDto,
      );
      expect(result).toBeUndefined(); // The service doesn't return anything for updates
    });

    it('should create new rating when smoke has no ratingId', async () => {
      mockSmokeService.getCurrentSmoke.mockResolvedValue(
        mockSmokeWithoutRating,
      );
      jest.spyOn(service, 'create').mockResolvedValue(mockRatings);

      const expectedSmokeDto: SmokeDto = {
        smokeProfileId: mockSmokeWithoutRating.smokeProfileId,
        preSmokeId: mockSmokeWithoutRating.preSmokeId,
        postSmokeId: mockSmokeWithoutRating.postSmokeId,
        tempsId: mockSmokeWithoutRating.tempsId,
        ratingId: mockRatings._id,
        status: mockSmokeWithoutRating.status,
      };

      const result = await service.saveCurrentRatings(mockRatingsDto);

      expect(mockSmokeService.getCurrentSmoke).toHaveBeenCalled();
      expect(service.create).toHaveBeenCalledWith(mockRatingsDto);
      expect(mockSmokeService.Update).toHaveBeenCalledWith(
        mockSmokeWithoutRating._id,
        expectedSmokeDto,
      );
      expect(result).toEqual(mockRatings);
    });

    it('should handle smoke service errors during save', async () => {
      const error = new Error('Database error');
      mockSmokeService.getCurrentSmoke.mockRejectedValue(error);

      await expect(service.saveCurrentRatings(mockRatingsDto)).rejects.toThrow(
        'Database error',
      );
    });
  });

  describe('getById', () => {
    it('should return rating by id', async () => {
      const result = await service.getById('rating-id-123');

      expect(mockRatingsModel.findById).toHaveBeenCalledWith('rating-id-123');
      expect(result).toEqual(mockRatings);
    });

    it('should return null for non-existent rating', async () => {
      mockRatingsModel.findById.mockResolvedValue(null);

      const result = await service.getById('non-existent-id');

      expect(mockRatingsModel.findById).toHaveBeenCalledWith('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('Delete', () => {
    it('should delete rating by id', async () => {
      const result = await service.Delete('rating-id-123');

      expect(mockRatingsModel.deleteOne).toHaveBeenCalledWith({
        _id: 'rating-id-123',
      });
      expect(result).toEqual({ deletedCount: 1 });
    });

    it('should handle deletion of non-existent rating', async () => {
      mockRatingsModel.deleteOne.mockResolvedValue({ deletedCount: 0 });

      const result = await service.Delete('non-existent-id');

      expect(mockRatingsModel.deleteOne).toHaveBeenCalledWith({
        _id: 'non-existent-id',
      });
      expect(result).toEqual({ deletedCount: 0 });
    });
  });

  describe('update', () => {
    it('should update rating and return updated data', async () => {
      jest.spyOn(service, 'getById').mockResolvedValue(mockRatings);

      const result = await service.update('rating-id-123', mockRatingsDto);

      expect(mockRatingsModel.findByIdAndUpdate).toHaveBeenCalledWith(
        { _id: 'rating-id-123' },
        mockRatingsDto,
      );
      expect(service.getById).toHaveBeenCalledWith('rating-id-123');
      expect(result).toEqual(mockRatings);
    });

    it('should handle update errors', async () => {
      const error = new Error('Update failed');
      mockRatingsModel.findByIdAndUpdate.mockRejectedValue(error);

      await expect(
        service.update('rating-id-123', mockRatingsDto),
      ).rejects.toThrow('Update failed');
    });
  });

  describe('create', () => {
    it('should create new rating', async () => {
      const result = await service.create(mockRatingsDto);

      expect(mockRatingsModel).toHaveBeenCalledWith(mockRatingsDto);
      expect(result).toEqual(expect.objectContaining(mockRatingsDto));
    });

    it('should handle creation errors', async () => {
      const mockInstance = {
        save: jest.fn().mockRejectedValue(new Error('Creation failed')),
      };
      mockRatingsModel.mockImplementation(() => mockInstance);

      await expect(service.create(mockRatingsDto)).rejects.toThrow(
        'Creation failed',
      );
    });
  });
});
