import { Test, TestingModule } from '@nestjs/testing';
import { HistoryService } from './history.service';
import { PreSmokeService } from '../presmoke/presmoke.service';
import { RatingsService } from '../ratings/ratings.service';
import { SmokeService } from '../smoke/smoke.service';
import { SmokeProfileService } from '../smokeProfile/smokeProfile.service';
import { SmokeStatus } from '../smoke/smoke.schema';

describe('HistoryService', () => {
  let service: HistoryService;
  let mockSmokeService: Partial<SmokeService>;
  let mockPreSmokeService: Partial<PreSmokeService>;
  let mockSmokeProfileService: Partial<SmokeProfileService>;
  let mockRatingsService: Partial<RatingsService>;

  const mockSmoke = {
    _id: 'smoke-id',
    preSmokeId: 'presmoke-id',
    smokeProfileId: 'profile-id',
    ratingId: 'rating-id',
    date: new Date('2023-01-01T00:00:00.000Z'),
    status: SmokeStatus.Complete,
  };

  const mockPreSmoke = {
    name: 'Brisket Cook',
    meatType: 'beef',
    weight: { weight: 5.5, unit: 'lbs' },
  };

  const mockSmokeProfile = {
    woodType: 'hickory',
  };

  const mockRatings = {
    overallTaste: 9,
  };

  beforeEach(async () => {
    mockSmokeService = {
      getAll: jest.fn().mockResolvedValue([mockSmoke]),
    };

    mockPreSmokeService = {
      GetByID: jest.fn().mockResolvedValue(mockPreSmoke),
    };

    mockSmokeProfileService = {
      getById: jest.fn().mockResolvedValue(mockSmokeProfile),
    };

    mockRatingsService = {
      getById: jest.fn().mockResolvedValue(mockRatings),
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
          provide: RatingsService,
          useValue: mockRatingsService,
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
      expect(mockPreSmokeService.GetByID).toHaveBeenCalledWith('presmoke-id');
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
        },
      ]);
    });

    it('should filter out incomplete smokes', async () => {
      const incompleteSmoke = { ...mockSmoke, status: SmokeStatus.InProgress };
      mockSmokeService.getAll = jest.fn().mockResolvedValue([incompleteSmoke]);

      const result = await service.getHistory();

      expect(result).toEqual([]);
      expect(mockPreSmokeService.GetByID).not.toHaveBeenCalled();
    });

    it('should handle null preSmoke data', async () => {
      mockPreSmokeService.GetByID = jest.fn().mockResolvedValue(null);

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
