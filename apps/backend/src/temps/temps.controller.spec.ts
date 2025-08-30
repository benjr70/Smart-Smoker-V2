import { Test, TestingModule } from '@nestjs/testing';
import { TempsController } from './temps.controller';
import { TempsService } from './temps.service';
import { Temp } from './temps.schema';
import { TempDto } from './tempDto';

describe('TempsController', () => {
  let controller: TempsController;
  let mockTempsService: Partial<TempsService>;

  const mockTemp: Temp = {
    MeatTemp: '150',
    Meat2Temp: '160',
    Meat3Temp: '170',
    ChamberTemp: '225',
    tempsId: 'temps-id',
    date: new Date('2023-01-01'),
  };

  const mockTemps: Temp[] = [mockTemp];

  beforeEach(async () => {
    mockTempsService = {
      saveNewTemp: jest.fn().mockResolvedValue(undefined),
      getAllTempsCurrent: jest.fn().mockResolvedValue(mockTemps),
      getAllTempsById: jest.fn().mockResolvedValue(mockTemps),
      saveTempBatch: jest.fn().mockResolvedValue(mockTemps),
      delete: jest.fn().mockResolvedValue({ deletedCount: 5 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TempsController],
      providers: [
        {
          provide: TempsService,
          useValue: mockTempsService,
        },
      ],
    }).compile();

    controller = module.get<TempsController>(TempsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('saveNewTemp', () => {
    it('should save a new temperature reading', async () => {
      const tempDto: TempDto = {
        MeatTemp: '150',
        Meat2Temp: '160',
        Meat3Temp: '170',
        ChamberTemp: '225',
      };

      const result = await controller.saveNewTemp(tempDto);

      expect(mockTempsService.saveNewTemp).toHaveBeenCalledWith(tempDto);
      expect(result).toBeUndefined();
    });
  });

  describe('getAllTempsCurrent', () => {
    it('should return current temperature readings', async () => {
      const result = await controller.getAllTempsCurrent();

      expect(mockTempsService.getAllTempsCurrent).toHaveBeenCalled();
      expect(result).toEqual(mockTemps);
    });
  });

  describe('getAllTempsById', () => {
    it('should return temperature readings by id', async () => {
      const id = 'temps-id';

      const result = await controller.getAllTempsById(id);

      expect(mockTempsService.getAllTempsById).toHaveBeenCalledWith(id);
      expect(result).toEqual(mockTemps);
    });
  });

  describe('saveTempBatch', () => {
    it('should save multiple temperature readings', async () => {
      const tempDtos: TempDto[] = [
        {
          MeatTemp: '150',
          Meat2Temp: '160',
          Meat3Temp: '170',
          ChamberTemp: '225',
        },
        {
          MeatTemp: '155',
          Meat2Temp: '165',
          Meat3Temp: '175',
          ChamberTemp: '230',
        },
      ];

      const result = await controller.saveTempBatch(tempDtos);

      expect(mockTempsService.saveTempBatch).toHaveBeenCalledWith(tempDtos);
      expect(result).toEqual(mockTemps);
    });
  });

  describe('DeleteById', () => {
    it('should delete temperature readings by id', async () => {
      const id = 'temps-id';

      const result = await controller.DeleteById(id);

      expect(mockTempsService.delete).toHaveBeenCalledWith(id);
      expect(result).toEqual({ deletedCount: 5 });
    });
  });
});
