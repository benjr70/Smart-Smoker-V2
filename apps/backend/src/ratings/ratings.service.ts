import { Injectable } from '@nestjs/common';
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
