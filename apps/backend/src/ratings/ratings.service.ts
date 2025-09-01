import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Ratings, RatingsDocument } from './ratings.schema';
import { Model } from 'mongoose';
import { StateService } from '../State/state.service';
import { SmokeService } from '../smoke/smoke.service';
import { RatingsDto } from './ratingsDto';
import { SmokeDto } from '../smoke/smokeDto';
import { Smoke } from '../smoke/smoke.schema';

@Injectable()
export class RatingsService {
  constructor(
    @InjectModel('Ratings') private ratingsModel: Model<RatingsDocument>,
    private smokeService: SmokeService,
  ) {}

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
        await this.smokeService.Update(smoke['_id'].toString(), smokeDto);
        return ratings;
      }
    });
  }

  async getById(id: string): Promise<Ratings> {
    return this.ratingsModel.findById(id);
  }

  async Delete(id: string) {
    return this.ratingsModel.deleteOne({ _id: id });
  }

  async update(id: string, ratingsDto: RatingsDto): Promise<Ratings> {
    return this.ratingsModel
      .findByIdAndUpdate({ _id: id }, ratingsDto)
      .then(() => {
        return this.getById(id);
      });
  }

  async create(postSmokeDto: RatingsDto): Promise<Ratings> {
    const createdPostSmoke = new this.ratingsModel(postSmokeDto);
    return createdPostSmoke.save();
  }
}
