import { Test, TestingModule } from '@nestjs/testing';
import { HistoryService } from './history.service';
import { PreSmokeService } from '../presmoke/presmoke.service';
import { PostSmokeService } from '../postSmoke/postSmoke.service';
import { RatingsService } from '../ratings/ratings.service';
import { SmokeService } from '../smoke/smoke.service';
import { SmokeProfileService } from '../smokeProfile/smokeProfile.service';
import { SmokeStatus } from '../smoke/smoke.schema';
import { TimelineService } from '../timeline/timeline.service';

describe('HistoryService', () => {
  let service: HistoryService;
  let mockSmokeService: Partial<SmokeService>;
  let mockPreSmokeService: Partial<PreSmokeService>;
  let mockSmokeProfileService: Partial<SmokeProfileService>;
  let mockPostSmokeService: Partial<PostSmokeService>;
  let mockRatingsService: Partial<RatingsService>;
  let mockTimelineService: { getDurationMs: jest.Mock };

  const mockSmoke = {
    _id: 'smoke-id',
    preSmokeId: 'presmoke-id',
    smokeProfileId: 'profile-id',
    postSmokeId: 'postsmoke-id',
    ratingId: 'rating-id',
    date: new Date('2023-01-01T00:00:00.000Z'),
    status: SmokeStatus.Complete,
  };

  const mockPreSmoke = {
    name: 'Brisket Cook',
    meatType: 'beef',
    weight: { weight: 5.5, unit: 'lbs' },
    notes: 'trimmed the fat cap the night before',
  };

  const mockSmokeProfile = {
    woodType: 'hickory',
    notes: 'spritzed with apple juice every hour',
  };

  const mockPostSmoke = {
    notes: 'rested two hours in the cooler',
  };

  const mockRatings = {
    overallTaste: 9,
    notes: 'best bark yet',
  };

  beforeEach(async () => {
    mockSmokeService = {
      getAll: jest.fn().mockResolvedValue([mockSmoke]),
    };

    mockPreSmokeService = {
      getById: jest.fn().mockResolvedValue(mockPreSmoke),
    };

    mockSmokeProfileService = {
      getById: jest.fn().mockResolvedValue(mockSmokeProfile),
    };

    mockPostSmokeService = {
      getById: jest.fn().mockResolvedValue(mockPostSmoke),
    };

    mockRatingsService = {
      getById: jest.fn().mockResolvedValue(mockRatings),
    };

    mockTimelineService = {
      getDurationMs: jest.fn().mockResolvedValue(6 * 60 * 60 * 1000),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistoryService,
        {
          provide: SmokeService,
          useValue: mockSmokeService,
        },
        {
          provide: PreSmokeService,
          useValue: mockPreSmokeService,
        },
        {
          provide: SmokeProfileService,
          useValue: mockSmokeProfileService,
        },
        {
          provide: PostSmokeService,
          useValue: mockPostSmokeService,
        },
        {
          provide: RatingsService,
          useValue: mockRatingsService,
        },
        {
          provide: TimelineService,
          useValue: mockTimelineService,
        },
      ],
    }).compile();

    service = module.get<HistoryService>(HistoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getHistory', () => {
    it('should return history for completed smokes', async () => {
      const result = await service.getHistory();

      expect(mockSmokeService.getAll).toHaveBeenCalled();
      expect(mockPreSmokeService.getById).toHaveBeenCalledWith('presmoke-id');
      expect(mockSmokeProfileService.getById).toHaveBeenCalledWith(
        'profile-id',
      );
      expect(mockRatingsService.getById).toHaveBeenCalledWith('rating-id');

      expect(result).toEqual([
        {
          name: 'Brisket Cook',
          meatType: 'beef',
          date: 'Sat Dec 31 2022',
          weight: '5.5',
          weightUnit: 'lbs',
          woodType: 'hickory',
          smokeId: 'smoke-id',
          overAllRating: '9',
          durationMs: 6 * 60 * 60 * 1000,
          notes: [
            'trimmed the fat cap the night before',
            'spritzed with apple juice every hour',
            'rested two hours in the cooler',
            'best bark yet',
          ],
        },
      ]);
    });

    it('carries everything written about the cook, so the history list can be searched by it', async () => {
      const result = await service.getHistory();

      expect(mockPostSmokeService.getById).toHaveBeenCalledWith('postsmoke-id');
      // A word a user remembers typing lives in one of the four note fields,
      // and which one is not something they remember. The row carries all of
      // them so the search does not have to care.
      expect(result[0].notes).toEqual(
        expect.arrayContaining(['spritzed with apple juice every hour']),
      );
    });

    it('carries no note for a stage that was written nothing, rather than a blank one', async () => {
      mockPreSmokeService.getById = jest
        .fn()
        .mockResolvedValue({ ...mockPreSmoke, notes: '' });
      mockSmokeProfileService.getById = jest
        .fn()
        .mockResolvedValue({ ...mockSmokeProfile, notes: undefined });
      mockPostSmokeService.getById = jest.fn().mockResolvedValue(null);

      const result = await service.getHistory();

      expect(result[0].notes).toEqual(['best bark yet']);
    });

    it('carries no notes at all for a cook whose stages are all missing', async () => {
      mockPreSmokeService.getById = jest.fn().mockResolvedValue(null);
      mockSmokeProfileService.getById = jest.fn().mockResolvedValue(null);
      mockPostSmokeService.getById = jest.fn().mockResolvedValue(null);
      mockRatingsService.getById = jest.fn().mockResolvedValue(null);

      const result = await service.getHistory();

      expect(result[0].notes).toEqual([]);
    });

    it('carries how long each cook ran', async () => {
      const result = await service.getHistory();

      expect(mockTimelineService.getDurationMs).toHaveBeenCalledWith(mockSmoke);
      expect(result[0].durationMs).toBe(6 * 60 * 60 * 1000);
    });

    it('should filter out incomplete smokes', async () => {
      const incompleteSmoke = { ...mockSmoke, status: SmokeStatus.InProgress };
      mockSmokeService.getAll = jest.fn().mockResolvedValue([incompleteSmoke]);

      const result = await service.getHistory();

      expect(result).toEqual([]);
      expect(mockPreSmokeService.getById).not.toHaveBeenCalled();
    });

    it('should handle null preSmoke data', async () => {
      mockPreSmokeService.getById = jest.fn().mockResolvedValue(null);

      const result = await service.getHistory();

      expect(result[0]).toEqual(
        expect.objectContaining({
          name: '',
          meatType: '',
          weight: '',
          weightUnit: '',
        }),
      );
    });

    it('should handle null smokeProfile data', async () => {
      mockSmokeProfileService.getById = jest.fn().mockResolvedValue(null);

      const result = await service.getHistory();

      expect(result[0]).toEqual(
        expect.objectContaining({
          woodType: '',
        }),
      );
    });

    it('should handle null ratings data', async () => {
      mockRatingsService.getById = jest.fn().mockResolvedValue(null);

      const result = await service.getHistory();

      expect(result[0]).toEqual(
        expect.objectContaining({
          overAllRating: '',
        }),
      );
    });

    it('should handle smoke without date', async () => {
      const smokeWithoutDate = { ...mockSmoke, date: null };
      mockSmokeService.getAll = jest.fn().mockResolvedValue([smokeWithoutDate]);

      const result = await service.getHistory();

      expect(result[0]).toEqual(
        expect.objectContaining({
          date: '',
        }),
      );
    });
  });
});
