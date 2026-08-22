import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Ratings, RatingsDocument } from './ratings.schema';
import { Model } from 'mongoose';
import { BaseService } from '../common/base.service';
import { SmokeService } from '../smoke/smoke.service';
import { RatingsDto } from './ratingsDto';
import { SmokeDto } from '../smoke/smokeDto';
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
   * The two writes are overridden rather than the callers being asked to
   * remember: the current cook's rating is saved through this service, an old
   * cook's is updated by id straight from the review screen, and a rule about
   * what a rating write means to the statistics is this service's to keep.
   *
   * Marked, not recomputed. The four sliders auto-save as they are dragged, so
   * a rating is written many times a minute; a flag write is cheap and the next
   * stats read rebuilds once for all of them.
   */
  async create(dto: Partial<RatingsDocument>): Promise<RatingsDocument> {
    const created = await super.create(dto);
    await this.stats.markDirty();
    return created;
  }

  async update(
    id: string,
    dto: Partial<RatingsDocument>,
  ): Promise<RatingsDocument> {
    const updated = await super.update(id, dto);
    await this.stats.markDirty();
    return updated;
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
        return ratings;
      }
    });
  }
}
