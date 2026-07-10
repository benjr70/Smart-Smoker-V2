import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { StateService } from '../State/state.service';
import { RatingsService } from '../ratings/ratings.service';
import { SmokeService } from '../smoke/smoke.service';
import { SmokeDto } from '../smoke/smokeDto';
import { SmokeProfileService } from './smokeProfile.service';
import { SmokeProFileDto } from './smokeProfileDto';

describe('SmokeProfileService', () => {
  let service: SmokeProfileService;
  let mockSmokeProfileModel: any;
  let mockStateService: any;
  let mockSmokeService: any;
  let mockRatingsService: any;

  const mockSmokeProfileDto: SmokeProFileDto = {
    chamberName: 'Big Green Egg',
    probe1Name: 'Brisket',
    probe2Name: 'Pork Shoulder',
    probe3Name: 'Chicken',
    notes: 'Low and slow cook',
    woodType: 'Hickory',
  };

  const mockSmokeProfile = {
    _id: 'profile-id-123',
    ...mockSmokeProfileDto,
  };

  const mockState = {
    _id: 'state-id',
    smokeId: 'smoke-id-123',
    smoking: true,
  };

  const mockSmoke = {
    _id: 'smoke-id-123',
    smokeProfileId: 'profile-id-123',
    preSmokeId: 'pre-smoke-id',
    postSmokeId: 'post-smoke-id',
    tempsId: 'temps-id',
    ratingId: 'rating-id-123',
    status: 1,
  };

  const mockSmokeWithoutProfile = {
    _id: 'smoke-id-456',
    smokeProfileId: null,
    preSmokeId: 'pre-smoke-id',
    postSmokeId: 'post-smoke-id',
    tempsId: 'temps-id',
    ratingId: null,
    status: 1,
  };

  const mockDefaultProfile = {
    notes: '',
    woodType: '',
    chamberName: 'Chamber',
    probe1Name: 'Probe1',
    probe2Name: 'Probe2',
    probe3Name: 'Probe3',
  };

  beforeEach(async () => {
    // Mock SmokeProfile model
    mockSmokeProfileModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ ...dto, _id: 'new-profile-id' }),
    }));

    mockSmokeProfileModel.findById = jest
      .fn()
      .mockResolvedValue(mockSmokeProfile);
    mockSmokeProfileModel.deleteOne = jest
      .fn()
      .mockResolvedValue({ deletedCount: 1 });
    mockSmokeProfileModel.findByIdAndUpdate = jest
      .fn()
      .mockResolvedValue(mockSmokeProfile);

    // Mock StateService
    mockStateService = {
      GetState: jest.fn(),
      create: jest.fn(),
    };

    // Mock SmokeService
    mockSmokeService = {
      getById: jest.fn(),
      update: jest.fn(),
    };

    // Mock RatingsService
    mockRatingsService = {
      saveCurrentRatings: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmokeProfileService,
        {
          provide: getModelToken('SmokeProfile'),
          useValue: mockSmokeProfileModel,
        },
        {
          provide: StateService,
          useValue: mockStateService,
        },
        {
          provide: SmokeService,
          useValue: mockSmokeService,
        },
        {
          provide: RatingsService,
          useValue: mockRatingsService,
        },
      ],
    }).compile();

    service = module.get<SmokeProfileService>(SmokeProfileService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCurrentSmokeProfile', () => {
    it('should return current smoke profile when state and smoke have profile', async () => {
      mockStateService.GetState.mockResolvedValue(mockState);
      mockSmokeService.getById.mockResolvedValue(mockSmoke);

      const result = await service.getCurrentSmokeProfile();

      expect(mockStateService.GetState).toHaveBeenCalled();
      expect(mockSmokeService.getById).toHaveBeenCalledWith(mockState.smokeId);
      expect(mockSmokeProfileModel.findById).toHaveBeenCalledWith(
        mockSmoke.smokeProfileId,
      );
      expect(result).toEqual(mockSmokeProfile);
    });

    it('should return default profile when smoke has no profile', async () => {
      mockStateService.GetState.mockResolvedValue(mockState);
      mockSmokeService.getById.mockResolvedValue(mockSmokeWithoutProfile);

      const result = await service.getCurrentSmokeProfile();

      expect(mockStateService.GetState).toHaveBeenCalled();
      expect(mockSmokeService.getById).toHaveBeenCalledWith(mockState.smokeId);
      expect(result).toEqual(mockDefaultProfile);
    });

    it('should self-heal a missing state and return the default profile', async () => {
      mockStateService.GetState.mockResolvedValue(null);
      mockStateService.create.mockResolvedValue({
        smokeId: '',
        smoking: false,
      });

      const result = await service.getCurrentSmokeProfile();

      expect(result).toEqual(mockDefaultProfile);
      expect(mockStateService.GetState).toHaveBeenCalled();
      expect(mockStateService.create).toHaveBeenCalledWith({
        smokeId: '',
        smoking: false,
      });
    });

    it('should handle errors from state service', async () => {
      const error = new Error('Database connection failed');
      mockStateService.GetState.mockRejectedValue(error);

      await expect(service.getCurrentSmokeProfile()).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('should handle errors from smoke service', async () => {
      mockStateService.GetState.mockResolvedValue(mockState);
      const error = new Error('Smoke not found');
      mockSmokeService.getById.mockRejectedValue(error);

      await expect(service.getCurrentSmokeProfile()).rejects.toThrow(
        'Smoke not found',
      );
    });
  });

  describe('saveCurrentSmokeProfile', () => {
    beforeEach(() => {
      mockStateService.GetState.mockResolvedValue(mockState);
    });

    it('should update existing profile when smoke has profileId', async () => {
      mockSmokeService.getById.mockResolvedValue(mockSmoke);
      mockRatingsService.saveCurrentRatings.mockResolvedValue({});
      jest.spyOn(service, 'update').mockResolvedValue(mockSmokeProfile as any);

      const result = await service.saveCurrentSmokeProfile(mockSmokeProfileDto);

      expect(mockRatingsService.saveCurrentRatings).not.toHaveBeenCalled(); // Profile exists, so no rating creation
      expect(service.update).toHaveBeenCalledWith(
        mockSmoke.smokeProfileId,
        mockSmokeProfileDto,
      );
      expect(result).toEqual(mockSmokeProfile);
    });

    it('should create new profile when smoke has no profileId', async () => {
      mockSmokeService.getById.mockResolvedValue(mockSmokeWithoutProfile);
      mockRatingsService.saveCurrentRatings.mockResolvedValue({});
      jest.spyOn(service, 'create').mockResolvedValue(mockSmokeProfile as any);

      const expectedSmokeDto: SmokeDto = {
        smokeProfileId: mockSmokeProfile._id,
        preSmokeId: mockSmokeWithoutProfile.preSmokeId,
        postSmokeId: mockSmokeWithoutProfile.postSmokeId,
        tempsId: mockSmokeWithoutProfile.tempsId,
        status: mockSmokeWithoutProfile.status,
      };

      const result = await service.saveCurrentSmokeProfile(mockSmokeProfileDto);

      expect(service.create).toHaveBeenCalledWith(mockSmokeProfileDto);
      expect(mockSmokeService.update).toHaveBeenCalledWith(
        mockSmokeWithoutProfile._id,
        expectedSmokeDto,
      );
      expect(result).toEqual(mockSmokeProfile);
    });

    it('should skip rating creation when rating already exists', async () => {
      const smokeWithRating = { ...mockSmoke, ratingId: 'existing-rating-id' };
      mockSmokeService.getById.mockResolvedValue(smokeWithRating);
      jest.spyOn(service, 'update').mockResolvedValue(mockSmokeProfile as any);

      await service.saveCurrentSmokeProfile(mockSmokeProfileDto);

      expect(mockRatingsService.saveCurrentRatings).not.toHaveBeenCalled();
      expect(service.update).toHaveBeenCalledWith(
        smokeWithRating.smokeProfileId,
        mockSmokeProfileDto,
      );
    });

    it('should handle empty smokeId state', async () => {
      const emptyState = { ...mockState, smokeId: '' };
      mockStateService.GetState.mockResolvedValue(emptyState);

      const result = await service.saveCurrentSmokeProfile(mockSmokeProfileDto);

      expect(mockSmokeService.getById).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should handle state service errors', async () => {
      const error = new Error('State service error');
      mockStateService.GetState.mockRejectedValue(error);

      await expect(
        service.saveCurrentSmokeProfile(mockSmokeProfileDto),
      ).rejects.toThrow('State service error');
    });
  });

  // create / getById / update / delete are inherited from BaseService and
  // verified once at the BaseService boundary (base.service.spec.ts).
});
