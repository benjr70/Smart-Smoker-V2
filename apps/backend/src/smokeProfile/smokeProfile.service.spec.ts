import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SmokeProfileService } from './smokeProfile.service';
import { SmokeProfile } from './smokeProfile.schema';
import { SmokeProFileDto } from './smokeProfileDto';
import { StateService } from '../State/state.service';
import { SmokeService } from '../smoke/smoke.service';
import { RatingsService } from '../ratings/ratings.service';
import { SmokeDto } from '../smoke/smokeDto';

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
      GetById: jest.fn(),
      Update: jest.fn(),
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
      mockSmokeService.GetById.mockResolvedValue(mockSmoke);

      const result = await service.getCurrentSmokeProfile();

      expect(mockStateService.GetState).toHaveBeenCalled();
      expect(mockSmokeService.GetById).toHaveBeenCalledWith(mockState.smokeId);
      expect(mockSmokeProfileModel.findById).toHaveBeenCalledWith(
        mockSmoke.smokeProfileId,
      );
      expect(result).toEqual(mockSmokeProfile);
    });

    it('should return default profile when smoke has no profile', async () => {
      mockStateService.GetState.mockResolvedValue(mockState);
      mockSmokeService.GetById.mockResolvedValue(mockSmokeWithoutProfile);

      const result = await service.getCurrentSmokeProfile();

      expect(mockStateService.GetState).toHaveBeenCalled();
      expect(mockSmokeService.GetById).toHaveBeenCalledWith(mockState.smokeId);
      expect(result).toEqual(mockDefaultProfile);
    });

    it('should handle case when no state exists (bug: state remains null)', async () => {
      mockStateService.GetState.mockResolvedValue(null);
      mockStateService.create.mockResolvedValue({
        smokeId: '',
        smoking: false,
      });

      // Due to a bug in the service, it doesn't reassign the state variable after creation
      // This test documents the current buggy behavior
      await expect(service.getCurrentSmokeProfile()).rejects.toThrow(
        "Cannot read properties of null (reading 'smokeId')",
      );

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
      mockSmokeService.GetById.mockRejectedValue(error);

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
      mockSmokeService.GetById.mockResolvedValue(mockSmoke);
      mockRatingsService.saveCurrentRatings.mockResolvedValue({});
      jest.spyOn(service, 'update').mockResolvedValue(mockSmokeProfile);

      const result = await service.saveCurrentSmokeProfile(mockSmokeProfileDto);

      expect(mockRatingsService.saveCurrentRatings).not.toHaveBeenCalled(); // Profile exists, so no rating creation
      expect(service.update).toHaveBeenCalledWith(
        mockSmoke.smokeProfileId,
        mockSmokeProfileDto,
      );
      expect(result).toBeUndefined();
    });

    it('should create new profile when smoke has no profileId', async () => {
      mockSmokeService.GetById.mockResolvedValue(mockSmokeWithoutProfile);
      mockRatingsService.saveCurrentRatings.mockResolvedValue({});
      jest.spyOn(service, 'create').mockResolvedValue(mockSmokeProfile);

      const expectedSmokeDto: SmokeDto = {
        smokeProfileId: mockSmokeProfile._id,
        preSmokeId: mockSmokeWithoutProfile.preSmokeId,
        postSmokeId: mockSmokeWithoutProfile.postSmokeId,
        tempsId: mockSmokeWithoutProfile.tempsId,
        status: mockSmokeWithoutProfile.status,
      };

      const result = await service.saveCurrentSmokeProfile(mockSmokeProfileDto);

      expect(service.create).toHaveBeenCalledWith(mockSmokeProfileDto);
      expect(mockSmokeService.Update).toHaveBeenCalledWith(
        mockSmokeWithoutProfile._id,
        expectedSmokeDto,
      );
      expect(result).toEqual(mockSmokeProfile);
    });

    it('should skip rating creation when rating already exists', async () => {
      const smokeWithRating = { ...mockSmoke, ratingId: 'existing-rating-id' };
      mockSmokeService.GetById.mockResolvedValue(smokeWithRating);
      jest.spyOn(service, 'update').mockResolvedValue(mockSmokeProfile);

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

      expect(mockSmokeService.GetById).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('should handle state service errors', async () => {
      const error = new Error('State service error');
      mockStateService.GetState.mockRejectedValue(error);

      await expect(
        service.saveCurrentSmokeProfile(mockSmokeProfileDto),
      ).rejects.toThrow('State service error');
    });
  });

  describe('create', () => {
    it('should create new smoke profile', async () => {
      const result = await service.create(mockSmokeProfileDto);

      expect(mockSmokeProfileModel).toHaveBeenCalledWith(mockSmokeProfileDto);
      expect(result).toEqual(expect.objectContaining(mockSmokeProfileDto));
    });

    it('should handle creation errors', async () => {
      const mockInstance = {
        save: jest.fn().mockRejectedValue(new Error('Creation failed')),
      };
      mockSmokeProfileModel.mockImplementation(() => mockInstance);

      await expect(service.create(mockSmokeProfileDto)).rejects.toThrow(
        'Creation failed',
      );
    });
  });

  describe('getById', () => {
    it('should return smoke profile by id', async () => {
      const result = await service.getById('profile-id-123');

      expect(mockSmokeProfileModel.findById).toHaveBeenCalledWith(
        'profile-id-123',
      );
      expect(result).toEqual(mockSmokeProfile);
    });

    it('should return null for non-existent profile', async () => {
      mockSmokeProfileModel.findById.mockResolvedValue(null);

      const result = await service.getById('non-existent-id');

      expect(mockSmokeProfileModel.findById).toHaveBeenCalledWith(
        'non-existent-id',
      );
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update smoke profile and return updated data', async () => {
      jest.spyOn(service, 'getById').mockResolvedValue(mockSmokeProfile);

      const result = await service.update(
        'profile-id-123',
        mockSmokeProfileDto,
      );

      expect(mockSmokeProfileModel.findByIdAndUpdate).toHaveBeenCalledWith(
        { _id: 'profile-id-123' },
        mockSmokeProfileDto,
      );
      expect(service.getById).toHaveBeenCalledWith('profile-id-123');
      expect(result).toEqual(mockSmokeProfile);
    });

    it('should handle update errors', async () => {
      const error = new Error('Update failed');
      mockSmokeProfileModel.findByIdAndUpdate.mockRejectedValue(error);

      await expect(
        service.update('profile-id-123', mockSmokeProfileDto),
      ).rejects.toThrow('Update failed');
    });
  });

  describe('Delete', () => {
    it('should delete smoke profile by id', async () => {
      const result = await service.Delete('profile-id-123');

      expect(mockSmokeProfileModel.deleteOne).toHaveBeenCalledWith({
        _id: 'profile-id-123',
      });
      expect(result).toEqual({ deletedCount: 1 });
    });

    it('should handle deletion of non-existent profile', async () => {
      mockSmokeProfileModel.deleteOne.mockResolvedValue({ deletedCount: 0 });

      const result = await service.Delete('non-existent-id');

      expect(mockSmokeProfileModel.deleteOne).toHaveBeenCalledWith({
        _id: 'non-existent-id',
      });
      expect(result).toEqual({ deletedCount: 0 });
    });
  });
});
