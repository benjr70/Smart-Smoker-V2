import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Ratings, RatingsDocument } from './ratings.schema';
import { Model } from 'mongoose';
import { BaseService } from '../common/base.service';
import { childIdOf } from '../activeCook/active-cook';
import { ActiveCookService } from '../activeCook/active-cook.service';
import { RatingsDto } from './ratingsDto';
import { markStatsStale } from '../stats/mark-stats-stale';
import { StatsService } from '../stats/stats.service';

@Injectable()
export class RatingsService extends BaseService<RatingsDocument> {
  constructor(
    @InjectModel('Ratings') model: Model<RatingsDocument>,
    private readonly activeCook: ActiveCookService,
    private readonly stats: StatsService,
  ) {
    super(model, 'Ratings');
  }

  /**
   * A score is an ingredient of the statistics, so writing one leaves them
   * stale — whichever way it was written.
   *
   * Said here rather than by the callers: the current cook's rating is saved
   * through this service, an old cook's is updated by id straight from the
   * review screen, and a score can be deleted outright — and a deleted score
   * changes the averages while leaving the number of completed cooks exactly
   * as the stored aggregate was told it would be.
   */
  protected async afterWrite(): Promise<void> {
    await markStatsStale(this.stats, 'rating');
  }

  /**
   * The score of the cook in progress, or `null` where there is none.
   *
   * A cook is scored as soon as it gains a smoke profile (see the seed in
   * `SmokeProfileService`), so an unscored read means a session that has not
   * opened yet — a fact about the session rather than a failure of the request,
   * which is how every other "current child" read answers it.
   */
  async getCurrentRating(): Promise<Ratings | null> {
    const ratingId = childIdOf(await this.activeCook.resolve(), 'ratingId');
    return ratingId ? this.getById(ratingId) : null;
  }

  async saveCurrentRatings(dto: RatingsDto): Promise<Ratings> {
    return this.activeCook.attach<Ratings>('ratingId', {
      update: (id) => this.update(id, dto),
      create: async () => {
        const created = await this.create(dto);
        return { result: created, childId: created['_id'].toString() };
      },
      // Marked again, now that the cook points at the score. Between the
      // create and the link the rating exists but belongs to nobody: a
      // rebuild starting in that window would read an archive where the cook
      // is unrated and then clear the flag the create had set, losing the
      // score until something else happened to the archive.
      onFirstAttach: () => markStatsStale(this.stats, 'rating link'),
    });
  }
}
