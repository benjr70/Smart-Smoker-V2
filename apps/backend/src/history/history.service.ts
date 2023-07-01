import { Injectable } from "@nestjs/common";
import { PreSmokeService } from "src/presmoke/presmoke.service";
import { RatingsService } from "src/ratings/ratings.service";
import { SmokeService } from "src/smoke/smoke.service";
import { SmokeProfileService } from "src/smokeProfile/smokeProfile.service";
import { SmokeHistory } from "./histroyDto";



@Injectable()
export class HistoryService {
    constructor(
        private smokeService: SmokeService,
        private preSmokeService: PreSmokeService,
        private smokeProfileService: SmokeProfileService,
        private ratingsService: RatingsService,
    ){}

    async getHistory(): Promise<SmokeHistory[]> {
        return this.smokeService.getAll().then(smokeList => {
            return Promise.all(smokeList.map(async smoke => {
                const preSmoke = await this.preSmokeService.GetByID(smoke.preSmokeId);
                const smokeProfile = await this.smokeProfileService.getById(smoke.smokeProfileId);
                const ratings = await this.ratingsService.getById(smoke.ratingId);
                const smokeHistory: SmokeHistory = {
                    name: preSmoke ? preSmoke.name : '',
                    meatType: preSmoke ? preSmoke.meatType: '',
                    date: smoke.date ? smoke.date.toDateString() : '',
                    weight: (preSmoke && preSmoke.weight.weight) ? preSmoke.weight.weight.toString() : '',
                    weightUnit: preSmoke ? preSmoke.weight.unit : '',
                    woodType: smokeProfile != null ? smokeProfile.woodType : '' ,
                    smokeId: smoke["_id"],
                    overAllRating: (ratings && ratings.overallTaste) ? ratings.overallTaste.toString() : '',
                }
                return smokeHistory;
            }))
        })
    }
}