import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';

import { MIN_AUTO_STOP_IDLE_MS } from '../appSettings/auto-stop-threshold';
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
const ORPHANED_HEAD_FILTER: FilterQuery<TempDocument> = {
  tempsId: { $in: [null, ''] },
};

/**
 * The longest quiet this repair will accept between a series' first reading and
 * its next one before taking the two to be from different cooks.
 *
 * The archive's rule for what belongs to one cook is contiguity, not "the
 * earliest row wins": readings arrive every few seconds while a cook runs, so a
 * silence is where one cook ended and whatever came next began (see `cookWindow`
 * in the timeline module, and `idleThresholdMsOf` for the silence the live
 * auto-stop reads from settings). This bound is the *floor* that setting can be
 * configured to — one hour (`AutoStopDto`) — rather than the configured value
 * itself: a head an hour clear of its own series is from another firing of the
 * box under every configuration this archive allows, and a repair that runs
 * once at boot and can never be re-run should only move what no setting would
 * dispute. The floor is read from where the settings refuse anything below it
 * rather than written out again here, so the two cannot drift apart.
 *
 * Far wider than any legacy head's real gap: the orphans this restores were
 * written moments before the reading that followed them, and even a start stamp
 * deferred to a later switch-on leaves minutes, not hours.
 */
const SERIES_HEAD_SILENCE_MS = MIN_AUTO_STOP_IDLE_MS;

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
 * A reading the repair has decided is its cook's own first one, with the cook
 * whose series it opens — absent when that cook has since been deleted, which
 * leaves the reading worth restoring and nothing worth re-deriving.
 */
interface RestoredSeries {
  head: RestoredReading;
  cook?: StoredCook;
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
 * construction — a stamped reading no longer matches
 * {@link ORPHANED_HEAD_FILTER} — so every boot after the first writes nothing.
 * A reading it refused stays an orphan and is found again, and refused again on
 * the same two facts, which is a read and no write.
 *
 * Stamped row by row rather than with one store-side pipeline, because what is
 * written depends on the row it is written to: each orphan gets *its own* id,
 * which is one update per orphan. Normally that is one orphan per cook — the
 * write that omitted the id ran once per series — though a cook whose second
 * reading arrived inside the round trip that minted the id left two, and each
 * of them becomes a series of its own, which is the shape it already had.
 *
 * Restoring a reading also unsettles what was already derived from the series
 * without it, so the repair moves the stamps of the cooks it touches — see
 * {@link TempSeriesBackfillService.rederiveWhatWasDerivedWithoutTheFirstReading}
 * — and a reading the cook's own evidence excludes is left alone entirely, see
 * {@link TempSeriesBackfillService.readingsThatAreFactsAboutTheirCook}.
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
      .find(ORPHANED_HEAD_FILTER)
      .select('_id date ChamberTemp')
      .lean()
      .exec()) as RestoredReading[];
    if (orphans.length === 0) {
      return 0;
    }
    const restorable = await this.readingsThatAreFactsAboutTheirCook(orphans);
    if (restorable.length === 0) {
      // Every orphan found was refused, which is not nothing done wrong: an
      // empty bulk write is an error to the store, and a boot that restored no
      // reading has nothing to announce and no cook to re-derive.
      return 0;
    }
    await this.rederiveWhatWasDerivedWithoutTheFirstReading(restorable);
    const writes: SeriesStamp[] = restorable.map(({ head: { _id } }) => ({
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
   * would hand a 225°F brisket the peak of a burger cook weeks later in the
   * same series.
   *
   * Written straight onto the cook rather than through `ActiveCookService`,
   * which ADR 0001 gives the cook's transitions to: that ADR is about the
   * transitions of the cook being *run* — one smoker, one cook, one place that
   * moves it on — and these cooks finished long ago. Repairing what was derived
   * about a finished cook is out-of-band maintenance, which is how
   * `StatsService.stampCookWindows` and `stampPeak` already write the same two
   * fields.
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
    restorable: RestoredSeries[],
  ): Promise<void> {
    const stamps: CookStamp[] = restorable.flatMap(({ head, cook }) => {
      // A series whose cook has since been deleted contributes nothing: the
      // reading is still restored, there is simply nothing it unsettles.
      if (!cook) {
        return [];
      }
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
    if (stamps.length === 0) {
      // Nothing the statistics are derived from moved, so they are not stale:
      // an orphan whose cook was deleted, or whose cook has nothing worth
      // moving, must not cost the next `GET /stats` a rebuild of the whole
      // archive.
      return;
    }
    await this.smokeModel.bulkWrite(
      stamps as unknown as Parameters<Model<SmokeDocument>['bulkWrite']>[0],
    );
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
   *
   * A reading the cook's own window excludes moves nothing either (see
   * {@link TempSeriesBackfillService.fallsOutsideTheCook}), and the start needs
   * that guard more than the peak does: a cook carrying a finish but no start
   * is what a failed start stamp leaves behind, so "only ever back" never fires
   * for it, and a head dated after the finish would be written as a beginning
   * after the end. That is a cook clamped to an instant by `durationBetween`
   * and — once the head is further past the finish than the clock slack — a
   * `cookWindow` with nothing inside it, which would cost the cook the readings
   * it could still read to restore the one it could not.
   */
  private startMovedBackTo(
    head: RestoredReading,
    cook: StoredCook,
  ): RederivedStamps {
    const began = head.date;
    if (!began) {
      return {};
    }
    if (cook.startedAt && cook.startedAt.getTime() <= began.getTime()) {
      return {};
    }
    return { startedAt: began };
  }

  /**
   * The orphans worth restoring, each with the cook whose series it opens.
   *
   * The question asked of every orphan is whether the reading is its cook's own
   * first one, and it is asked *before* anything is written, because the answer
   * decides the whole of what the repair does to that series: a reading that is
   * no fact about the cook is left an orphan, not stamped into the series with
   * the cook's stamps held back. Not every read of a series is clipped to the
   * cook's window — `TimelineService.readings` asks for `{ tempsId }` and
   * nothing else, and the peak `GET /api/timeline/:id` reports is derived from
   * exactly those rows — so a stray stamped in is reported as the cook's peak
   * above a chart the window keeps it out of.
   *
   * Refusing is permanent in the sense that matters and harmless in the sense
   * that does not: the row stays as readable and as deletable as it was before
   * the repair (`tempSeriesFilter` takes it with the series by `_id` either
   * way), and every boot afterwards reaches the same answer from the same two
   * facts, so a refusal writes nothing and announces nothing, for ever.
   */
  private async readingsThatAreFactsAboutTheirCook(
    orphans: RestoredReading[],
  ): Promise<RestoredSeries[]> {
    const series = orphans.map(({ _id }) => String(_id));
    const [cooks, openedAt] = await Promise.all([
      this.smokeModel
        .find({ tempsId: { $in: series } })
        .select(
          '_id tempsId startedAt finishedAt peakChamber peakChamberScanned',
        )
        .lean()
        .exec() as Promise<StoredCook[]>,
      this.whenEachSeriesCarriesOn(orphans),
    ]);
    // Keyed by series, which names one cook: the id is that cook's own first
    // reading's. Walked from the readings rather than from the cooks, so each
    // cook is reached holding the reading its series got back.
    const cookOf = new Map(
      cooks.map((cook) => [String(cook.tempsId), cook] as const),
    );
    return orphans.flatMap((head) => {
      const cook = cookOf.get(String(head._id));
      return this.fallsOutsideTheCook(
        head,
        cook,
        openedAt.get(String(head._id)),
      )
        ? []
        : [{ head, cook }];
    });
  }

  /**
   * Whether the restored reading is a fact about some other cook rather than
   * about this cook.
   *
   * The scans that bound a cook's stamps read the rows dated at or before its
   * finish and no others (`TimelineService.peakChambersOf`), and a stored series
   * is clipped to the same window, so a reading from outside it cannot be
   * folded into either stamp: the cook would stand claiming a beginning or a
   * peak its own chart never reaches. Only a finished cook has that boundary; a
   * cook still running has no end to fall after.
   *
   * An undated row is refused for a finished cook as well, and not because a
   * window excludes it — `cookWindow` in `TempsService` deliberately keeps
   * rows carrying no date, as does `TimelineService.readings`, which is
   * clipped by nothing at all. That is the reason rather than the objection:
   * neither guard here can place such a row — there is no moment to compare
   * against the finish and none to measure a silence from — while the read
   * that derives `GET /api/timeline/:id`'s peak would take its temperature
   * regardless of what the cook is stamped with. A row of unverifiable
   * provenance would arrive as a peak above a chart that never reaches it.
   * Under a cook still *running* the same row is restored, because nothing has
   * yet been derived over a window for it to contradict: that cook's numbers
   * are read live off the series as it stands, which is the reading this
   * repair exists to put back.
   */
  private fallsOutsideTheCook(
    head: RestoredReading,
    cook: StoredCook | undefined,
    opened: Date | null | undefined,
  ): boolean {
    if (!head.date) {
      return !!cook?.finishedAt;
    }
    if (cook?.finishedAt && head.date.getTime() > cook.finishedAt.getTime()) {
      return true;
    }
    return this.silenceSeparatesTheHead(head.date, opened);
  }

  /**
   * Whether the series' own readings put its head on the far side of a silence,
   * which answers the question the cook's stamps cannot.
   *
   * The finish stamp bounds one side of a cook and nothing bounds the other: a
   * cook still running has no end to fall after, and a cook whose start was
   * stamped from its *second* reading is a cook whose head is legitimately
   * earlier than every stamp it carries — that is the shape this repair exists
   * to move back. What tells the two apart is not a stamp but the series: a head
   * taken moments before the reading that followed it opened the cook, and one
   * taken hours before it is a power-on from another firing of the box, whose
   * date as a start would stretch the cook's recorded window across a quiet
   * nothing was cooking in (see {@link SERIES_HEAD_SILENCE_MS}).
   *
   * A head dated *after* the reading that follows it is refused by the same
   * comparison, and more simply: a first reading later than the second is a row
   * whose own series contradicts it, which places it nowhere at all.
   *
   * A series the head is the only dated row of is not separated from anything,
   * and is left to the cook's own boundary.
   */
  private silenceSeparatesTheHead(
    taken: Date,
    opened: Date | null | undefined,
  ): boolean {
    if (!opened) {
      return false;
    }
    const quiet = opened.getTime() - taken.getTime();
    return quiet < 0 || quiet > SERIES_HEAD_SILENCE_MS;
  }

  /**
   * The moment each orphan's series carries on at — a date per series id, not
   * the readings: the earliest reading of the series that is not the orphan
   * itself.
   *
   * Grouped store-side rather than read row by row: a series here is a whole
   * cook's archive — a hundred thousand rows and more — and the repair needs one
   * date from each of them, not the rows.
   */
  private async whenEachSeriesCarriesOn(
    heads: RestoredReading[],
  ): Promise<Map<string, Date | null>> {
    const opened = (await this.model
      .aggregate([
        { $match: { tempsId: { $in: heads.map(({ _id }) => String(_id)) } } },
        { $group: { _id: '$tempsId', date: { $min: '$date' } } },
      ])
      .exec()) as { _id: string; date?: Date | null }[];
    return new Map(
      opened.map(({ _id, date }) => [String(_id), date ?? null] as const),
    );
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
   * burger cook weeks later in the same series.
   *
   * Only ever raised, and only for a cook whose peak is settled: a cook that
   * carries a peak, or the mark saying its readings were searched for one, is
   * never asked again by either statistics pass, so what it carries is what it
   * will report forever. A cook that has not been scanned yet is left to that
   * scan, which now reads the whole series.
   */
  private peakRaisedTo(
    head: RestoredReading,
    cook: StoredCook,
  ): RederivedStamps {
    const settled =
      cook.peakChamberScanned === true || Number.isFinite(cook.peakChamber);
    if (!settled) {
      return {};
    }
    const restored = Number(head.ChamberTemp);
    if (!head.ChamberTemp || !Number.isFinite(restored)) {
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
