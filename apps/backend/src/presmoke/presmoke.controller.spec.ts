import { Test, TestingModule } from '@nestjs/testing';
import { PreSmokeController } from './presmoke.controller';
import { PreSmokeService } from './presmoke.service';
import { PreSmoke } from './presmoke.schema';
import { PreSmokeDto } from './presmokeDto';

describe('PreSmokeController', () => {
  let controller: PreSmokeController;
  let mockPreSmokeService: Partial<PreSmokeService>;

  const mockWeight = {
    unit: 'lbs',
    weight: 5.5,
  };

  const mockPreSmoke: PreSmoke = {
    name: 'Brisket Prep',
    meatType: 'beef',
    weight: mockWeight,
    steps: ['Season with rub', 'Let rest overnight'],
    notes: 'High quality meat',
  };

  const mockPreSmokes: PreSmoke[] = [mockPreSmoke];

  beforeEach(async () => {
    mockPreSmokeService = {
      findAll: jest.fn().mockResolvedValue(mockPreSmokes),
      GetByID: jest.fn().mockResolvedValue(mockPreSmoke),
      save: jest.fn().mockResolvedValue(mockPreSmoke),
      Update: jest.fn().mockResolvedValue(mockPreSmoke),
      GetByCurrent: jest.fn().mockResolvedValue(mockPreSmoke),
      Delete: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PreSmokeController],
      providers: [
        {
          provide: PreSmokeService,
          useValue: mockPreSmokeService,
        },
      ],
    }).compile();

    controller = module.get<PreSmokeController>(PreSmokeController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPreSmoke', () => {
    it('should return all pre-smoke records', async () => {
      const result = await controller.getPreSmoke();

      expect(mockPreSmokeService.findAll).toHaveBeenCalled();
      expect(result).toEqual(mockPreSmokes);
    });
  });

  describe('getPreSmokeById', () => {
    it('should return pre-smoke by id', async () => {
      const id = 'test-id';

      const result = await controller.getPreSmokeById(id);

      expect(mockPreSmokeService.GetByID).toHaveBeenCalledWith(id);
      expect(result).toEqual(mockPreSmoke);
    });
  });

  describe('SavePreSmoke', () => {
    it('should save a pre-smoke record', async () => {
      const preSmokeDto: PreSmokeDto = {
        name: 'Test Prep',
        meatType: 'pork',
        weight: mockWeight,
        steps: ['Step 1', 'Step 2'],
        notes: 'Test notes',
      };

      const result = await controller.SavePreSmoke(preSmokeDto);

      expect(mockPreSmokeService.save).toHaveBeenCalledWith(preSmokeDto);
      expect(result).toEqual(mockPreSmoke);
    });
  });

  describe('updatePreSmoke', () => {
    it('should update a pre-smoke record', async () => {
      const id = 'test-id';
      const preSmokeDto: PreSmokeDto = {
        name: 'Updated Prep',
        meatType: 'beef',
        weight: mockWeight,
        steps: ['Updated step'],
        notes: 'Updated notes',
      };

      const result = await controller.updatePreSmoke(id, preSmokeDto);

      expect(mockPreSmokeService.Update).toHaveBeenCalledWith(id, preSmokeDto);
      expect(result).toEqual(mockPreSmoke);
    });
  });

  describe('getById', () => {
    it('should return current pre-smoke', async () => {
      const result = await controller.getById();

      expect(mockPreSmokeService.GetByCurrent).toHaveBeenCalled();
      expect(result).toEqual(mockPreSmoke);
    });
  });

  describe('DeleteById', () => {
    it('should delete pre-smoke by id', async () => {
      const id = 'test-id';

      const result = await controller.DeleteById(id);

      expect(mockPreSmokeService.Delete).toHaveBeenCalledWith(id);
      expect(result).toEqual({ deletedCount: 1 });
    });
  });
});
