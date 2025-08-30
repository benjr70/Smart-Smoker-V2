import { Test, TestingModule } from '@nestjs/testing';
import { SmokeProfileController } from './smokeProfile.controller';
import { SmokeProfileService } from './smokeProfile.service';
import { SmokeProFileDto } from './smokeProfileDto';

describe('SmokeProfileController', () => {
  let controller: SmokeProfileController;
  let service: SmokeProfileService;

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

  const mockDefaultProfile = {
    notes: '',
    woodType: '',
    chamberName: 'Chamber',
    probe1Name: 'Probe1',
    probe2Name: 'Probe2',
    probe3Name: 'Probe3',
  };

  const mockSmokeProfileService = {
    getCurrentSmokeProfile: jest.fn(),
    getById: jest.fn(),
    saveCurrentSmokeProfile: jest.fn(),
    Delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SmokeProfileController],
      providers: [
        {
          provide: SmokeProfileService,
          useValue: mockSmokeProfileService,
        },
      ],
    }).compile();

    controller = module.get<SmokeProfileController>(SmokeProfileController);
    service = module.get<SmokeProfileService>(SmokeProfileService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getCurrentSmokeProfile', () => {
    it('should return current smoke profile', async () => {
      mockSmokeProfileService.getCurrentSmokeProfile.mockResolvedValue(
        mockSmokeProfile,
      );

      const result = await controller.getCurrentSmokeProfile();

      expect(service.getCurrentSmokeProfile).toHaveBeenCalled();
      expect(result).toEqual(mockSmokeProfile);
    });

    it('should return default profile when no current profile exists', async () => {
      mockSmokeProfileService.getCurrentSmokeProfile.mockResolvedValue(
        mockDefaultProfile,
      );

      const result = await controller.getCurrentSmokeProfile();

      expect(service.getCurrentSmokeProfile).toHaveBeenCalled();
      expect(result).toEqual(mockDefaultProfile);
    });

    it('should handle service errors', async () => {
      const error = new Error('No current smoke found');
      mockSmokeProfileService.getCurrentSmokeProfile.mockRejectedValue(error);

      await expect(controller.getCurrentSmokeProfile()).rejects.toThrow(
        'No current smoke found',
      );
    });
  });

  describe('getSmokeProfileById', () => {
    it('should return smoke profile by id', async () => {
      const id = 'profile-id-123';
      mockSmokeProfileService.getById.mockResolvedValue(mockSmokeProfile);

      const result = await controller.getSmokeProfileById(id);

      expect(service.getById).toHaveBeenCalledWith(id);
      expect(result).toEqual(mockSmokeProfile);
    });

    it('should return null for non-existent profile', async () => {
      const id = 'non-existent-id';
      mockSmokeProfileService.getById.mockResolvedValue(null);

      const result = await controller.getSmokeProfileById(id);

      expect(service.getById).toHaveBeenCalledWith(id);
      expect(result).toBeNull();
    });

    it('should handle service errors', async () => {
      const id = 'invalid-id';
      const error = new Error('Invalid ObjectId');
      mockSmokeProfileService.getById.mockRejectedValue(error);

      await expect(controller.getSmokeProfileById(id)).rejects.toThrow(
        'Invalid ObjectId',
      );
    });
  });

  describe('saveCurrentSmokeProfile', () => {
    it('should save current smoke profile', async () => {
      mockSmokeProfileService.saveCurrentSmokeProfile.mockResolvedValue(
        mockSmokeProfile,
      );

      const result =
        await controller.saveCurrentSmokeProfile(mockSmokeProfileDto);

      expect(service.saveCurrentSmokeProfile).toHaveBeenCalledWith(
        mockSmokeProfileDto,
      );
      expect(result).toEqual(mockSmokeProfile);
    });

    it('should handle validation errors', async () => {
      const error = new Error('Invalid profile data');
      mockSmokeProfileService.saveCurrentSmokeProfile.mockRejectedValue(error);

      await expect(
        controller.saveCurrentSmokeProfile(mockSmokeProfileDto),
      ).rejects.toThrow('Invalid profile data');
    });

    it('should handle service errors during save', async () => {
      const error = new Error('Database error');
      mockSmokeProfileService.saveCurrentSmokeProfile.mockRejectedValue(error);

      await expect(
        controller.saveCurrentSmokeProfile(mockSmokeProfileDto),
      ).rejects.toThrow('Database error');
    });

    it('should handle empty smoke state', async () => {
      mockSmokeProfileService.saveCurrentSmokeProfile.mockResolvedValue(
        undefined,
      );

      const result =
        await controller.saveCurrentSmokeProfile(mockSmokeProfileDto);

      expect(service.saveCurrentSmokeProfile).toHaveBeenCalledWith(
        mockSmokeProfileDto,
      );
      expect(result).toBeUndefined();
    });
  });

  describe('DeleteById', () => {
    it('should delete smoke profile by id', async () => {
      const id = 'profile-id-123';
      const deleteResult = { deletedCount: 1 };
      mockSmokeProfileService.Delete.mockResolvedValue(deleteResult);

      const result = await controller.DeleteById(id);

      expect(service.Delete).toHaveBeenCalledWith(id);
      expect(result).toEqual(deleteResult);
    });

    it('should handle deletion of non-existent profile', async () => {
      const id = 'non-existent-id';
      const deleteResult = { deletedCount: 0 };
      mockSmokeProfileService.Delete.mockResolvedValue(deleteResult);

      const result = await controller.DeleteById(id);

      expect(service.Delete).toHaveBeenCalledWith(id);
      expect(result).toEqual(deleteResult);
    });

    it('should handle deletion errors', async () => {
      const id = 'invalid-id';
      const error = new Error('Database error');
      mockSmokeProfileService.Delete.mockRejectedValue(error);

      await expect(controller.DeleteById(id)).rejects.toThrow('Database error');
    });
  });
});
