import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SmokeService } from './smoke.service';
import { Smoke, SmokeStatus } from './smoke.schema';
import { SmokeDto } from './smokeDto';
import { StateService } from '../State/state.service';

describe('SmokeService', () => {
  let service: SmokeService;
  let mockSmokeModel: any;
  let mockStateService: Partial<StateService>;

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
    mockSmokeModel.deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });

    mockStateService = {
      GetState: jest.fn().mockResolvedValue(mockState),
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

  describe('GetById', () => {
    it('should return smoke by id', async () => {
      const id = 'test-id';

      const result = await service.GetById(id);

      expect(mockSmokeModel.findById).toHaveBeenCalledWith(id);
      expect(result).toEqual(mockSmokeDocument);
    });
  });

  describe('Update', () => {
    it('should update smoke and return updated document', async () => {
      const id = 'test-id';
      const smokeDto: SmokeDto = {
        preSmokeId: 'updated-pre-smoke-id',
        status: SmokeStatus.Complete,
      };

      jest
        .spyOn(service, 'GetById')
        .mockResolvedValue(mockSmokeDocument as Smoke);

      const result = await service.Update(id, smokeDto);

      expect(mockSmokeModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: id },
        smokeDto,
      );
      expect(service.GetById).toHaveBeenCalledWith(id);
    });
  });

  describe('getAll', () => {
    it('should return all smokes', async () => {
      const result = await service.getAll();

      expect(mockSmokeModel.find).toHaveBeenCalled();
      expect(result).toEqual([mockSmokeDocument]);
    });
  });

  describe('Delete', () => {
    it('should delete smoke by id', async () => {
      const id = 'test-id';

      const result = await service.Delete(id);

      expect(mockSmokeModel.deleteOne).toHaveBeenCalledWith({ _id: id });
      expect(result).toEqual({ deletedCount: 1 });
    });
  });

  describe('getCurrentSmoke', () => {
    it('should return current smoke based on state', async () => {
      jest
        .spyOn(service, 'GetById')
        .mockResolvedValue(mockSmokeDocument as Smoke);

      const result = await service.getCurrentSmoke();

      expect(mockStateService.GetState).toHaveBeenCalled();
      expect(service.GetById).toHaveBeenCalledWith(mockState.smokeId);
      expect(result).toEqual(mockSmokeDocument);
    });
  });

  describe('FinishSmoke', () => {
    it('should finish current smoke by setting status to Complete', async () => {
      jest
        .spyOn(service, 'getCurrentSmoke')
        .mockResolvedValue(mockSmokeDocument as Smoke);
      jest.spyOn(service, 'Update').mockResolvedValue({
        ...mockSmokeDocument,
        status: SmokeStatus.Complete,
      } as Smoke);

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
      expect(service.Update).toHaveBeenCalledWith('test-smoke-id', expectedDto);
      expect(result.status).toEqual(SmokeStatus.Complete);
    });
  });
});
