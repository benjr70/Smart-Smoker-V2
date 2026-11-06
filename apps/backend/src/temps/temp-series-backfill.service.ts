import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';

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
 */
@Injectable()
export class TempSeriesBackfillService implements OnModuleInit {
  constructor(
    @InjectModel('Temp') private readonly model: Model<TempDocument>,
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
      .exec()) as { _id: unknown }[];
    if (orphans.length === 0) {
      return 0;
    }
    const writes = orphans.map(({ _id }) => ({
      updateOne: {
        filter: { _id },
        update: { $set: { tempsId: String(_id) } },
      },
    }));
    // The write list is handed over untyped: inferring mongoose's bulk-write
    // union over this collection's document type is pathological enough to
    // exhaust the compiler's heap.
    const result = await this.model.bulkWrite(writes as never[]);
    return result.modifiedCount;
  }
}
