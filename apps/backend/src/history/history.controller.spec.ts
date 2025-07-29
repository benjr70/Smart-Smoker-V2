import { Test, TestingModule } from '@nestjs/testing';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
import { SmokeHistory } from './histroyDto';

describe('HistoryController', () => {
  let controller: HistoryController;
  let mockHistoryService: Partial<HistoryService>;

  const mockSmokeHistory: SmokeHistory = {
    name: 'Brisket Cook',
    meatType: 'beef',
    date: 'Sun Jan 01 2023',
    weight: '5.5',
    weightUnit: 'lbs',
    woodType: 'hickory',
    smokeId: 'smoke-id',
    overAllRating: '9',
  };

  beforeEach(async () => {
    mockHistoryService = {
      getHistory: jest.fn().mockResolvedValue([mockSmokeHistory]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HistoryController],
      providers: [
        {
          provide: HistoryService,
          useValue: mockHistoryService,
        },
      ],
    }).compile();

    controller = module.get<HistoryController>(HistoryController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getHistory', () => {
    it('should return smoke history', async () => {
      const result = await controller.getHistory();

      expect(mockHistoryService.getHistory).toHaveBeenCalled();
      expect(result).toEqual([mockSmokeHistory]);
    });
  });
});