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
 * without it, so the repair forgets the peaks those cooks were stamped with —
 * see {@link TempSeriesBackfillService.dropPeaksDerivedWithoutTheFirstReading}.
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
      .select('_id')
      .lean()
      .exec()) as StoredHead[];
    if (orphans.length === 0) {
      return 0;
    }
    const writes: SeriesStamp[] = orphans.map(({ _id }) => ({
      updateOne: {
        filter: { _id },
        update: { $set: { tempsId: String(_id) } },
      },
    }));
    const result = await this.model.bulkWrite(
      writes as unknown as Parameters<Model<TempDocument>['bulkWrite']>[0],
    );
    await this.dropPeaksDerivedWithoutTheFirstReading(
      orphans.map(({ _id }) => String(_id)),
    );
    return result.modifiedCount;
  }

  /**
   * Forget the peak of every cook whose series was just repaired, so it is
   * scanned again over the whole of it.
   *
   * A finished cook's peak is stamped once — at finish, or by the statistics
   * backfill — and read from the stamp forever after, because a finished
   * cook's series never changes again. The series this repair touches did
   * change: they got back the reading every read of them had been dropping,
   * and the cooks that start hot had their hottest reading stamped out of the
   * record. Restoring the reading and keeping the stamp would leave
   * `GET /stats` reporting a peak the cook's own readings contradict, while
   * `GET /timeline/:id`, which derives the peak on every read, reports the
   * true one.
   *
   * The mark goes with the value: the pair reads as "asked, and this is the
   * answer", and unsetting both puts the cook back to "never asked" — which is
   * exactly what `StatsService.stampMissingPeaks` looks for the next time the
   * statistics are rebuilt. Re-deriving here instead would mean scanning the
   * repaired series at boot and writing a second value nobody has asked for
   * yet; the lazy scan already in place is the repo's way of paying for this.
   *
   * Cooks whose series never lost a reading are untouched, and so is the
   * repaired cook on a second boot: the repair finds no orphan then, and this
   * is not reached.
   */
  private async dropPeaksDerivedWithoutTheFirstReading(
    seriesIds: string[],
  ): Promise<void> {
    await this.smokeModel
      .updateMany(
        { tempsId: { $in: seriesIds } },
        { $unset: { peakChamber: '', peakChamberScanned: '' } },
      )
      .exec();
    await markStatsStale(this.stats, 'temperature-series repair');
  }
}
