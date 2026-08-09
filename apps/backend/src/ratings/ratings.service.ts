import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Ratings, RatingsDocument } from './ratings.schema';
import { Model } from 'mongoose';
import { BaseService } from '../common/base.service';
import { SmokeService } from '../smoke/smoke.service';
import { RatingsDto } from './ratingsDto';
import { SmokeDto } from '../smoke/smokeDto';

@Injectable()
export class RatingsService extends BaseService<RatingsDocument> {
  constructor(
    @InjectModel('Ratings') model: Model<RatingsDocument>,
    private smokeService: SmokeService,
  ) {
    super(model, 'Ratings');
  }

  /**
   * The rating on the active smoke, or `null` when there is nothing to read.
   *
   * Nullable on purpose, and in two ways: nothing may be cooking at all, and
   * an in-flight smoke may not have been rated yet. Both used to run straight
   * into a null dereference behind a non-nullable `Promise<Ratings>`.
   */
  async getCurrentRating(): Promise<Ratings | null> {
    const smoke = await this.smokeService.getCurrentSmoke();
    if (!smoke || !smoke.ratingId) {
      return null;
    }
    return this.getById(smoke.ratingId);
  }

  /**
   * Writes the rating for the active smoke, linking a freshly created one back
   * onto the aggregate. Resolves `undefined` on the update path — the caller
   * already holds the values it just sent.
   *
   * @throws NotFoundException when no smoke is active to attach the rating to.
   */
  async saveCurrentRatings(dto: RatingsDto): Promise<Ratings | undefined> {
    const smoke = await this.smokeService.getCurrentSmoke();
    if (!smoke) {
      throw new NotFoundException('No active smoke');
    }
    if (smoke.ratingId) {
      await this.update(smoke.ratingId, dto);
      return undefined;
    }
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
}
