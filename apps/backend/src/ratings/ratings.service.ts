import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Ratings, RatingsDocument } from './ratings.schema';
import { Model } from 'mongoose';
import { BaseService } from '../common/base.service';
import { SmokeService } from '../smoke/smoke.service';
import { RatingsDto } from './ratingsDto';
import { SmokeDto } from '../smoke/smokeDto';
import { markStatsStale } from '../stats/mark-stats-stale';
import { StatsService } from '../stats/stats.service';

@Injectable()
export class RatingsService extends BaseService<RatingsDocument> {
  constructor(
    @InjectModel('Ratings') model: Model<RatingsDocument>,
    private smokeService: SmokeService,
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

  getCurrentRating(): Promise<Ratings> {
    return this.smokeService.getCurrentSmoke().then((smoke) => {
      return this.getById(smoke.ratingId);
    });
  }

  async saveCurrentRatings(dto: RatingsDto): Promise<Ratings> {
    return this.smokeService.getCurrentSmoke().then(async (smoke) => {
      if (smoke.ratingId) {
        await this.update(smoke.ratingId, dto);
      } else {
        const ratings = await this.create(dto);
        const smokeDto: SmokeDto = {
          smokeProfileId: smoke.smokeProfileId,
          preSmokeId: smoke.preSmokeId,
          postSmokeId: smoke.postSmokeId,
          tempsId: smoke.tempsId,
          ratingId: ratings['_id'].toString(),
          status: smoke.status,
        };
        await this.smokeService.update(smoke['_id'].toString(), smokeDto);
        // Marked again, now that the cook points at the score. Between the
        // create and this update the rating exists but belongs to nobody: a
        // rebuild starting in that window would read an archive where the cook
        // is unrated and then clear the flag the create had set, losing the
        // score until something else happened to the archive.
        await this.stats.markDirty();
        return ratings;
      }
    });
  }
}
