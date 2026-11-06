import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';

import { SmokeDocument } from '../smoke/smoke.schema';
import { markStatsStale } from '../stats/mark-stats-stale';
import { StatsService } from '../stats/stats.service';
import { TempDocument } from './temps.schema';

/**
 * A reading that names a series without carrying it.
 *
 * The only write that ever omitted the id was the one that opened a series: a
 * cook's first reading was stored before the cook had a series id, and its own
 * `_id` is what became that id (see {@link tempSeriesFilter}). Every other
 * write — the appends and the batch insert — stamps the id it was given. So a
 * stored reading with no `tempsId` is a cook's first reading, and the id it is
 * missing is its own.
 *
 * `$in: [null, '']` is the pair of ways it can be missing: the field absent
 * altogether, which is how the orphans were written, and present but empty.
 */
const ORPHANED_HEAD: FilterQuery<TempDocument> = {
  tempsId: { $in: [null, ''] },
};

/**
 * A stored reading read for its id alone — the id an orphan is missing, and
 * the one its whole series is named after.
 */
interface StoredHead {
  _id: Types.ObjectId;
}

/**
 * A cook's restored first reading, as much of it as the re-derivation reads:
 * the series it names, and when it was taken.
 *
 * Read lean, so `date` is what the row actually holds — a legacy row may hold
 * none at all.
 */
interface RestoredReading extends StoredHead {
  date?: Date | null;
  ChamberTemp?: string;
}

/** A stored cook, read for the stamps the restored reading unsettles. */
interface StoredCook {
  _id: Types.ObjectId;
  tempsId?: string;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  peakChamber?: number;
  peakChamberScanned?: boolean;
}

/**
 * What a restored reading makes of the stamps its cook carries: each field the
 * reading moves, and nothing for a field it leaves where it was.
 */
type RederivedStamps = { startedAt?: Date; peakChamber?: number };

/**
 * One reading's series stamp as a bulk write carries it: the row to stamp, and
 * the id it should have been written with.
 *
 * Spelled out rather than inferred at the call, the way `StatsService`'s
 * `PeakStamp` is: Mongoose's own bulk operation type is a union wide enough
 * that resolving an inline literal against it costs the compiler more than
 * everything else in the file.
 */
interface SeriesStamp {
  updateOne: {
    filter: { _id: unknown };
    update: { $set: { tempsId: string } };
  };
}

/**
 * One cook's re-derivation as a bulk write carries it — spelled out for the
 * same reason {@link SeriesStamp} is. A cook is written to one at a time rather
 * than all of them with a single `updateMany` because what a repaired cook
 * needs written depends on the reading it got back.
 */
interface CookStamp {
  updateOne: {
    filter: { _id: unknown };
    update: { $set: RederivedStamps };
  };
}

/**
 * Puts every cook's first reading back into its own series, once.
 *
 * Until the series id was minted before the first reading was written (see
 * `TempsService.saveNewTemp`), that reading was stored without one — and every
 * read of a series asks the store for it by `tempsId`, so each of them dropped
 * the first reading of every cook ever recorded: the live chart, the stored
 * series, the timeline's readings and readings-since, and the edge and peak
 * scans. The write is fixed for the cooks still to come; this is the repair for
 * the ones already in the database (issue #755).
 *
 * Run at boot rather than from a script anybody has to remember: the backend
 * owns this collection and is the only thing that reads it, and a deployed box
 * nobody can shell into is exactly where the orphans are. Idempotent by
 * construction — a stamped reading no longer matches {@link ORPHANED_HEAD} —
 * so every boot after the first finds nothing and writes nothing.
 *
 * Stamped row by row rather than with one store-side pipeline, because what is
 * written depends on the row it is written to: each orphan gets *its own* id,
 * which is one update per orphan and at most one orphan per cook, ever.
 *
 * Restoring a reading also unsettles what was already derived from the series
 * without it, so the repair moves the stamps of the cooks it touches — see
 * {@link TempSeriesBackfillService.rederiveWhatWasDerivedWithoutTheFirstReading}.
 */
@Injectable()
export class TempSeriesBackfillService implements OnModuleInit {
  constructor(
    @InjectModel('Temp') private readonly model: Model<TempDocument>,
    // The cooks that own the repaired series, so what was derived from a
    // series missing a reading can be derived again. Its model rather than
    // `SmokeService`, for the reason the module gives.
    @InjectModel('Smoke') private readonly smokeModel: Model<SmokeDocument>,
    /**
     * The statistics, to be told the archive they were derived from has
     * changed. Their stored aggregate is guarded by a count of completed
     * cooks, and a repair moves no count: without being told, the numbers
     * taken from the repaired cooks would stand until something unrelated
     * happened to a cook.
     */
    private readonly stats: StatsService,
  ) {}

  /**
   * Failure is logged, never thrown: an unreachable or slow database at boot
   * must not stop the API from starting, and the repair is attempted again at
   * the next one. Nothing reads what it repairs before it has run — the only
   * readings it touches have been unreadable since they were written.
   */
  async onModuleInit(): Promise<void> {
    try {
      const stamped = await this.stampOrphanHeads();
      if (stamped > 0) {
        Logger.log(
          `put ${stamped} first reading(s) back into their own series`,
          'TempSeriesBackfill',
        );
      }
    } catch (err) {
      Logger.error(
        `could not restore the orphaned first readings: ${
          err instanceof Error ? err.message : String(err)
        }`,
        'TempSeriesBackfill',
      );
    }
  }

  /**
   * Stamps each reading that names no series with its own id, and answers with
   * how many the store says it changed.
   */
  async stampOrphanHeads(): Promise<number> {
    const orphans = (await this.model
      .find(ORPHANED_HEAD)
      .select('_id date ChamberTemp')
      .lean()
      .exec()) as RestoredReading[];
    if (orphans.length === 0) {
      return 0;
    }
    await this.rederiveWhatWasDerivedWithoutTheFirstReading(orphans);
    const writes: SeriesStamp[] = orphans.map(({ _id }) => ({
      updateOne: {
        filter: { _id },
        update: { $set: { tempsId: String(_id) } },
      },
    }));
    const result = await this.model.bulkWrite(
      writes as unknown as Parameters<Model<TempDocument>['bulkWrite']>[0],
    );
    return result.modifiedCount;
  }

  /**
   * Move each repaired cook's stamps to what its series now says.
   *
   * A finished cook's start and peak are stamped once — at finish, or by one of
   * the statistics backfills — and read from the stamp forever after, because a
   * finished cook's series never changes again. The series this repair touches
   * did change: they got back the reading every read of them had been dropping.
   * So the cook that started hot stands recorded with a peak its own readings
   * contradict, and every cook stands recorded as beginning at its *second*
   * reading — which is not only a wrong start and a short duration but a window
   * that clips the restored reading straight back out (see `cookWindow` in
   * `TempsService`).
   *
   * Both are re-derived from the restored reading alone rather than by scanning
   * the series again: the repair adds exactly one reading, so the cook's
   * beginning is the earlier of the two moments and its peak is the hotter of
   * the two numbers. Arithmetic needs no query, and — the reason it matters
   * more than the saving — it cannot lose what a scan would have to find again.
   * The peaks `StatsService.stampCookWindows` deliberately bounded to a cook's
   * own window are not recoverable by any pass that runs afterwards, so a
   * repair that dropped the stamp and left the next rebuild to scan unbounded
   * would hand a 225°F brisket the peak of a burger session weeks later in the
   * same series.
   *
   * Run *before* the readings are stamped, so a failure here leaves the orphans
   * as they were and the next boot attempts the whole repair again. The other
   * order would make a single failed write permanent: the readings would be
   * stamped, the next boot would find no orphan, and the cooks would keep
   * stamps derived from a series missing its first reading forever.
   *
   * Cooks whose series never lost a reading are untouched, and so is the
   * repaired cook on a second boot: the repair finds no orphan then, and this
   * is not reached.
   */
  private async rederiveWhatWasDerivedWithoutTheFirstReading(
    heads: RestoredReading[],
  ): Promise<void> {
    const headOf = new Map(heads.map((head) => [String(head._id), head]));
    const repaired = (await this.smokeModel
      .find({ tempsId: { $in: [...headOf.keys()] } })
      .select('_id tempsId startedAt finishedAt peakChamber peakChamberScanned')
      .lean()
      .exec()) as StoredCook[];
    const stamps: CookStamp[] = repaired.flatMap((cook) => {
      const head = headOf.get(String(cook.tempsId));
      const $set = {
        ...this.startMovedBackTo(head, cook),
        ...this.peakRaisedTo(head, cook),
      };
      // A cook the restored reading says nothing new about is left alone
      // rather than written to with nothing: an empty `$set` is an error to
      // the store, and a cook written to for no reason is a cook whose stamps
      // can no longer be trusted to mean what they say.
      return Object.keys($set).length === 0
        ? []
        : [{ updateOne: { filter: { _id: cook._id }, update: { $set } } }];
    });
    if (stamps.length > 0) {
      await this.smokeModel.bulkWrite(
        stamps as unknown as Parameters<Model<SmokeDocument>['bulkWrite']>[0],
      );
    }
    await markStatsStale(this.stats, 'temperature-series repair');
  }

  /**
   * The cook's start moved back to the reading it just got back, as a fragment
   * of the write — and nothing at all when the reading says nothing that moves
   * it.
   *
   * A stamped start is read from the stamp forever (see
   * `TimelineService.stampStart` and `StatsService.stampCookWindows`, both of
   * which derive it from a read that could not see the first reading), and a
   * cook whose series got its beginning back began at that beginning. Only ever
   * moved *back*: the restored reading is the earliest the series holds, so a
   * stamp already at or before it is already right, and an undated row cannot
   * be placed against the stamp at all.
   */
  private startMovedBackTo(
    head: RestoredReading | undefined,
    cook: StoredCook,
  ): RederivedStamps {
    const began = head?.date;
    if (!began) {
      return {};
    }
    if (cook.startedAt && cook.startedAt.getTime() <= began.getTime()) {
      return {};
    }
    return { startedAt: began };
  }

  /**
   * The cook's peak raised to the reading it just got back, as a fragment of
   * the write — and nothing at all when the reading cannot raise it.
   *
   * The repair adds exactly one reading to a series, so the hottest reading of
   * the repaired series is the hotter of the two: the stamp, scanned over
   * everything but the restored reading, and the restored reading itself. That
   * is arithmetic, which is why nothing is re-scanned here — and why the peaks
   * `StatsService.stampCookWindows` deliberately bounded to a cook's own
   * window survive, where dropping the stamp and leaving the next rebuild to
   * scan again unbounded would have handed a 225°F brisket the peak of a
   * burger session weeks later in the same series.
   *
   * Only ever raised, and only for a cook whose peak is settled: a cook that
   * carries a peak, or the mark saying its readings were searched for one, is
   * never asked again by either statistics pass, so what it carries is what it
   * will report forever. A cook that has not been scanned yet is left to that
   * scan, which now reads the whole series.
   */
  private peakRaisedTo(
    head: RestoredReading | undefined,
    cook: StoredCook,
  ): RederivedStamps {
    const settled =
      cook.peakChamberScanned === true || Number.isFinite(cook.peakChamber);
    if (!settled) {
      return {};
    }
    const restored = Number(head?.ChamberTemp);
    if (!head?.ChamberTemp || !Number.isFinite(restored)) {
      return {};
    }
    // A reading the cook's own window excludes is not a fact about the cook.
    // The scans that bound a peak read the rows dated at or before the finish
    // and no others (`TimelineService.peakChambersOf`), and a stored series is
    // clipped to the same window, so folding in a reading from outside it
    // would leave the cook claiming a peak its own chart never reaches. An
    // undated row cannot be placed inside the window and is excluded with it.
    if (
      cook.finishedAt &&
      (!head.date || head.date.getTime() > cook.finishedAt.getTime())
    ) {
      return {};
    }
    if (
      Number.isFinite(cook.peakChamber) &&
      (cook.peakChamber as number) >= restored
    ) {
      return {};
    }
    return { peakChamber: restored };
  }
}
