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
      getByIdOrThrow: jest.fn().mockResolvedValue(mockSmoke),
      delete: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      deleteDeep: jest.fn().mockResolvedValue({ deletedCount: 1 }),
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
    it('should return smoke by id via getByIdOrThrow', async () => {
      const id = 'test-id';

      const result = await controller.getById(id);

      expect(mockSmokeService.getByIdOrThrow).toHaveBeenCalledWith(id);
      expect(result).toEqual(mockSmoke);
    });
  });

  describe('DeleteById', () => {
    it('deletes the smoke and everything recorded about it', async () => {
      const id = 'test-id';

      const result = await controller.DeleteById(id);

      expect(mockSmokeService.deleteDeep).toHaveBeenCalledWith(id);
      // The shallow single-document delete would leave the children orphaned.
      expect(mockSmokeService.delete).not.toHaveBeenCalled();
      expect(result).toEqual({ deletedCount: 1 });
    });
  });

  describe('SaveServePlan', () => {
    it('writes the plan against the cook in progress', async () => {
      const serveAt = new Date('2026-08-30T18:00:00.000Z');
      const planned = { ...mockSmoke, serveAt, restMinutes: 45 };
      mockSmokeService.updateServePlan = jest.fn().mockResolvedValue(planned);

      const result = await controller.SaveServePlan({
        serveAt,
        restMinutes: 45,
      });

      expect(mockSmokeService.updateServePlan).toHaveBeenCalledWith({
        serveAt,
        restMinutes: 45,
      });
      expect(result).toEqual(planned);
    });

    /**
     * Nothing is cooking, so there is no cook to plan. A 404 would say the
     * route does not exist; the answer is that the session does not.
     */
    it('answers nothing when no cook is in progress', async () => {
      mockSmokeService.updateServePlan = jest.fn().mockResolvedValue(null);

      expect(await controller.SaveServePlan({ restMinutes: 45 })).toBeNull();
    });
  });

  describe('StampPull', () => {
    it('stamps the pull of the cook in progress and answers the cook', async () => {
      const pulled = {
        ...mockSmoke,
        pullAt: new Date('2026-08-30T17:00:00.000Z'),
        pullTemp: 203,
      };
      mockSmokeService.stampPull = jest.fn().mockResolvedValue(pulled);

      expect(await controller.StampPull()).toEqual(pulled);
      expect(mockSmokeService.stampPull).toHaveBeenCalled();
    });

    it('answers nothing when no cook is in progress', async () => {
      mockSmokeService.stampPull = jest.fn().mockResolvedValue(null);

      expect(await controller.StampPull()).toBeNull();
    });
  });

  describe('getCurrent', () => {
    it('answers the cook the session names', async () => {
      mockSmokeService.getCurrentSmoke = jest.fn().mockResolvedValue(mockSmoke);

      expect(await controller.getCurrent()).toEqual(mockSmoke);
    });

    /**
     * Answered rather than refused: a screen opened with no session set up is
     * an ordinary state of this app, not a request that went wrong — and the
     * by-id route below must not be the one that answers "current".
     */
    it('answers nothing when no cook is set up', async () => {
      mockSmokeService.getCurrentSmoke = jest.fn().mockResolvedValue(null);

      expect(await controller.getCurrent()).toBeNull();
      expect(mockSmokeService.getByIdOrThrow).not.toHaveBeenCalled();
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
