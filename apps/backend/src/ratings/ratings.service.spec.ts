import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { RatingsService } from './ratings.service';
import { RatingsDto } from './ratingsDto';
import { SmokeService } from '../smoke/smoke.service';
import { SmokeDto } from '../smoke/smokeDto';
import { createMockModel } from '../common/testing/create-mock-model';
import { StatsService } from '../stats/stats.service';

describe('RatingsService', () => {
  let service: RatingsService;
  let mockRatingsModel: any;
  let mockSmokeService: any;
  let mockStatsService: { markDirty: jest.Mock; recalculate: jest.Mock };

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

    mockStatsService = {
      markDirty: jest.fn().mockResolvedValue(undefined),
      recalculate: jest.fn().mockResolvedValue(undefined),
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
        {
          provide: StatsService,
          useValue: mockStatsService,
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

  describe('the statistics a score belongs to', () => {
    it('marks them stale when an old cook is re-scored, without recomputing', async () => {
      await service.update('rating-id-123', mockRatingsDto);

      expect(mockStatsService.markDirty).toHaveBeenCalled();
      // Four sliders auto-save as they are dragged; recomputing the whole
      // archive behind each of them is what the dirty flag exists to avoid.
      expect(mockStatsService.recalculate).not.toHaveBeenCalled();
    });

    it('marks them stale when the running cook is rated for the first time', async () => {
      mockSmokeService.getCurrentSmoke.mockResolvedValue(
        mockSmokeWithoutRating,
      );

      await service.saveCurrentRatings(mockRatingsDto);

      expect(mockStatsService.markDirty).toHaveBeenCalled();
      expect(mockStatsService.recalculate).not.toHaveBeenCalled();
    });

    it('still saves the score when the flag cannot be written', async () => {
      mockStatsService.markDirty.mockRejectedValue(new Error('mongo hiccup'));

      // The score is in the database by the time the flag is written. Failing
      // here would tell the pitmaster their rating did not save, and their
      // retry would write it a second time.
      await expect(
        service.update('rating-id-123', mockRatingsDto),
      ).resolves.toBeDefined();
    });

    it('marks them stale when a score is deleted', async () => {
      // A delete changes the averages as surely as a write does, and it leaves
      // the number of completed cooks alone — so nothing but the flag would
      // ever notice the stored numbers still count the score that is gone.
      await service.delete('rating-id-123');

      expect(mockStatsService.markDirty).toHaveBeenCalled();
    });

    it('marks them stale again once the cook points at its new score', async () => {
      mockSmokeService.getCurrentSmoke.mockResolvedValue(
        mockSmokeWithoutRating,
      );

      await service.saveCurrentRatings(mockRatingsDto);

      // The rating exists before the cook points at it, and a rebuild in that
      // window reads an archive where the cook has no score — then clears the
      // flag the create had set. Marking again after the link means no rebuild
      // can end without having seen the score.
      const lastMark = Math.max(
        ...mockStatsService.markDirty.mock.invocationCallOrder,
      );
      expect(lastMark).toBeGreaterThan(
        mockSmokeService.update.mock.invocationCallOrder[0],
      );
    });
  });
});
