import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Ratings, RatingsDocument } from "./ratings.schema";
import { Model } from "mongoose";
import { StateService } from "src/State/state.service";
import { SmokeService } from "src/smoke/smoke.service";
import { RatingsDto } from "./ratingsDto";
import { SmokeDto } from "src/smoke/smokeDto";
import { Smoke } from "src/smoke/smoke.schema";



@Injectable()
export class RatingsService {

    constructor(@InjectModel('Ratings')private ratingsModel: Model<RatingsDocument>,
    private smokeService: SmokeService)
    {}

    getCurrentRating(): Promise<Ratings> {
        return this.smokeService.getCurrentSmoke().then(smoke => {
            return this.getById(smoke.ratingId);
        })
    }

    async saveCurrentRatings(dto: RatingsDto): Promise<Ratings> {
       return this.smokeService.getCurrentSmoke().then(async smoke => {
            if(smoke.ratingId){
                await this.update(smoke.ratingId, dto);
            } else {
                let ratings = await this.create(dto);
                let smokeDto: SmokeDto = {
                    smokeProfileId: smoke.smokeProfileId,
                    preSmokeId: smoke.preSmokeId,
                    postSmokeId: smoke.postSmokeId,
                    tempsId: smoke.tempsId,
                    ratingId: ratings['_id'].toString(),
                }
                await this.smokeService.Update(smoke['_id'].toString(), smokeDto);
                return ratings;
            }
        })
    }


    async getById(id: string): Promise<Ratings> {
        return this.ratingsModel.findById(id);
    }

    async update(id: string, ratingsDto: RatingsDto): Promise<Ratings> {
        return this.ratingsModel.findByIdAndUpdate({_id: id}, ratingsDto).then(() => {
            return this.getById(id);
        })
    }

    async create(postSmokeDto: RatingsDto): Promise<Ratings> {
        const createdPostSmoke = new this.ratingsModel(postSmokeDto);
        return createdPostSmoke.save();
    }

}