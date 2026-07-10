import { Test, TestingModule } from '@nestjs/testing';
import { PostSmokeController } from './postSmoke.controller';
import { PostSmokeService } from './postSmoke.service';
import { PostSmoke } from './postSmoke.schema';
import { PostSmokeDto } from './postSmokeDto';

describe('PostSmokeController', () => {
  let controller: PostSmokeController;
  let mockPostSmokeService: Partial<PostSmokeService>;

  const mockPostSmoke: PostSmoke = {
    restTime: '30 minutes',
    steps: ['Wrap in foil', 'Let rest'],
    notes: 'Great results',
  };

  beforeEach(async () => {
    mockPostSmokeService = {
      getCurrentPostSmoke: jest.fn().mockResolvedValue(mockPostSmoke),
      saveCurrentPostSmoke: jest.fn().mockResolvedValue(mockPostSmoke),
      getByIdOrThrow: jest.fn().mockResolvedValue(mockPostSmoke),
      delete: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostSmokeController],
      providers: [
        {
          provide: PostSmokeService,
          useValue: mockPostSmokeService,
        },
      ],
    }).compile();

    controller = module.get<PostSmokeController>(PostSmokeController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getCurrentPostSmoke', () => {
    it('should return current post-smoke', async () => {
      const result = await controller.getCurrentPostSmoke();

      expect(mockPostSmokeService.getCurrentPostSmoke).toHaveBeenCalled();
      expect(result).toEqual(mockPostSmoke);
    });
  });

  describe('saveCurrentPostSmoke', () => {
    it('should save current post-smoke', async () => {
      const postSmokeDto: PostSmokeDto = {
        restTime: '45 minutes',
        steps: ['Cool', 'Slice'],
        notes: 'Perfect results',
      };

      const result = await controller.saveCurrentPostSmoke(postSmokeDto);

      expect(mockPostSmokeService.saveCurrentPostSmoke).toHaveBeenCalledWith(
        postSmokeDto,
      );
      expect(result).toEqual(mockPostSmoke);
    });
  });

  describe('getById', () => {
    it('should return post-smoke by id via getByIdOrThrow', async () => {
      const id = '507f1f77bcf86cd799439011';

      const result = await controller.getById(id);

      expect(mockPostSmokeService.getByIdOrThrow).toHaveBeenCalledWith(id);
      expect(result).toEqual(mockPostSmoke);
    });
  });

  describe('DeleteById', () => {
    it('should delete post-smoke by id', async () => {
      const id = '507f1f77bcf86cd799439011';

      const result = await controller.DeleteById(id);

      expect(mockPostSmokeService.delete).toHaveBeenCalledWith(id);
      expect(result).toEqual({ deletedCount: 1 });
    });
  });
});
