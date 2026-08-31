import { Test, TestingModule } from '@nestjs/testing';
import { TempsController } from './temps.controller';
import { TempsService } from './temps.service';
import { Temp } from './temps.schema';
import { TempDto } from './tempDto';
import { TempSample } from './temp-series';

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

  const mockSeries: TempSample[] = [
    {
      date: new Date('2023-01-01').toISOString(),
      chamberTemp: 225,
      probe1Temp: 150,
      probe2Temp: 160,
      probe3Temp: 170,
    },
  ];

  beforeEach(async () => {
    mockTempsService = {
      getSeriesById: jest.fn().mockResolvedValue(mockSeries),
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

  describe('getSeriesById', () => {
    it('asks for the series of the cook named in the path', async () => {
      const result = await controller.getSeriesById('temps-id', {});

      expect(mockTempsService.getSeriesById).toHaveBeenCalledWith(
        'temps-id',
        undefined,
      );
      expect(result).toEqual(mockSeries);
    });

    /**
     * The size is the caller's to choose — a phone comparing two cooks side by
     * side wants fewer points than a full-screen chart does.
     */
    /**
     * A cook nobody recorded is an empty chart, whatever the id looked like:
     * this route takes the id as it comes rather than refusing one that is not
     * object-id shaped, so a client walking a list of cooks draws the same
     * nothing for a legacy or malformed tempsId as for an unknown one.
     */
    it('asks for a series under an id that is not object-id shaped', async () => {
      mockTempsService.getSeriesById = jest.fn().mockResolvedValue([]);

      const result = await controller.getSeriesById('legacy-series', {});

      expect(mockTempsService.getSeriesById).toHaveBeenCalledWith(
        'legacy-series',
        undefined,
      );
      expect(result).toEqual([]);
    });

    it('passes on the size the caller asked for', async () => {
      await controller.getSeriesById('temps-id', { points: 50 });

      expect(mockTempsService.getSeriesById).toHaveBeenCalledWith(
        'temps-id',
        50,
      );
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
