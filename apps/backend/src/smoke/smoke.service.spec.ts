import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SmokeService } from './smoke.service';
import { Smoke, SmokeDocument, SmokeStatus } from './smoke.schema';
import { SmokeDto } from './smokeDto';
import { StateService } from '../State/state.service';
import { TimelineService } from '../timeline/timeline.service';
import { createMockModel } from '../common/testing/create-mock-model';

describe('SmokeService', () => {
  let service: SmokeService;
  let mockSmokeModel: any;
  let mockStateService: Partial<StateService>;
  let mockTimelineService: { stampFinish: jest.Mock };
  let mockPreSmokeModel: any;
  let mockSmokeProfileModel: any;
  let mockTempModel: any;
  let mockPostSmokeModel: any;
  let mockRatingsModel: any;
  // Every delete the deep delete issues, in the order it issued them, so the
  // "children before parent" ordering can be asserted as a fact rather than
  // inferred from five independent mocks.
  let deleteLog: string[];

  const mockSmoke: Smoke = {
    preSmokeId: 'pre-smoke-id',
    tempsId: 'temps-id',
    postSmokeId: 'post-smoke-id',
    smokeProfileId: 'profile-id',
    ratingId: 'rating-id',
    date: new Date('2023-01-01'),
    status: SmokeStatus.InProgress,
  };

  const mockSmokeDocument = {
    _id: 'test-smoke-id',
    ...mockSmoke,
    save: jest.fn().mockResolvedValue(mockSmoke),
  };

  const mockState = {
    smokeId: 'test-smoke-id',
    smoking: true,
  };

  beforeEach(async () => {
    // Create a mock constructor function that returns an object with save method
    mockSmokeModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ ...dto, _id: 'new-id' }),
    }));

    // Add static methods to the mock constructor
    mockSmokeModel.find = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([mockSmokeDocument]),
    });
    mockSmokeModel.findById = jest.fn().mockResolvedValue(mockSmokeDocument);
    mockSmokeModel.findOneAndUpdate = jest
      .fn()
      .mockResolvedValue(mockSmokeDocument);
    deleteLog = [];
    mockSmokeModel.deleteOne = jest.fn().mockImplementation((filter) => ({
      exec: jest.fn().mockImplementation(async () => {
        deleteLog.push(`smoke:${filter._id}`);
        return { deletedCount: 1 };
      }),
    }));

    // A child collection whose removals announce themselves into the shared
    // log, so the order the cascade ran in survives the call.
    const childModel = (label: string) =>
      createMockModel({
        deleteOne: jest.fn().mockImplementation((filter: any) => ({
          exec: jest.fn().mockImplementation(async () => {
            deleteLog.push(`${label}:${filter._id}`);
            return { deletedCount: 1 };
          }),
        })),
        deleteMany: jest.fn().mockImplementation((filter: any) => ({
          exec: jest.fn().mockImplementation(async () => {
            deleteLog.push(`${label}:${JSON.stringify(filter)}`);
            return { deletedCount: 3 };
          }),
        })),
      });

    mockPreSmokeModel = childModel('preSmoke');
    mockSmokeProfileModel = childModel('smokeProfile');
    mockTempModel = childModel('temp');
    mockPostSmokeModel = childModel('postSmoke');
    mockRatingsModel = childModel('ratings');

    mockStateService = {
      GetState: jest.fn().mockResolvedValue(mockState),
    };

    mockTimelineService = {
      stampFinish: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmokeService,
        {
          provide: getModelToken('Smoke'),
          useValue: mockSmokeModel,
        },
        {
          provide: StateService,
          useValue: mockStateService,
        },
        {
          provide: TimelineService,
          useValue: mockTimelineService,
        },
        { provide: getModelToken('PreSmoke'), useValue: mockPreSmokeModel },
        {
          provide: getModelToken('SmokeProfile'),
          useValue: mockSmokeProfileModel,
        },
        { provide: getModelToken('Temp'), useValue: mockTempModel },
        { provide: getModelToken('PostSmoke'), useValue: mockPostSmokeModel },
        { provide: getModelToken('Ratings'), useValue: mockRatingsModel },
      ],
    }).compile();

    service = module.get<SmokeService>(SmokeService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new smoke and set date', async () => {
      const smokeDto: SmokeDto = {
        preSmokeId: 'new-pre-smoke-id',
        status: SmokeStatus.InProgress,
      };

      // Mock Date to have consistent testing
      const mockDate = new Date('2023-01-01');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const result = await service.create(smokeDto);

      expect(smokeDto.date).toEqual(mockDate);
      expect(mockSmokeModel).toHaveBeenCalledWith(smokeDto);
      expect(result).toBeDefined();

      // Restore Date
      jest.restoreAllMocks();
    });
  });

  describe('getCurrentSmoke', () => {
    it('should return current smoke based on state', async () => {
      jest
        .spyOn(service, 'getById')
        .mockResolvedValue(mockSmokeDocument as unknown as SmokeDocument);

      const result = await service.getCurrentSmoke();

      expect(mockStateService.GetState).toHaveBeenCalled();
      expect(service.getById).toHaveBeenCalledWith(mockState.smokeId);
      expect(result).toEqual(mockSmokeDocument);
    });

    it('should return null when no active smoke', async () => {
      mockStateService.GetState = jest
        .fn()
        .mockResolvedValue({ smokeId: '', smoking: false });

      const result = await service.getCurrentSmoke();

      expect(result).toBeNull();
    });
  });

  describe('FinishSmoke', () => {
    it('should finish current smoke by setting status to Complete', async () => {
      jest
        .spyOn(service, 'getCurrentSmoke')
        .mockResolvedValue(mockSmokeDocument as Smoke);
      jest.spyOn(service, 'update').mockResolvedValue({
        ...mockSmokeDocument,
        status: SmokeStatus.Complete,
      } as unknown as SmokeDocument);

      const result = await service.FinishSmoke();

      const expectedDto: SmokeDto = {
        smokeProfileId: mockSmoke.smokeProfileId,
        preSmokeId: mockSmoke.preSmokeId,
        postSmokeId: mockSmoke.postSmokeId,
        tempsId: mockSmoke.tempsId,
        ratingId: mockSmoke.ratingId,
        status: SmokeStatus.Complete,
      };

      expect(service.getCurrentSmoke).toHaveBeenCalled();
      expect(service.update).toHaveBeenCalledWith('test-smoke-id', expectedDto);
      expect(result.status).toEqual(SmokeStatus.Complete);
    });

    it('stamps the finish of the cook it completes', async () => {
      jest
        .spyOn(service, 'getCurrentSmoke')
        .mockResolvedValue(mockSmokeDocument as Smoke);
      jest.spyOn(service, 'update').mockResolvedValue({
        ...mockSmokeDocument,
        status: SmokeStatus.Complete,
      } as unknown as SmokeDocument);

      await service.FinishSmoke();

      expect(mockTimelineService.stampFinish).toHaveBeenCalledWith(
        'test-smoke-id',
      );
    });

    it('stamps nothing when there is no cook to finish', async () => {
      jest.spyOn(service, 'getCurrentSmoke').mockResolvedValue(null);

      expect(await service.FinishSmoke()).toBeNull();
      expect(mockTimelineService.stampFinish).not.toHaveBeenCalled();
    });
  });

  describe('deleteDeep', () => {
    it('removes the parent smoke and all five of its children', async () => {
      jest
        .spyOn(service, 'getById')
        .mockResolvedValue(mockSmokeDocument as unknown as SmokeDocument);

      await service.deleteDeep('test-smoke-id');

      expect(mockPreSmokeModel.deleteOne).toHaveBeenCalledWith({
        _id: 'pre-smoke-id',
      });
      expect(mockSmokeProfileModel.deleteOne).toHaveBeenCalledWith({
        _id: 'profile-id',
      });
      expect(mockPostSmokeModel.deleteOne).toHaveBeenCalledWith({
        _id: 'post-smoke-id',
      });
      expect(mockRatingsModel.deleteOne).toHaveBeenCalledWith({
        _id: 'rating-id',
      });
      expect(mockSmokeModel.deleteOne).toHaveBeenCalledWith({
        _id: 'test-smoke-id',
      });
    });

    it('deletes every child before the parent, so a failure is retryable', async () => {
      jest
        .spyOn(service, 'getById')
        .mockResolvedValue(mockSmokeDocument as unknown as SmokeDocument);

      await service.deleteDeep('test-smoke-id');

      expect(deleteLog).toHaveLength(6);
      expect(deleteLog[deleteLog.length - 1]).toBe('smoke:test-smoke-id');
      expect(deleteLog.slice(0, 5).sort()).toEqual(
        [
          'preSmoke:pre-smoke-id',
          'smokeProfile:profile-id',
          'temp:{"tempsId":"temps-id"}',
          'postSmoke:post-smoke-id',
          'ratings:rating-id',
        ].sort(),
      );
    });

    it('removes the temperature series by its shared id, not a single reading', async () => {
      jest
        .spyOn(service, 'getById')
        .mockResolvedValue(mockSmokeDocument as unknown as SmokeDocument);

      await service.deleteDeep('test-smoke-id');

      expect(mockTempModel.deleteMany).toHaveBeenCalledWith({
        tempsId: 'temps-id',
      });
      expect(mockTempModel.deleteOne).not.toHaveBeenCalled();
    });

    it('deletes what a legacy smoke does have when child ids are missing', async () => {
      jest.spyOn(service, 'getById').mockResolvedValue({
        _id: 'legacy-smoke-id',
        preSmokeId: 'pre-smoke-id',
        tempsId: '',
        status: SmokeStatus.Complete,
      } as unknown as SmokeDocument);

      await expect(
        service.deleteDeep('legacy-smoke-id'),
      ).resolves.toBeDefined();

      expect(mockPreSmokeModel.deleteOne).toHaveBeenCalledWith({
        _id: 'pre-smoke-id',
      });
      expect(mockTempModel.deleteMany).not.toHaveBeenCalled();
      expect(mockSmokeProfileModel.deleteOne).not.toHaveBeenCalled();
      expect(mockPostSmokeModel.deleteOne).not.toHaveBeenCalled();
      expect(mockRatingsModel.deleteOne).not.toHaveBeenCalled();
      expect(mockSmokeModel.deleteOne).toHaveBeenCalledWith({
        _id: 'legacy-smoke-id',
      });
    });

    it('deletes nothing at all when the smoke itself is gone', async () => {
      jest.spyOn(service, 'getById').mockResolvedValue(null);

      await expect(service.deleteDeep('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(deleteLog).toEqual([]);
    });
  });
});
