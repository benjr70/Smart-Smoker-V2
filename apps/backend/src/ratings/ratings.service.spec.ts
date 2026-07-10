import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { RatingsService } from './ratings.service';
import { RatingsDto } from './ratingsDto';
import { SmokeService } from '../smoke/smoke.service';
import { SmokeDto } from '../smoke/smokeDto';
import { createMockModel } from '../common/testing/create-mock-model';

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
    // Mock Ratings model (shared factory; overrides are exec()-chainable to
    // match how BaseService drives the model — findById(id).exec()).
    mockRatingsModel = createMockModel({
      findById: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(mockRatings) }),
      findByIdAndUpdate: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(mockRatings) }),
    });

    // Mock SmokeService
    mockSmokeService = {
      getCurrentSmoke: jest.fn(),
      update: jest.fn(),
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
      jest.spyOn(service, 'update').mockResolvedValue(mockRatings as any);

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
      jest.spyOn(service, 'create').mockResolvedValue(mockRatings as any);

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
      expect(mockSmokeService.update).toHaveBeenCalledWith(
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

  // create / getById / update / delete are inherited from BaseService and
  // verified once at the BaseService boundary (base.service.spec.ts).
});
