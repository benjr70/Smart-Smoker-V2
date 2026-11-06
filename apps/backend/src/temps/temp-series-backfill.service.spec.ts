import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { TempSeriesBackfillService } from './temp-series-backfill.service';

const lean = <T>(value: T) => ({
  select: () => ({ lean: () => ({ exec: () => Promise.resolve(value) }) }),
});

/** A stored cook, as the peak stamps leave one. */
interface StoredCook {
  [field: string]: unknown;
  tempsId: string;
  peakChamber?: number;
  peakChamberScanned?: boolean;
}

/**
 * The cooks, with just enough of a store around them to answer the one write
 * the repair makes of them: match a set of series ids, drop the named fields.
 *
 * A fake that *applies* the write rather than a spy that records it, so the
 * test says which cooks end up unstamped instead of repeating the filter the
 * implementation builds.
 */
const cookStore = (cooks: StoredCook[]) => ({
  cooks,
  updateMany: jest.fn().mockImplementation((filter: any, update: any) => {
    const wanted: string[] = filter?.tempsId?.$in ?? [];
    const dropped = Object.keys(update?.$unset ?? {});
    const hit = cooks.filter((cook) => wanted.includes(cook.tempsId));
    hit.forEach((cook) => {
      dropped.forEach((field) => delete cook[field]);
    });
    return { exec: () => Promise.resolve({ modifiedCount: hit.length }) };
  }),
});

describe('TempSeriesBackfillService', () => {
  let service: TempSeriesBackfillService;
  let model: any;
  let smokes: ReturnType<typeof cookStore>;

  const orphan = () => ({ _id: new Types.ObjectId() });

  beforeEach(async () => {
    model = {
      find: jest.fn().mockImplementation(() => lean([])),
      bulkWrite: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    };
    smokes = cookStore([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TempSeriesBackfillService,
        { provide: getModelToken('Temp'), useValue: model },
        { provide: getModelToken('Smoke'), useValue: smokes },
      ],
    }).compile();

    service = module.get(TempSeriesBackfillService);
  });

  describe('stampOrphanHeads', () => {
    /**
     * A reading stored without a series id is a cook's first one: the only
     * write that ever omitted the id was the one that opened a series, and the
     * id it should carry is the one the cook already links — its own.
     */
    it('stamps a reading that names a series but never carried it', async () => {
      const head = orphan();
      model.find.mockImplementation(() => lean([head]));
      model.bulkWrite.mockResolvedValue({ modifiedCount: 1 });

      const stamped = await service.stampOrphanHeads();

      expect(model.bulkWrite).toHaveBeenCalledWith([
        {
          updateOne: {
            filter: { _id: head._id },
            update: { $set: { tempsId: head._id.toString() } },
          },
        },
      ]);
      expect(stamped).toBe(1);
    });

    /** One orphan per cook, and each one belongs to its own cook. */
    it('gives each orphan its own id rather than one another', async () => {
      const heads = [orphan(), orphan(), orphan()];
      model.find.mockImplementation(() => lean(heads));
      model.bulkWrite.mockResolvedValue({ modifiedCount: 3 });

      await service.stampOrphanHeads();

      const [writes] = model.bulkWrite.mock.calls[0];
      expect(
        writes.map((write: any) => [
          String(write.updateOne.filter._id),
          write.updateOne.update.$set.tempsId,
        ]),
      ).toEqual(
        heads.map((head) => [head._id.toString(), head._id.toString()]),
      );
    });

    /** Readings stored with no field at all, and with an empty one. */
    it('looks for exactly the readings that name no series', async () => {
      await service.stampOrphanHeads();

      expect(model.find).toHaveBeenCalledWith({ tempsId: { $in: [null, ''] } });
    });

    /**
     * What makes running it twice a no-op: the first run leaves no reading
     * without a series id, so the second finds nothing to stamp and writes
     * nothing at all.
     */
    it('writes nothing when every reading already names its series', async () => {
      const stamped = await service.stampOrphanHeads();

      expect(model.bulkWrite).not.toHaveBeenCalled();
      expect(stamped).toBe(0);
    });

    /**
     * A finished cook's peak is stamped once and read from the stamp forever,
     * and the cooks this repairs had theirs computed over a series missing its
     * first reading. Restoring the reading without dropping the stamp would
     * leave the statistics screen reporting a peak the cook's own readings
     * contradict — so the stamp goes, and the lazy re-scan behind
     * `GET /stats` computes it again over the whole series.
     */
    it('drops the peak stamped over a series that was missing a reading', async () => {
      const head = orphan();
      const repaired: StoredCook = {
        tempsId: head._id.toString(),
        peakChamber: 240,
        peakChamberScanned: true,
      };
      smokes.cooks.push(repaired);
      model.find.mockImplementation(() => lean([head]));
      model.bulkWrite.mockResolvedValue({ modifiedCount: 1 });

      await service.stampOrphanHeads();

      expect(repaired).toEqual({ tempsId: head._id.toString() });
    });

    /** Cooks whose series never lost a reading keep the peak they recorded. */
    it('leaves the peaks of the cooks it did not repair alone', async () => {
      const head = orphan();
      const untouched: StoredCook = {
        tempsId: new Types.ObjectId().toString(),
        peakChamber: 268,
        peakChamberScanned: true,
      };
      smokes.cooks.push(untouched);
      model.find.mockImplementation(() => lean([head]));
      model.bulkWrite.mockResolvedValue({ modifiedCount: 1 });

      await service.stampOrphanHeads();

      expect(untouched.peakChamber).toBe(268);
      expect(untouched.peakChamberScanned).toBe(true);
    });

    /** Nothing repaired, nothing to re-derive: the cooks are not touched. */
    it('leaves every peak stamp in place when it finds no orphan', async () => {
      await service.stampOrphanHeads();

      expect(smokes.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('at boot', () => {
    it('stamps the orphans the database was left holding', async () => {
      const head = orphan();
      model.find.mockImplementation(() => lean([head]));
      model.bulkWrite.mockResolvedValue({ modifiedCount: 1 });

      await service.onModuleInit();

      expect(model.bulkWrite).toHaveBeenCalledTimes(1);
    });

    /**
     * A database that cannot be reached at boot must not stop the API from
     * starting: the repair is a repair, not a precondition, and the next boot
     * attempts it again.
     */
    it('starts anyway when the repair cannot be made', async () => {
      model.find.mockImplementation(() => {
        throw new Error('no primary available');
      });

      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });

    /** A driver that rejects with something other than an Error, as they do. */
    it('starts anyway when the failure is not an Error', async () => {
      model.find.mockImplementation(() => {
        throw 'connection reset';
      });

      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });
  });
});
