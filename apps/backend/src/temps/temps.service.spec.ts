import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CLOCK_SKEW_TOLERANCE_MS, TempsService } from './temps.service';
import { tempSeriesFilter } from './temp-series.filter';
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

/**
 * A `find` stub that really applies the filter it is handed the way the store
 * would — date bounds, `$or` branches and the missing-field semantics of
 * `{ date: null }` included — so "the strays are gone" and "the undated rows
 * survived" are facts about the query the service builds rather than about the
 * rows the stub was seeded with.
 */
const matches = (row: Temp, filter: any): boolean =>
  Object.entries(filter ?? {}).every(([field, condition]: [string, any]) => {
    if (field === '$or') {
      return condition.some((branch: any) => matches(row, branch));
    }
    if (field !== 'date') {
      return true;
    }
    if (condition === null) {
      return row.date === null || row.date === undefined;
    }
    const at = new Date(row.date).getTime();
    if (Number.isNaN(at)) {
      // A row with no date is outside every range, as it is in the store.
      return false;
    }
    if (
      condition.$gte !== undefined &&
      at < new Date(condition.$gte).getTime()
    ) {
      return false;
    }
    if (
      condition.$lte !== undefined &&
      at > new Date(condition.$lte).getTime()
    ) {
      return false;
    }
    return true;
  });

const filteringFind = (seed: Temp[]) =>
  jest
    .fn()
    .mockImplementation((filter: any) =>
      orderedQuery(seed.filter((row) => matches(row, filter))),
    );

describe('TempsService', () => {
  let service: TempsService;
  let model: any;
  let smokeModel: any;
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

    smokeModel = {
      findOne: jest.fn().mockImplementation(() => query(null)),
    };

    currentSmoke = {
      readCurrent: jest.fn(),
      upsertCurrent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TempsService,
        { provide: getModelToken('Temp'), useValue: model },
        { provide: getModelToken('Smoke'), useValue: smokeModel },
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

  describe('getAllTempsById clipped to the cook window', () => {
    const polluted: Temp[] = [
      { ...mockTempRows[0], date: new Date('2026-08-20T09:00:00Z') },
      { ...mockTempRows[0], date: new Date('2026-08-20T12:00:00Z') },
      // Weeks of silence, then the box is powered on again and the readings
      // land in the cook nobody ended.
      { ...mockTempRows[0], date: new Date('2026-09-04T18:00:00Z') },
    ];

    beforeEach(() => {
      model.find = filteringFind(polluted);
    });

    it('leaves out the readings taken outside a stamped cook', async () => {
      smokeModel.findOne.mockImplementation(() =>
        query({
          tempsId: 'some-group',
          startedAt: new Date('2026-08-20T08:00:00Z'),
          finishedAt: new Date('2026-08-20T13:00:00Z'),
        }),
      );

      const result = await service.getAllTempsById('some-group');

      expect(result.map((temp) => temp.date)).toEqual([
        new Date('2026-08-20T09:00:00Z'),
        new Date('2026-08-20T12:00:00Z'),
      ]);
    });

    /**
     * The start stamp is not a bound. A cook is stamped as started when its
     * smoking flag is first switched on, and a stamp whose write failed is
     * deferred to the next toggle — hours into a cook that has been recording
     * all along. Nothing can be recorded before a cook starts (readings are
     * stored only while smoking is on), so there is nothing for a lower bound
     * to exclude and everything for a late one to lose.
     */
    it('keeps the whole series of a cook that has only started', async () => {
      smokeModel.findOne.mockImplementation(() =>
        query({
          tempsId: 'some-group',
          startedAt: new Date('2026-08-20T10:00:00Z'),
        }),
      );

      const result = await service.getAllTempsById('some-group');

      expect(result).toHaveLength(polluted.length);
    });

    /**
     * The finish may be stamped by the server's clock (the End Smoke wizard)
     * while the readings carry the smoker's, and the two are not the same
     * clock. A reading a little past the finish is the tail of the cook read
     * by a watch that runs fast, not a stray weeks later.
     */
    it('keeps readings dated just past the finish by a fast device clock', async () => {
      const finishedAt = new Date('2026-08-20T12:00:00Z');
      model.find = filteringFind([
        ...polluted,
        {
          ...mockTempRows[0],
          date: new Date(finishedAt.getTime() + CLOCK_SKEW_TOLERANCE_MS / 2),
        },
      ]);
      smokeModel.findOne.mockImplementation(() =>
        query({ tempsId: 'some-group', finishedAt }),
      );

      const result = await service.getAllTempsById('some-group');

      expect(result.map((temp) => temp.date)).toEqual([
        new Date('2026-08-20T09:00:00Z'),
        finishedAt,
        new Date(finishedAt.getTime() + CLOCK_SKEW_TOLERANCE_MS / 2),
      ]);
    });

    /**
     * A device whose clock is wrong by more than any tolerance would otherwise
     * have every one of its readings fall outside the window, and the chart
     * would draw nothing at all. A series that cannot be clipped sensibly is
     * better shown whole than not shown.
     */
    it('answers with the whole series rather than nothing when every reading falls outside', async () => {
      smokeModel.findOne.mockImplementation(() =>
        query({
          tempsId: 'some-group',
          finishedAt: new Date('2020-01-01T00:00:00Z'),
        }),
      );

      const result = await service.getAllTempsById('some-group');

      expect(result).toHaveLength(polluted.length);
    });

    /**
     * The archive holds readings stored without a date. They cannot be placed
     * inside or outside the window, and a range predicate answers "outside" for
     * every one of them — which would empty the chart of a legacy cook the
     * moment something stamped a finish on it.
     */
    it('keeps the readings that were stored without a date', async () => {
      const undated = { ...mockTempRows[0], date: undefined as any };
      model.find = filteringFind([...polluted, undated]);
      smokeModel.findOne.mockImplementation(() =>
        query({
          tempsId: 'some-group',
          finishedAt: new Date('2026-08-20T13:00:00Z'),
        }),
      );

      const result = await service.getAllTempsById('some-group');

      expect(result).toContain(undated);
      expect(result).not.toContainEqual(
        expect.objectContaining({ date: new Date('2026-09-04T18:00:00Z') }),
      );
    });

    /**
     * The strays are hidden, not destroyed: reading a cook back must never
     * change what the collection holds, so a mis-stamped cook loses nothing.
     */
    it('never removes or rewrites the readings it clips away', async () => {
      model.updateMany = jest.fn();
      smokeModel.findOne.mockImplementation(() =>
        query({
          tempsId: 'some-group',
          startedAt: new Date('2026-08-20T08:00:00Z'),
          finishedAt: new Date('2026-08-20T13:00:00Z'),
        }),
      );

      await service.getAllTempsById('some-group');

      expect(model.deleteMany).not.toHaveBeenCalled();
      expect(model.updateMany).not.toHaveBeenCalled();
    });

    /**
     * Every cook recorded before the stamps existed has none, and there is no
     * way to tell which of its readings belong to it — so it reads back whole,
     * exactly as it always did.
     */
    it('answers with the whole series when the cook carries no stamps', async () => {
      smokeModel.findOne.mockImplementation(() =>
        query({ tempsId: 'some-group' }),
      );

      const result = await service.getAllTempsById('some-group');

      expect(model.find).toHaveBeenCalledWith({ tempsId: 'some-group' });
      expect(result).toHaveLength(polluted.length);
    });
  });

  describe('delete', () => {
    it('removes every row in a tempsId group', async () => {
      const result = await service.delete('group-to-drop');

      expect(model.deleteMany).toHaveBeenCalledWith(
        tempSeriesFilter('group-to-drop'),
      );
      expect(result).toEqual({ deletedCount: 5 });
    });

    /**
     * The series is named after its own first reading, and that reading carries
     * no `tempsId` — so a delete that matched the id alone would leave it
     * behind, one orphan per cook, forever.
     */
    it('removes the first reading, which the series is named after', async () => {
      const seriesId = new Types.ObjectId().toString();

      await service.delete(seriesId);

      const filter = model.deleteMany.mock.calls[0][0];
      expect(filter).toEqual({
        $or: [{ tempsId: seriesId }, { _id: seriesId }],
      });
    });

    it('matches on tempsId alone when the series id is not an object id', async () => {
      await service.delete('legacy-series');

      expect(model.deleteMany).toHaveBeenCalledWith({
        tempsId: 'legacy-series',
      });
    });
  });
});
