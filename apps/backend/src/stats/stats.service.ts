import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { withSettingsDefaults } from '../appSettings/app-settings.defaults';
import {
  ApplicationSettings,
  ApplicationSettingsDocument,
} from '../appSettings/app-settings.schema';
import { PostSmokeDocument } from '../postSmoke/postSmoke.schema';
import { PreSmoke, PreSmokeDocument } from '../presmoke/presmoke.schema';
import { RatingsDocument } from '../ratings/ratings.schema';
import { SmokeDocument, SmokeStatus } from '../smoke/smoke.schema';
import { SmokeProFileDocument } from '../smokeProfile/smokeProfile.schema';
import {
  ScannedCookWindow,
  TimelineService,
} from '../timeline/timeline.service';
import { CookRecord, aggregateStats } from './stats.aggregate';
import { StatsDto } from './stats.dto';
import { StatsSnapshot, StatsSnapshotDocument } from './stats.schema';

/**
 * One cook's peak stamp as a bulk write carries it: the mark that its readings
 * were searched, and the peak where the search found one.
 *
 * Spelled out rather than inferred at the call because Mongoose's own bulk
 * operation type is a union wide enough that resolving an inline literal
 * against it costs the compiler more than the whole rest of this file.
 */
interface PeakStamp {
  updateOne: {
    filter: { _id: unknown };
    update: {
      $set: { peakChamberScanned: true; peakChamber?: number };
    };
  };
}

/**
 * One cook's window as a bulk write carries it: the two stamps that say when it
 * ran, and the peak re-scanned inside them.
 *
 * Spelled out for the same reason {@link PeakStamp} is — Mongoose's own bulk
 * operation type is wide enough that resolving an inline literal against it is
 * the most expensive thing in this file for the compiler.
 */
interface WindowStamp {
  updateOne: {
    filter: { _id: unknown };
    update: {
      $set: {
        startedAt: Date;
        finishedAt: Date;
        peakChamberScanned: true;
        peakChamber?: number;
      };
      /**
       * How a peak that came from outside the cook's window is taken off it —
       * see {@link StatsService.stampCookWindows}. A stamp that found one
       * inside the window carries no `$unset` at all, because Mongo rejects an
       * update that both sets and unsets the same path.
       */
      $unset?: { peakChamber: '' };
    };
  };
}

const MS_PER_HOUR = 60 * 60 * 1000;

/** Documents by id, for joining a parent to the children it points at. */
const byId = <T extends { _id?: unknown }>(docs: T[]): Map<string, T> =>
  new Map(docs.map((doc) => [String(doc._id), doc]));

/**
 * The lifetime statistics of everything that has been cooked.
 *
 * Owns its collections directly rather than depending on the five feature
 * services, for the reason the timeline module does: those services read one
 * document at a time, which is a query per cook per stage, and this read wants
 * every cook at once. The children come back in one query per collection —
 * an `$in` over the ids the completed smokes point at — and every cook's length
 * in one grouped read of the temperatures, so the whole archive costs six reads
 * however many cooks are in it.
 *
 * The arithmetic is not here: joining is this module's job, and every rule
 * about what the numbers mean belongs to the pure aggregator, which has no
 * database to hide behind.
 */
@Injectable()
export class StatsService {
  constructor(
    @InjectModel('Smoke') private readonly smokeModel: Model<SmokeDocument>,
    @InjectModel(PreSmoke.name)
    private readonly preSmokeModel: Model<PreSmokeDocument>,
    @InjectModel('SmokeProfile')
    private readonly smokeProfileModel: Model<SmokeProFileDocument>,
    @InjectModel('PostSmoke')
    private readonly postSmokeModel: Model<PostSmokeDocument>,
    @InjectModel('Ratings')
    private readonly ratingsModel: Model<RatingsDocument>,
    @InjectModel(StatsSnapshot.name)
    private readonly snapshotModel: Model<StatsSnapshotDocument>,
    /**
     * Where the silence that ends a cook is configured. The backfill cuts a
     * polluted series at the same threshold the live auto-stop uses, so the two
     * cannot call different gaps "the cook is over".
     */
    @InjectModel(ApplicationSettings.name)
    private readonly settingsModel: Model<ApplicationSettingsDocument>,
    private readonly timelineService: TimelineService,
  ) {}

  /**
   * Everything the Stats screen shows — the stored aggregate, recomputed only
   * when the archive it was derived from is no longer the archive there is.
   */
  async getStats(): Promise<StatsDto> {
    const stored = await this.snapshotModel.findOne({}).exec();
    if (!stored || stored.dirty || !stored.aggregate) {
      return this.recalculate();
    }
    // The only query the served path costs: a count, not a read of the cooks.
    // It is the second of two guards and the weaker one — every service whose
    // documents feed these numbers marks the aggregate stale when it writes
    // one (see {@link markStatsStale}), because an edited weight or a deleted
    // score leaves this count exactly where it was. What the count catches is
    // what nothing announced at all: a restored backup, a row changed by hand.
    const completed = await this.completedCount();
    return completed === stored.completedSmokes
      ? stored.aggregate
      : this.recalculate();
  }

  /**
   * Compute the archive's statistics from scratch and store them.
   *
   * Always a full recompute — the triggers say *that* something changed, never
   * what, and arithmetic that adjusts a stored total by a delta is arithmetic
   * that can drift. Recomputing everything makes every rebuild idempotent and
   * every stored aggregate self-correcting.
   */
  async recalculate(): Promise<StatsDto> {
    // Read before the archive is read, so anything that declares the archive
    // stale from here on is known to have landed after this computation saw it.
    const before = await this.snapshotModel.findOne({}).exec();
    const revision = before?.revision ?? 0;

    const aggregate = aggregateStats(await this.joinedCooks());
    const computed = {
      aggregate,
      // What it was derived from, so the guard compares against the archive
      // this run actually saw.
      completedSmokes: aggregate.totalSessions,
      computedAt: new Date(),
    };

    // Clearing the flag is a claim that the stored numbers account for
    // everything that has been declared stale — true only if nothing was
    // declared stale while the cooks were being read, which is what matching
    // on the revision asks.
    const claimed = await this.snapshotModel
      .updateOne(
        { revision },
        { $set: { ...computed, dirty: false } },
        { upsert: !before },
      )
      .exec();
    if (claimed.matchedCount === 0 && !claimed.upsertedCount) {
      // Something changed the numbers mid-read. These are still better numbers
      // than the ones stored, so they are kept — but the flag stands, and the
      // next read rebuilds over the change this one missed.
      await this.snapshotModel.updateOne({}, { $set: computed }).exec();
    }
    return aggregate;
  }

  /**
   * Record that the stored aggregate no longer matches the archive, without
   * recomputing it.
   *
   * For the writes that are too frequent to recompute behind: a rating's four
   * sliders auto-save as they are dragged, and a rebuild per save would grind
   * the whole archive a dozen times for one cook's score. The next stats read
   * rebuilds once and clears this.
   */
  async markDirty(): Promise<void> {
    await this.snapshotModel
      .updateOne(
        {},
        // The counter is bumped with the flag so that a rebuild already in
        // flight can tell this write happened behind its back and leave the
        // flag standing for the read after it.
        { $set: { dirty: true }, $inc: { revision: 1 } },
        { upsert: true },
      )
      .exec();
  }

  /**
   * Give every finished cook whose readings have never been searched for a peak
   * chamber temperature one, and record on the cook that they now have been.
   *
   * The backfill is lazy rather than a deploy-time migration: a cook's series
   * never changes after it is finished, so the peak computed here is the peak
   * forever, and writing it back means the temperature archive is scanned at
   * most once per cook — by whichever rebuild happened to meet it first.
   *
   * "Searched" is what is recorded, not merely "found": a series holding no
   * readable chamber reading yields no peak, and a cook left with neither a
   * peak nor a mark would be indistinguishable from one nobody had asked yet,
   * so every future rebuild would ask its readings again for the same nothing.
   * It is marked and left without a peak instead — a stamped zero would be a
   * claim about how the cook ran, and the cook must still hold no record.
   *
   * The stamps go back in a single `bulkWrite` rather than an update apiece:
   * this runs inside a `GET /stats`, and the first rebuild over a legacy
   * archive would otherwise fire as many concurrent round trips as there are
   * cooks in it.
   *
   * Returns what was computed, so the caller need not re-read the documents it
   * already holds.
   */
  private async stampMissingPeaks(
    smokes: SmokeDocument[],
  ): Promise<Map<string, number>> {
    const unsearched = smokes.filter(
      (smoke) =>
        !smoke.peakChamberScanned && !Number.isFinite(smoke.peakChamber),
    );
    const withSeries = unsearched.filter((smoke) => Boolean(smoke.tempsId));
    if (withSeries.length === 0) {
      return new Map();
    }
    const peaks = await this.timelineService.peakChambersOf([
      ...new Set(withSeries.map((smoke) => String(smoke.tempsId))),
    ]);
    const stamped = new Map<string, number>();
    const stamps: PeakStamp[] = withSeries.map((smoke) => {
      const peak = peaks.get(String(smoke.tempsId));
      if (peak !== undefined) {
        stamped.set(String(smoke['_id']), peak);
      }
      return {
        updateOne: {
          filter: { _id: smoke['_id'] },
          update: {
            $set: {
              peakChamberScanned: true,
              ...(peak === undefined ? {} : { peakChamber: peak }),
            },
          },
        },
      };
    });
    await this.smokeModel.bulkWrite(
      stamps as unknown as Parameters<Model<SmokeDocument>['bulkWrite']>[0],
    );
    return stamped;
  }

  /**
   * Give every finished cook that was never stamped with a finish the window
   * its readings say it ran in, and re-scan its peak inside that window.
   *
   * The damage this repairs is a session nobody ended: its smoking flag stayed
   * on, so the next power-on of the box — days or weeks later, sometimes just to
   * grill burgers — recorded into the same series, and a cook whose length is
   * derived from the two ends of its series is then reported as having run for
   * a fortnight. The readings themselves say where the cook stopped: they arrive
   * every few seconds while one runs, so the first silence longer than the
   * auto-stop threshold is the end of it (see the `cook-window` module).
   *
   * The peak is re-scanned even for a cook that already carries one, and this
   * is the one place that overwrites a stamped peak: the peaks backfilled
   * before this existed were scanned over the whole polluted series, so a grill
   * firing at 400°F stands recorded as the peak of a 225°F brisket smoke. A
   * peak scanned inside the cook's own window is the only one that is a fact
   * about the cook.
   *
   * Where the window holds no readable chamber reading the stored peak is
   * *removed* rather than left standing. Leaving it would keep the one number
   * this pass exists to correct — a peak that can only have come from outside
   * the window, since inside it there was nothing to read — and would keep it
   * unchallengeable, because the same write records the cook as scanned. It
   * would also make the repair disagree with itself: this rebuild reports the
   * cook as having no peak while the next one reads the stray value back off
   * the document. The cook holds no record instead, which is what a cook that
   * recorded nothing readable has always held.
   *
   * Nothing is deleted. The stray rows stay exactly where they are and are
   * excluded by the stamps, so a repair can always be revisited against the raw
   * data.
   *
   * Idempotent by construction: what it writes is what excludes a cook from the
   * next run of it, so a second rebuild over a stamped archive reads no
   * readings and writes nothing.
   *
   * Returns what it stamped, keyed by cook, so the caller need not re-read the
   * documents it already holds.
   */
  private async stampCookWindows(
    smokes: SmokeDocument[],
  ): Promise<Map<string, ScannedCookWindow>> {
    // The finish is what the pollution corrupts and what the window is cut to,
    // so a cook that carries one has been stopped honestly — by the user or by
    // the auto-stop — and is left alone. A start it may still be missing is
    // filled in below from the same window.
    const unstamped = smokes.filter(
      (smoke) => Boolean(smoke.tempsId) && !smoke.finishedAt,
    );
    if (unstamped.length === 0) {
      return new Map();
    }
    const windows = await this.timelineService.cookWindowsOf(
      [...new Set(unstamped.map((smoke) => String(smoke.tempsId)))],
      await this.idleThresholdMs(),
    );
    const stamped = new Map<string, ScannedCookWindow>();
    const stamps: WindowStamp[] = [];
    unstamped.forEach((smoke) => {
      const window = windows.get(String(smoke.tempsId));
      if (!window) {
        // A cook whose series holds no dated reading has no window to stamp,
        // and is left as it was: there is nothing to say about when it ran.
        return;
      }
      const scanned: ScannedCookWindow = {
        // A start that was recorded stands: it is a fact about the cook, where
        // the window's start is only its first surviving reading.
        startedAt: smoke.startedAt ?? window.startedAt,
        finishedAt: window.finishedAt,
        peakChamber: window.peakChamber,
      };
      stamped.set(String(smoke['_id']), scanned);
      stamps.push({
        updateOne: {
          filter: { _id: smoke['_id'] },
          update: {
            $set: {
              startedAt: scanned.startedAt,
              finishedAt: scanned.finishedAt,
              // Recorded as searched whatever the window held, for the reason
              // {@link stampMissingPeaks} records it: a cook left with neither
              // a peak nor the mark would be scanned again by every rebuild.
              peakChamberScanned: true,
              ...(scanned.peakChamber === null
                ? {}
                : { peakChamber: scanned.peakChamber }),
            },
            ...(scanned.peakChamber === null
              ? { $unset: { peakChamber: '' as const } }
              : {}),
          },
        },
      });
    });
    if (stamps.length === 0) {
      return new Map();
    }
    await this.smokeModel.bulkWrite(
      stamps as unknown as Parameters<Model<SmokeDocument>['bulkWrite']>[0],
    );
    return stamped;
  }

  /**
   * How long a cook's readings may be silent before the silence is taken to be
   * the end of it — the auto-stop's threshold, which the backfill cuts by so
   * that a live stop and a repaired legacy cook mean the same thing by "over".
   *
   * A stored document written before the setting existed reads as the shipped
   * default rather than as nothing, which would compare as "never silent" and
   * leave every polluted cook exactly as it is.
   */
  private async idleThresholdMs(): Promise<number> {
    const stored = await this.settingsModel.findOne().exec();
    return withSettingsDefaults(stored).autoStop.idleHours * MS_PER_HOUR;
  }

  /** How many finished cooks the archive holds, counted rather than read. */
  private async completedCount(): Promise<number> {
    return this.smokeModel
      .countDocuments({ status: SmokeStatus.Complete })
      .exec();
  }

  /**
   * Every completed cook, with what its five documents say about it.
   *
   * In-progress cooks are excluded in the query rather than afterwards: a cook
   * on the smoker is not part of anybody's statistics, and reading its children
   * only to drop them would be four wasted joins.
   */
  private async joinedCooks(): Promise<CookRecord[]> {
    const smokes = await this.smokeModel
      .find({ status: SmokeStatus.Complete })
      .exec();
    if (smokes.length === 0) {
      return [];
    }

    const ids = (field: keyof SmokeDocument): string[] =>
      smokes
        .map((smoke) => smoke[field] as unknown as string)
        .filter((id): id is string => Boolean(id));

    const [preSmokes, profiles, postSmokes, ratings] = await Promise.all([
      this.preSmokeModel.find({ _id: { $in: ids('preSmokeId') } }).exec(),
      this.smokeProfileModel
        .find({ _id: { $in: ids('smokeProfileId') } })
        .exec(),
      this.postSmokeModel.find({ _id: { $in: ids('postSmokeId') } }).exec(),
      this.ratingsModel.find({ _id: { $in: ids('ratingId') } }).exec(),
    ]);

    // Before anything is joined, the archive heals itself. First the cooks
    // nobody ended: their honest window is stamped on and their peak re-scanned
    // inside it.
    const windows = await this.stampCookWindows(smokes);
    // Then the peaks of cooks finished before peaks were stamped, so this is
    // the last time their readings are ever looked at. The cooks the window
    // pass just stamped are held back from it: their peak has been scanned, in
    // bounds, and this scan is the unbounded one whose answers that pass exists
    // to correct.
    const backfilled = await this.stampMissingPeaks(
      smokes.filter((smoke) => !windows.has(String(smoke['_id']))),
    );
    const preSmokeById = byId(preSmokes);
    const profileById = byId(profiles);
    const postSmokeById = byId(postSmokes);
    const ratingById = byId(ratings);
    // Every cook's length in one grouped read of the temperatures rather than a
    // pair of queries per cook: asked one at a time, the cheapest read on the
    // screen would be the one that grew with the archive.
    // Asked of the cooks as the stamps just written leave them, rather than as
    // they were read: a cook stamped a moment ago would otherwise have its
    // length derived from the polluted series all over again.
    const durations = await this.timelineService.getDurationsMs(
      smokes.map((smoke) => ({
        ...(windows.get(String(smoke['_id'])) ?? {
          startedAt: smoke.startedAt,
          finishedAt: smoke.finishedAt,
        }),
        tempsId: smoke.tempsId,
        status: smoke.status,
      })),
    );

    return smokes.map((smoke, index) => {
      const preSmoke = preSmokeById.get(String(smoke.preSmokeId));
      const profile = profileById.get(String(smoke.smokeProfileId));
      const postSmoke = postSmokeById.get(String(smoke.postSmokeId));
      const rating = ratingById.get(String(smoke.ratingId));
      return {
        smokeId: String(smoke['_id']),
        completed: smoke.status === SmokeStatus.Complete,
        date: smoke.date ? new Date(smoke.date) : null,
        name: preSmoke?.name ?? null,
        meatType: preSmoke?.meatType ?? null,
        weight: preSmoke?.weight?.weight ?? null,
        weightUnit: preSmoke?.weight?.unit ?? null,
        woodType: profile?.woodType ?? null,
        restTime: postSmoke?.restTime ?? null,
        // Stamped where the cook was stamped, derived from its first and last
        // readings where it was not — which is what puts cooks recorded
        // before the stamps existed into the totals rather than out of them.
        durationMs: durations[index],
        // Stamped at finish, or backfilled just now for a cook finished before
        // the stamp existed. A cook that recorded no readable chamber reading
        // has none, and holds no record rather than holding one with a zero.
        //
        // A stored value that is not a temperature is read as no value at all,
        // which is the same test the backfill decides by — anything looser
        // would shadow the peak that very backfill just computed.
        // A window re-scanned just now wins over anything stored: the stored
        // value may be the peak of a stray firing that happened after the cook.
        peakChamber: windows.has(String(smoke['_id']))
          ? windows.get(String(smoke['_id']))?.peakChamber ?? null
          : Number.isFinite(smoke.peakChamber)
          ? (smoke.peakChamber as number)
          : backfilled.get(String(smoke['_id'])) ?? null,
        ratings: rating
          ? {
              smokeFlavor: rating.smokeFlavor ?? null,
              seasoning: rating.seasoning ?? null,
              tenderness: rating.tenderness ?? null,
              overallTaste: rating.overallTaste ?? null,
            }
          : null,
      };
    });
  }
}
