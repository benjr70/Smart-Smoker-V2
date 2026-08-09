import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { TempsService } from './temps.service';
import { Temp } from './temps.schema';
import { TempDto } from './tempDto';
import { CurrentSmokeService } from '../common/current-smoke.service';

const query = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

/**
 * A query stub that really orders and truncates, so the order a caller gets is
 * a fact about the query the service builds and not about the order the stub
 * happened to be seeded in — which is exactly the distinction that let readings
 * reach the chart newest-first.
 */
const orderedQuery = (seed: Temp[]) => {
  let rows = [...seed];
  const chain: any = {
    sort: (order: Record<string, number>) => {
      const [[field, direction]] = Object.entries(order);
      rows = [...rows].sort(
        (a, b) =>
          (new Date(a[field]).getTime() - new Date(b[field]).getTime()) *
          direction,
      );
      return chain;
    },
    limit: (count: number) => {
      rows = rows.slice(0, count);
      return chain;
    },
    exec: () => Promise.resolve(rows),
  };
  return chain;
};

describe('TempsService', () => {
  let service: TempsService;
  let model: any;
  let currentSmoke: {
    readCurrent: jest.Mock;
    upsertCurrent: jest.Mock;
  };

  const tempDto: TempDto = {
    MeatTemp: '150',
    Meat2Temp: '160',
    Meat3Temp: '170',
    ChamberTemp: '225',
  };

  const mockTempRows: Temp[] = [
    {
      MeatTemp: '150',
      Meat2Temp: '160',
      Meat3Temp: '170',
      ChamberTemp: '225',
      tempsId: 'temps-group-1',
      date: new Date('2023-01-01'),
    },
  ];

  beforeEach(async () => {
    model = jest.fn().mockImplementation((doc) => ({
      ...doc,
      save: jest.fn().mockResolvedValue({ ...doc, _id: 'new-temp-id' }),
    }));
    model.find = jest.fn().mockImplementation(() => orderedQuery(mockTempRows));
    model.insertMany = jest.fn().mockResolvedValue(mockTempRows);
    model.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 5 });

    currentSmoke = {
      readCurrent: jest.fn(),
      upsertCurrent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TempsService,
        { provide: getModelToken('Temp'), useValue: model },
        { provide: CurrentSmokeService, useValue: currentSmoke },
      ],
    }).compile();

    service = module.get<TempsService>(TempsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('saveNewTemp', () => {
    it('appends a temp row under the smoke tempsId group when one exists', async () => {
      currentSmoke.upsertCurrent.mockImplementation((key, handlers) =>
        handlers.update('temps-group-1'),
      );

      const result = await service.saveNewTemp(tempDto);

      expect(currentSmoke.upsertCurrent).toHaveBeenCalledWith(
        'tempsId',
        expect.any(Object),
      );
      // The row is tagged with the existing group id, then persisted.
      expect(model).toHaveBeenCalledWith(
        expect.objectContaining({ tempsId: 'temps-group-1' }),
      );
      expect(result).toMatchObject({ _id: 'new-temp-id' });
    });

    it('creates the first temp row and reports its id as the new tempsId group', async () => {
      let linkedChildId: string | undefined;
      currentSmoke.upsertCurrent.mockImplementation(async (key, handlers) => {
        const created = await handlers.create();
        linkedChildId = created.childId;
        return created.result;
      });

      const result = await service.saveNewTemp(tempDto);

      expect(model).toHaveBeenCalledWith(tempDto);
      expect(linkedChildId).toBe('new-temp-id');
      expect(result).toMatchObject({ _id: 'new-temp-id' });
    });

    it('propagates the 404 when there is no active smoke', async () => {
      currentSmoke.upsertCurrent.mockRejectedValue(new NotFoundException());

      await expect(service.saveNewTemp(tempDto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('preserves the smoke sibling FK links via upsertCurrent link-back', async () => {
      // The FK-preservation contract is owned by CurrentSmokeService.upsertCurrent
      // (covered in its own spec). TempsService must delegate the link-back to it
      // rather than hand-rolling a partial SmokeDto that drops postSmokeId /
      // smokeProfileId / ratingId (the bug this fan-out fixes).
      currentSmoke.upsertCurrent.mockImplementation(async (key, handlers) => {
        const created = await handlers.create();
        return created.result;
      });

      await service.saveNewTemp(tempDto);

      // No direct Smoke write path in the service anymore — link-back is delegated.
      expect(currentSmoke.upsertCurrent).toHaveBeenCalledWith(
        'tempsId',
        expect.objectContaining({
          update: expect.any(Function),
          create: expect.any(Function),
        }),
      );
    });
  });

  describe('getAllTempsCurrent', () => {
    it('loads the temp rows for the current smoke tempsId group', async () => {
      currentSmoke.readCurrent.mockImplementation((key, load) =>
        load('temps-group-1'),
      );

      const result = await service.getAllTempsCurrent();

      expect(currentSmoke.readCurrent).toHaveBeenCalledWith(
        'tempsId',
        expect.any(Function),
        [],
      );
      expect(model.find).toHaveBeenCalledWith({ tempsId: 'temps-group-1' });
      expect(result).toEqual(mockTempRows);
    });

    /**
     * The series is a cook, and a cook has a direction. Unordered, Mongo answers
     * in whatever order the storage engine finds the rows in — in practice
     * newest-first, because that is the order of the index the series is read
     * through — and a chart handed a backwards cook draws its time axis
     * backwards and its lines outside the plot.
     */
    it('answers with the readings in the order they were taken', async () => {
      const outOfOrder: Temp[] = [
        { ...mockTempRows[0], date: new Date('2026-08-02T13:15:21Z') },
        { ...mockTempRows[0], date: new Date('2026-08-02T13:14:00Z') },
        { ...mockTempRows[0], date: new Date('2026-08-02T13:12:40Z') },
      ];
      model.find = jest.fn().mockImplementation(() => orderedQuery(outOfOrder));
      currentSmoke.readCurrent.mockImplementation((key, load) =>
        load('temps-group-1'),
      );

      const result = await service.getAllTempsCurrent();

      expect(result.map((temp) => temp.date)).toEqual([
        new Date('2026-08-02T13:12:40Z'),
        new Date('2026-08-02T13:14:00Z'),
        new Date('2026-08-02T13:15:21Z'),
      ]);
    });

    it('returns an empty array when nothing is active (fallback)', async () => {
      currentSmoke.readCurrent.mockImplementation(
        (key, load, fallback) => fallback,
      );

      const result = await service.getAllTempsCurrent();

      expect(result).toEqual([]);
      expect(model.find).not.toHaveBeenCalled();
    });
  });

  describe('getLatestCurrentTemp', () => {
    // Whoever is watching the cook (today: alert evaluation, on its own
    // interval) needs the reading the smoker took most recently, not the series.
    const series: Temp[] = [
      {
        ...mockTempRows[0],
        ChamberTemp: '210',
        date: new Date('2026-08-02T10:00:00Z'),
      },
      {
        ...mockTempRows[0],
        ChamberTemp: '250',
        date: new Date('2026-08-02T12:00:00Z'),
      },
      {
        ...mockTempRows[0],
        ChamberTemp: '230',
        date: new Date('2026-08-02T11:00:00Z'),
      },
    ];

    beforeEach(() => {
      // A query object that really orders and truncates, so "the newest row" is
      // a fact about the service's query and not about the stub's seeding order.
      model.find = jest.fn().mockImplementation(() => orderedQuery(series));
    });

    it('returns the most recent reading of the current smoke', async () => {
      currentSmoke.readCurrent.mockImplementation((key, load) =>
        load('temps-group-1'),
      );

      const result = await service.getLatestCurrentTemp();

      expect(result?.ChamberTemp).toBe('250');
    });

    it('returns nothing when no smoke is active', async () => {
      currentSmoke.readCurrent.mockImplementation(
        (key, load, fallback) => fallback,
      );

      expect(await service.getLatestCurrentTemp()).toBeUndefined();
    });
  });

  describe('GetTempID', () => {
    it('returns the current smoke tempsId group', async () => {
      currentSmoke.readCurrent.mockImplementation((key, load) =>
        load('temps-group-1'),
      );

      const result = await service.GetTempID();

      expect(currentSmoke.readCurrent).toHaveBeenCalledWith(
        'tempsId',
        expect.any(Function),
        undefined,
      );
      expect(result).toBe('temps-group-1');
    });

    it('returns undefined when nothing is active (fallback)', async () => {
      currentSmoke.readCurrent.mockImplementation(
        (key, load, fallback) => fallback,
      );

      const result = await service.GetTempID();

      expect(result).toBeUndefined();
    });
  });

  describe('saveTempBatch', () => {
    it('tags every row with the current tempsId group and bulk-inserts', async () => {
      jest.spyOn(service, 'GetTempID').mockResolvedValue('batch-group');

      await service.saveTempBatch([{ ...tempDto }, { ...tempDto }]);

      expect(model.insertMany).toHaveBeenCalledWith([
        expect.objectContaining({ tempsId: 'batch-group' }),
        expect.objectContaining({ tempsId: 'batch-group' }),
      ]);
    });

    it('does not insert when there is no active tempsId group', async () => {
      jest.spyOn(service, 'GetTempID').mockResolvedValue(undefined);

      const result = await service.saveTempBatch([{ ...tempDto }]);

      expect(result).toBeUndefined();
      expect(model.insertMany).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('persists a new temp document', async () => {
      const result = await service.create(tempDto);

      expect(model).toHaveBeenCalledWith(tempDto);
      expect(result).toMatchObject({ _id: 'new-temp-id' });
    });
  });

  describe('getAllTempsById', () => {
    it('returns rows for an explicit tempsId', async () => {
      const result = await service.getAllTempsById('some-group');

      expect(model.find).toHaveBeenCalledWith({ tempsId: 'some-group' });
      expect(result).toEqual(mockTempRows);
    });

    /**
     * A stored cook is read back for the History review card, which plots it —
     * so the rows have to come back in the order they were taken rather than in
     * the order the index happens to hold them.
     */
    it('answers with the readings in the order they were taken', async () => {
      const outOfOrder: Temp[] = [
        { ...mockTempRows[0], date: new Date('2026-08-02T13:15:21Z') },
        { ...mockTempRows[0], date: new Date('2026-08-02T13:14:00Z') },
        { ...mockTempRows[0], date: new Date('2026-08-02T13:12:40Z') },
      ];
      model.find = jest.fn().mockImplementation(() => orderedQuery(outOfOrder));

      const result = await service.getAllTempsById('some-group');

      expect(result.map((temp) => temp.date)).toEqual([
        new Date('2026-08-02T13:12:40Z'),
        new Date('2026-08-02T13:14:00Z'),
        new Date('2026-08-02T13:15:21Z'),
      ]);
    });
  });

  describe('delete', () => {
    it('removes every row in a tempsId group', async () => {
      const result = await service.delete('group-to-drop');

      expect(model.deleteMany).toHaveBeenCalledWith({
        tempsId: 'group-to-drop',
      });
      expect(result).toEqual({ deletedCount: 5 });
    });
  });
});
