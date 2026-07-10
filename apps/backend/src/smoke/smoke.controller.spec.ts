import { Test, TestingModule } from '@nestjs/testing';
import { SmokeController } from './smoke.controller';
import { SmokeService } from './smoke.service';
import { Smoke, SmokeStatus } from './smoke.schema';
import { SmokeDto } from './smokeDto';

describe('SmokeController', () => {
  let controller: SmokeController;
  let mockSmokeService: Partial<SmokeService>;

  const mockSmoke: Smoke = {
    preSmokeId: 'pre-smoke-id',
    tempsId: 'temps-id',
    postSmokeId: 'post-smoke-id',
    smokeProfileId: 'profile-id',
    ratingId: 'rating-id',
    date: new Date('2023-01-01'),
    status: SmokeStatus.InProgress,
  };

  const mockSmokes: Smoke[] = [mockSmoke];

  beforeEach(async () => {
    mockSmokeService = {
      create: jest.fn().mockResolvedValue(mockSmoke),
      getAll: jest.fn().mockResolvedValue(mockSmokes),
      FinishSmoke: jest
        .fn()
        .mockResolvedValue({ ...mockSmoke, status: SmokeStatus.Complete }),
      getById: jest.fn().mockResolvedValue(mockSmoke),
      delete: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SmokeController],
      providers: [
        {
          provide: SmokeService,
          useValue: mockSmokeService,
        },
      ],
    }).compile();

    controller = module.get<SmokeController>(SmokeController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAllSmoke', () => {
    it('should return all smokes', async () => {
      const result = await controller.getAllSmoke();

      expect(mockSmokeService.getAll).toHaveBeenCalled();
      expect(result).toEqual(mockSmokes);
    });
  });

  describe('FinishSmoke', () => {
    it('should finish the current smoke', async () => {
      const result = await controller.FinishSmoke();

      expect(mockSmokeService.FinishSmoke).toHaveBeenCalled();
      expect(result).toEqual({ ...mockSmoke, status: SmokeStatus.Complete });
    });
  });

  describe('getById', () => {
    it('should return smoke by id', async () => {
      const id = 'test-id';

      const result = await controller.getById(id);

      expect(mockSmokeService.getById).toHaveBeenCalledWith(id);
      expect(result).toEqual(mockSmoke);
    });
  });

  describe('DeleteById', () => {
    it('should delete smoke by id', async () => {
      const id = 'test-id';

      const result = await controller.DeleteById(id);

      expect(mockSmokeService.delete).toHaveBeenCalledWith(id);
      expect(result).toEqual({ deletedCount: 1 });
    });
  });

  describe('CreateSmoke', () => {
    it('should persist a new smoke via the service (no self-recursion)', async () => {
      const smokeDto: SmokeDto = {
        preSmokeId: 'pre-smoke-id',
        status: SmokeStatus.InProgress,
      };

      const result = await controller.CreateSmoke(smokeDto);

      expect(mockSmokeService.create).toHaveBeenCalledWith(smokeDto);
      expect(result).toEqual(mockSmoke);
    });
  });
});
