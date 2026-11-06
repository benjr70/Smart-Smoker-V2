import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { TempSeriesBackfillService } from './temp-series-backfill.service';

const lean = <T>(value: T) => ({
  select: () => ({ lean: () => ({ exec: () => Promise.resolve(value) }) }),
});

describe('TempSeriesBackfillService', () => {
  let service: TempSeriesBackfillService;
  let model: any;

  const orphan = () => ({ _id: new Types.ObjectId() });

  beforeEach(async () => {
    model = {
      find: jest.fn().mockImplementation(() => lean([])),
      bulkWrite: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TempSeriesBackfillService,
        { provide: getModelToken('Temp'), useValue: model },
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
