import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { FakeDoc, fakeModel } from '../timeline/testing/fake-model';
import { StatsService } from '../stats/stats.service';
import { TempSeriesBackfillService } from './temp-series-backfill.service';

/**
 * A stored reading, as the two writes left one: the orphan heads carry no
 * `tempsId` field at all, everything else carries the id of the series it
 * belongs to.
 */
interface StoredReading extends FakeDoc {
  _id: Types.ObjectId;
  ChamberTemp?: string;
  date?: Date | null;
  tempsId?: string;
}

/** A stored cook, as the start and peak stamps leave one. */
interface StoredCook extends FakeDoc {
  _id: Types.ObjectId;
  tempsId: string;
  startedAt?: Date;
  finishedAt?: Date;
  peakChamber?: number;
  peakChamberScanned?: boolean;
  cookWindowBackfilled?: boolean;
}

describe('TempSeriesBackfillService', () => {
  let service: TempSeriesBackfillService;
  let temps: StoredReading[];
  let cooks: StoredCook[];
  let model: ReturnType<typeof fakeModel>;
  let smokeModel: ReturnType<typeof fakeModel>;
  let stats: { markDirty: jest.Mock };

  /** A reading stored without the series id it should have carried. */
  const orphan = (fields: Partial<StoredReading> = {}): StoredReading => {
    const head: StoredReading = { _id: new Types.ObjectId(), ...fields };
    temps.push(head);
    return head;
  };

  /** The cook that owns a series, with whatever it was already stamped with. */
  const cook = (tempsId: string, fields: Partial<StoredCook> = {}) => {
    const stored: StoredCook = {
      _id: new Types.ObjectId(),
      tempsId,
      ...fields,
    };
    cooks.push(stored);
    return stored;
  };

  /** The cook as the store holds it now, rather than as the test built it. */
  const stored = (of: StoredCook): StoredCook =>
    cooks.find((one) => one._id === of._id) as StoredCook;

  beforeEach(async () => {
    temps = [];
    cooks = [];
    model = fakeModel(temps);
    smokeModel = fakeModel(cooks);
    stats = { markDirty: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TempSeriesBackfillService,
        { provide: getModelToken('Temp'), useValue: model },
        { provide: getModelToken('Smoke'), useValue: smokeModel },
        { provide: StatsService, useValue: stats },
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

      const stamped = await service.stampOrphanHeads();

      expect(head.tempsId).toBe(head._id.toString());
      expect(stamped).toBe(1);
    });

    /** One orphan per cook, and each one belongs to its own cook. */
    it('gives each orphan its own id rather than one another', async () => {
      const heads = [orphan(), orphan(), orphan()];

      await service.stampOrphanHeads();

      expect(heads.map((head) => head.tempsId)).toEqual(
        heads.map((head) => head._id.toString()),
      );
    });

    /** Readings stored with no field at all, and with an empty one. */
    it('restores a reading whose series id is empty rather than absent', async () => {
      const blank = orphan({ tempsId: '' });

      await service.stampOrphanHeads();

      expect(blank.tempsId).toBe(blank._id.toString());
    });

    /**
     * What makes running it twice a no-op: the first run leaves no reading
     * without a series id, so the second finds nothing to stamp and writes
     * nothing at all.
     */
    it('writes nothing when every reading already names its series', async () => {
      const already = orphan({ tempsId: 'a-series-of-its-own' });

      const stamped = await service.stampOrphanHeads();

      expect(already.tempsId).toBe('a-series-of-its-own');
      expect(stamped).toBe(0);
    });

    /**
     * A finished cook's peak is stamped once and read from the stamp forever,
     * and the cooks this repairs had theirs scanned over a series missing its
     * first reading. A cook that started hot had its hottest reading stamped
     * out of the record, leaving `GET /stats` reporting a peak the cook's own
     * readings contradict while `GET /timeline/:id`, which derives the peak on
     * every read, reports the true one.
     *
     * The repair adds exactly one reading to the series, so the hottest of the
     * repaired series is the hotter of the stamp and the restored reading —
     * arithmetic, not a re-scan.
     */
    it('raises a stamped peak to the reading it got back', async () => {
      const head = orphan({
        ChamberTemp: '450',
        date: new Date('2026-01-02T10:00:00Z'),
      });
      const repaired = cook(head._id.toString(), {
        startedAt: new Date('2026-01-02T10:00:00Z'),
        finishedAt: new Date('2026-01-02T10:30:00Z'),
        peakChamber: 240,
        peakChamberScanned: true,
      });

      await service.stampOrphanHeads();

      expect(stored(repaired).peakChamber).toBe(450);
      expect(stored(repaired).peakChamberScanned).toBe(true);
    });

    /** Cooks whose series never lost a reading keep the peak they recorded. */
    it('leaves the peaks of the cooks it did not repair alone', async () => {
      orphan();
      const untouched = cook(new Types.ObjectId().toString(), {
        peakChamber: 268,
        peakChamberScanned: true,
      });

      await service.stampOrphanHeads();

      expect(stored(untouched).peakChamber).toBe(268);
      expect(stored(untouched).peakChamberScanned).toBe(true);
    });

    /** Nothing repaired, nothing to re-derive: the cooks are not touched. */
    it('leaves every peak stamp in place when it finds no orphan', async () => {
      const untouched = cook(new Types.ObjectId().toString(), {
        peakChamber: 268,
        peakChamberScanned: true,
      });

      await service.stampOrphanHeads();

      expect(stored(untouched).peakChamber).toBe(268);
    });

    /**
     * A cook's start was stamped from a read of its series that could not see
     * the first reading, so it names the *second* one: the cook is recorded as
     * beginning minutes after it began, and its length is short by the same
     * minutes. Nothing re-derives it — a stamped start is read from the stamp
     * forever — so the repair moves it back itself.
     */
    it('moves a repaired cook back to the reading it just got back', async () => {
      const head = orphan({ date: new Date('2026-01-02T10:00:00Z') });
      const repaired = cook(head._id.toString(), {
        startedAt: new Date('2026-01-02T10:05:00Z'),
        finishedAt: new Date('2026-01-02T10:30:00Z'),
      });

      await service.stampOrphanHeads();

      expect(stored(repaired).startedAt).toEqual(
        new Date('2026-01-02T10:00:00Z'),
      );
    });

    /**
     * Dropping the stamp is only half of it: the statistics are served from a
     * stored aggregate, and the guard behind it counts completed cooks — a
     * repair changes no count, so nothing would ever ask the cooks again.
     */
    it('declares the statistics stale after a repair', async () => {
      const head = orphan();
      cook(head._id.toString(), {
        peakChamber: 240,
        peakChamberScanned: true,
      });

      await service.stampOrphanHeads();

      expect(stats.markDirty).toHaveBeenCalledTimes(1);
    });

    /** A boot that repairs nothing leaves the stored statistics alone. */
    it('leaves the statistics alone when it finds no orphan', async () => {
      await service.stampOrphanHeads();

      expect(stats.markDirty).not.toHaveBeenCalled();
    });
  });

  describe('at boot', () => {
    it('stamps the orphans the database was left holding', async () => {
      const head = orphan();

      await service.onModuleInit();

      expect(head.tempsId).toBe(head._id.toString());
    });

    /**
     * A database that cannot be reached at boot must not stop the API from
     * starting: the repair is a repair, not a precondition, and the next boot
     * attempts it again.
     */
    it('starts anyway when the repair cannot be made', async () => {
      jest.spyOn(model, 'find').mockImplementation(() => {
        throw new Error('no primary available');
      });

      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });

    /** A driver that rejects with something other than an Error, as they do. */
    it('starts anyway when the failure is not an Error', async () => {
      jest.spyOn(model, 'find').mockImplementation(() => {
        throw 'connection reset';
      });

      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });
  });
});
