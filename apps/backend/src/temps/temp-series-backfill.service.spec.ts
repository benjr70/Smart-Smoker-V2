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

    /**
     * The regression the raise exists to avoid. `StatsService.stampCookWindows`
     * heals a cook whose series ran on past it — the box fired up again weeks
     * later against a session nobody ended — by cutting a window and scanning
     * the peak *inside* it, and that bounded number is not recoverable by any
     * pass that runs afterwards: every later rebuild skips a cook that carries
     * a finish. A brisket that never passed 238°F keeps 238°F, whatever the
     * burgers in the tail of its series got up to.
     */
    it('keeps a peak bounded to the cook when the reading it got back is cooler', async () => {
      const head = orphan({
        ChamberTemp: '225',
        date: new Date('2026-01-02T10:00:00Z'),
      });
      const healed = cook(head._id.toString(), {
        startedAt: new Date('2026-01-02T10:00:00Z'),
        finishedAt: new Date('2026-01-02T18:00:00Z'),
        peakChamber: 238,
        peakChamberScanned: true,
        cookWindowBackfilled: true,
      });
      // The brisket's own next reading, seconds later: what makes the head the
      // first reading of *this* cook rather than a stray from another session.
      temps.push({
        _id: new Types.ObjectId(),
        ChamberTemp: '226',
        date: new Date('2026-01-02T10:00:05Z'),
        tempsId: head._id.toString(),
      });
      // The burger session weeks later, in the same series: hotter than the
      // cook ever got, and outside the window the heal cut.
      temps.push({
        _id: new Types.ObjectId(),
        ChamberTemp: '450',
        date: new Date('2026-01-20T17:00:00Z'),
        tempsId: head._id.toString(),
      });

      await service.stampOrphanHeads();

      // Restored, which is what makes this the bounded-peak case rather than
      // the refusal above it: the head belongs to the cook, and the peak is
      // held at 238 by arithmetic, not by the head being left out.
      expect(head.tempsId).toBe(head._id.toString());
      expect(stored(healed).peakChamber).toBe(238);
      expect(stored(healed).cookWindowBackfilled).toBe(true);
    });

    /**
     * A reading the cook's own window excludes is not a fact about the cook.
     * The bounded scans read the rows at or before the finish and no others, so
     * a head whose date falls after it — a device whose clock was wrong, which
     * is the only way a cook's first reading can be dated after its last —
     * cannot raise a peak scanned that way, and the chart would contradict it
     * if it did: a stored series is clipped to the same window.
     */
    it('leaves the peak alone when the reading it got back falls outside the cook', async () => {
      const head = orphan({
        ChamberTemp: '450',
        date: new Date('2026-01-03T10:00:00Z'),
      });
      const finished = cook(head._id.toString(), {
        startedAt: new Date('2026-01-02T10:00:00Z'),
        finishedAt: new Date('2026-01-02T10:30:00Z'),
        peakChamber: 240,
        peakChamberScanned: true,
      });

      await service.stampOrphanHeads();

      expect(stored(finished).peakChamber).toBe(240);
    });

    /** A reading that cannot say when it was taken cannot be placed either. */
    it('leaves a finished cook alone when the reading it got back has no date', async () => {
      const head = orphan({ ChamberTemp: '450' });
      const finished = cook(head._id.toString(), {
        startedAt: new Date('2026-01-02T10:00:00Z'),
        finishedAt: new Date('2026-01-02T10:30:00Z'),
        peakChamber: 240,
        peakChamberScanned: true,
      });

      await service.stampOrphanHeads();

      expect(stored(finished).peakChamber).toBe(240);
    });

    /**
     * A head the rest of its own series puts on the far side of a silence is a
     * fact about some other session, whatever stamps its cook carries.
     *
     * The archive's rule for what belongs to one cook is contiguity, not
     * "earliest row wins" (see `cookWindow` in the timeline module): readings
     * arrive every few seconds while a cook runs, so an hour of quiet between a
     * series' first reading and its next one is the shortest silence this
     * archive can be configured to call the end of a cook. A power-on hours
     * before the brisket went in is the mirror image of the mis-clocked head
     * the finish guard already refuses — and folding it in is worse, because it
     * widens the cook's own window: `GET /api/timeline/:id` would report ten
     * hours for a four-hour cook and the chart would open with a six-hour dead
     * zone.
     */
    it('leaves a cook alone when a silence separates the head from its own series', async () => {
      const head = orphan({
        ChamberTemp: '300',
        date: new Date('2026-01-02T08:00:00Z'),
      });
      const healed = cook(head._id.toString(), {
        startedAt: new Date('2026-01-02T14:00:00Z'),
        finishedAt: new Date('2026-01-02T18:00:00Z'),
        peakChamber: 238,
        peakChamberScanned: true,
        cookWindowBackfilled: true,
      });
      temps.push({
        _id: new Types.ObjectId(),
        ChamberTemp: '238',
        date: new Date('2026-01-02T14:00:00Z'),
        tempsId: head._id.toString(),
      });

      await service.stampOrphanHeads();

      expect(stored(healed).startedAt).toEqual(
        new Date('2026-01-02T14:00:00Z'),
      );
      expect(stored(healed).peakChamber).toBe(238);
    });

    /**
     * A head dated *after* the reading that follows it is a row its own series
     * contradicts, and a cook still running has no finish to refuse it with.
     *
     * The shape is a box whose clock was wrong at power-on and corrected a
     * minute later. Stamping that moment as the cook's beginning is worse than
     * leaving the head out: `cookWindow` bounds the series read at the start
     * less the clock slack, so a cook whose own readings are earlier than its
     * stamped start reads back with *only* the stray — the three readings it
     * could still read before the repair are clipped out of their own chart.
     */
    it('moves no start when the head is dated after the reading that follows it', async () => {
      const head = orphan({
        ChamberTemp: '180',
        date: new Date('2026-01-06T10:30:00Z'),
      });
      const running = cook(head._id.toString());
      ['221', '233', '245'].forEach((chamber, minute) => {
        temps.push({
          _id: new Types.ObjectId(),
          ChamberTemp: chamber,
          date: new Date(`2026-01-06T10:0${minute + 1}:00Z`),
          tempsId: head._id.toString(),
        });
      });

      await service.stampOrphanHeads();

      expect(stored(running).startedAt).toBeUndefined();
    });

    /**
     * A reading that is no fact about the cook is left out of the cook's series
     * altogether, not stamped into it with the cook's stamps held back.
     *
     * Holding the stamps back is not enough, because not every read of a series
     * is clipped to the cook's window: `TimelineService.readings` asks the store
     * for `{ tempsId }` and nothing else, and `GET /api/timeline/:id` derives
     * the peak it reports from exactly those rows. So a stray stamped into the
     * series — a mis-clocked head, a power-on from another session — is reported
     * as the cook's peak by the one read that recomputes it, above a chart the
     * window keeps it out of: the review screen stands claiming 460°F over a
     * plot whose two points are 234 and 242.
     *
     * The stamp is what makes it visible, so the stamp is what is withheld. The
     * row stays an orphan, exactly as readable and as deletable as it was before
     * the repair (`tempSeriesFilter` takes it with the series either way), and
     * every boot afterwards refuses it again for the same reason.
     */
    it('leaves a reading unstamped when it is no fact about the cook', async () => {
      const head = orphan({
        ChamberTemp: '460',
        date: new Date('2026-01-02T13:20:00Z'),
      });
      const misclocked = cook(head._id.toString(), {
        finishedAt: new Date('2026-01-02T12:01:00Z'),
        peakChamber: 242,
        peakChamberScanned: true,
      });
      ['234', '242'].forEach((chamber, minute) => {
        temps.push({
          _id: new Types.ObjectId(),
          ChamberTemp: chamber,
          date: new Date(`2026-01-02T12:0${minute}:00Z`),
          tempsId: head._id.toString(),
        });
      });

      const stamped = await service.stampOrphanHeads();

      expect(head.tempsId).toBeUndefined();
      expect(stamped).toBe(0);
      expect(stored(misclocked).peakChamber).toBe(242);
      expect(stats.markDirty).not.toHaveBeenCalled();
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
     * What the silence rule must not refuse: the shape the repair was written
     * for in the first place.
     *
     * A legacy cook's start was stamped from a read that could not see the first
     * reading, so it names the second one — and on a device that sampled slowly,
     * or whose first stamp attempt was deferred to a later switch-on, that is
     * tens of minutes after the head. The head is still the cook's own: minutes
     * of quiet are not a silence, and the start moves back to it.
     */
    it('moves the start back to a head its cook took twenty minutes to stamp', async () => {
      const head = orphan({
        ChamberTemp: '455',
        date: new Date('2026-01-02T11:00:00Z'),
      });
      const late = cook(head._id.toString(), {
        startedAt: new Date('2026-01-02T11:20:00Z'),
        finishedAt: new Date('2026-01-02T11:40:00Z'),
        peakChamber: 241,
        peakChamberScanned: true,
      });
      temps.push({
        _id: new Types.ObjectId(),
        ChamberTemp: '233',
        date: new Date('2026-01-02T11:20:00Z'),
        tempsId: head._id.toString(),
      });

      await service.stampOrphanHeads();

      expect(head.tempsId).toBe(head._id.toString());
      expect(stored(late).startedAt).toEqual(new Date('2026-01-02T11:00:00Z'));
      expect(stored(late).peakChamber).toBe(455);
    });

    /**
     * A cook no statistics pass has asked about yet is left to that pass,
     * which now reads the whole series: both of them look for a cook carrying
     * neither a peak nor the mark saying its readings were searched, so the
     * answer they come back with is already the repaired one.
     */
    it('leaves a cook nothing has scanned yet to the scan', async () => {
      const head = orphan({
        ChamberTemp: '450',
        date: new Date('2026-01-02T10:00:00Z'),
      });
      const unscanned = cook(head._id.toString(), {
        startedAt: new Date('2026-01-02T10:00:00Z'),
        finishedAt: new Date('2026-01-02T10:30:00Z'),
      });

      await service.stampOrphanHeads();

      expect(stored(unscanned).peakChamber).toBeUndefined();
      expect(stored(unscanned).peakChamberScanned).toBeUndefined();
    });

    /**
     * A cook recorded as searched and left without a peak held nothing
     * readable. It is never asked again — the mark is what excludes it — so if
     * the reading it got back is readable, that reading is its peak.
     */
    it('gives a cook searched for a peak it never found the reading it got back', async () => {
      const head = orphan({
        ChamberTemp: '268',
        date: new Date('2026-01-02T10:00:00Z'),
      });
      const searched = cook(head._id.toString(), {
        startedAt: new Date('2026-01-02T10:00:00Z'),
        finishedAt: new Date('2026-01-02T10:30:00Z'),
        peakChamberScanned: true,
      });

      await service.stampOrphanHeads();

      expect(stored(searched).peakChamber).toBe(268);
    });

    /**
     * Readings are stored as the strings the device sent, and the archive holds
     * rows whose chamber is blank or nonsense. One of those says nothing about
     * how hot the cook got, exactly as it says nothing to the scans.
     */
    it('moves no peak when the reading it got back cannot be read as a number', async () => {
      const head = orphan({
        ChamberTemp: '--',
        date: new Date('2026-01-02T10:00:00Z'),
      });
      const finished = cook(head._id.toString(), {
        startedAt: new Date('2026-01-02T10:00:00Z'),
        finishedAt: new Date('2026-01-02T10:30:00Z'),
        peakChamber: 240,
        peakChamberScanned: true,
      });

      await service.stampOrphanHeads();

      expect(stored(finished).peakChamber).toBe(240);
    });

    /** A reading that cannot say when it was taken cannot move a start. */
    it('moves no start when the reading it got back has no date', async () => {
      const head = orphan({ ChamberTemp: '225' });
      const finished = cook(head._id.toString(), {
        startedAt: new Date('2026-01-02T10:05:00Z'),
        finishedAt: new Date('2026-01-02T10:30:00Z'),
      });

      await service.stampOrphanHeads();

      expect(stored(finished).startedAt).toEqual(
        new Date('2026-01-02T10:05:00Z'),
      );
    });

    /**
     * The start is bounded by the same window the peak is, and for a harder
     * reason. A cook carrying a finish but no start is the shape a failed start
     * stamp leaves (see `TimelineService.stampStart`), so the guard that only
     * ever moves a start *back* never fires for it: there is nothing to move
     * back from. Hand that cook a head dated after its finish — a device whose
     * clock was wrong, the same row the peak refuses — and stamping it as the
     * start writes a beginning *after* the end. `durationBetween` then clamps
     * the cook to an instant, and `cookWindow` bounds its series read at
     * `head.date` less the clock slack: once the head is further past the
     * finish than that slack, the window is empty and the read answers with
     * nothing but the undated rows. The cook had no start at all before the
     * repair, so its series read whole bar the head — the repair must not cost
     * it the rest of its readings to restore one.
     */
    it('moves no start when the reading it got back falls after the cook finished', async () => {
      const head = orphan({
        ChamberTemp: '225',
        date: new Date('2026-01-03T10:00:00Z'),
      });
      const unstamped = cook(head._id.toString(), {
        finishedAt: new Date('2026-01-02T10:30:00Z'),
        peakChamber: 240,
        peakChamberScanned: true,
      });

      await service.stampOrphanHeads();

      expect(stored(unstamped).startedAt).toBeUndefined();
    });

    /**
     * Moving the stamps is only half of it: the statistics are served from a
     * stored aggregate, and the guard behind it counts completed cooks — a
     * repair changes no count, so nothing would ever read the moved stamps.
     */
    it('declares the statistics stale after a repair', async () => {
      const head = orphan({ date: new Date('2026-01-02T10:00:00Z') });
      cook(head._id.toString(), {
        startedAt: new Date('2026-01-02T10:05:00Z'),
      });

      await service.stampOrphanHeads();

      expect(stats.markDirty).toHaveBeenCalledTimes(1);
    });

    /** A boot that repairs nothing leaves the stored statistics alone. */
    it('leaves the statistics alone when it finds no orphan', async () => {
      await service.stampOrphanHeads();

      expect(stats.markDirty).not.toHaveBeenCalled();
    });

    /**
     * A repair that moved no stamp changed nothing the statistics are derived
     * from, and a rebuild of a whole archive is not free: the orphan whose
     * cook was deleted, and the one whose cook has nothing worth moving, cost
     * the next `GET /stats` nothing.
     */
    it('leaves the statistics alone when no repaired cook needed a stamp', async () => {
      const head = orphan({ date: new Date('2026-01-02T10:00:00Z') });
      cook(head._id.toString(), {
        startedAt: new Date('2026-01-02T09:00:00Z'),
      });

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

    /**
     * What the order of the two writes buys, pinned so a reorder has something
     * to trip over.
     *
     * The cooks are re-derived *before* the readings are stamped, so a cook
     * write that fails leaves the orphan unstamped — still matching the orphan
     * filter, so the next boot finds it and attempts the whole repair again.
     * The other order makes one failed write permanent: the reading would be
     * stamped, no later boot would find an orphan, and the cook would carry a
     * start and a peak derived from a series missing its first reading forever.
     * That is the bug this repair exists to undo, made unreachable.
     */
    it('leaves the reading unstamped when the cook it repairs cannot be written', async () => {
      const head = orphan({
        ChamberTemp: '450',
        date: new Date('2026-01-02T10:00:00Z'),
      });
      cook(head._id.toString(), {
        startedAt: new Date('2026-01-02T10:05:00Z'),
        finishedAt: new Date('2026-01-02T10:30:00Z'),
        peakChamber: 240,
        peakChamberScanned: true,
      });
      jest
        .spyOn(smokeModel, 'bulkWrite')
        .mockRejectedValue(new Error('write concern not satisfied'));

      await expect(service.onModuleInit()).resolves.toBeUndefined();

      expect(head.tempsId).toBeUndefined();
      expect(stats.markDirty).not.toHaveBeenCalled();
    });
  });
});
