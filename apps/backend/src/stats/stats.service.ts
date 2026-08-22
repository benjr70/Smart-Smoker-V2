import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PostSmokeDocument } from '../postSmoke/postSmoke.schema';
import { PreSmoke, PreSmokeDocument } from '../presmoke/presmoke.schema';
import { RatingsDocument } from '../ratings/ratings.schema';
import { SmokeDocument, SmokeStatus } from '../smoke/smoke.schema';
import { SmokeProFileDocument } from '../smokeProfile/smokeProfile.schema';
import { TimelineService } from '../timeline/timeline.service';
import { CookRecord, aggregateStats } from './stats.aggregate';
import { StatsDto } from './stats.dto';
import { StatsSnapshot, StatsSnapshotDocument } from './stats.schema';

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

    const preSmokeById = byId(preSmokes);
    const profileById = byId(profiles);
    const postSmokeById = byId(postSmokes);
    const ratingById = byId(ratings);
    // Every cook's length in one grouped read of the temperatures rather than a
    // pair of queries per cook: asked one at a time, the cheapest read on the
    // screen would be the one that grew with the archive.
    const durations = await this.timelineService.getDurationsMs(smokes);

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
        // The hottest the chamber ran is stamped onto a cook at finish by a
        // later slice; until then no cook carries one, and the record it
        // would hold stays empty rather than being invented here.
        peakChamber: null,
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
