import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Smoke, SmokeDocument, SmokeStatus } from "./smoke.schema";
import { SmokeDto } from "./smokeDto";
import { StateService } from "src/State/state.service";



@Injectable()
export class SmokeService {
    constructor(@InjectModel('Smoke')private smokeModule: Model<SmokeDocument>,
        private stateService: StateService,
    ){}

    async create(smokeDto: SmokeDto): Promise<Smoke> {
        smokeDto.date = new Date();
        const createdSmoke = new this.smokeModule(smokeDto);
        return await createdSmoke.save();
    }

    async GetById(id: string): Promise<Smoke> {
        return await this.smokeModule.findById(id);
    }

    async Update(id: string, smokeDto: SmokeDto): Promise<Smoke> {
        return this.smokeModule.findOneAndUpdate({_id: id.toString()}, smokeDto).then(() => {
            return this.GetById(id);
        });
    }

    async getAll(): Promise<Smoke[]>{
        return this.smokeModule.find().exec();
    }

    async Delete(id: string) {
        return this.smokeModule.deleteOne({_id: id});
    }

    async getCurrentSmoke(): Promise<Smoke> {
        return this.stateService.GetState().then(state => {
            return this.GetById(state.smokeId);
        })
    }

    async FinishSmoke(): Promise<Smoke> {
        return await this.getCurrentSmoke().then(async smoke => {
            let smokeDto: SmokeDto = {
                smokeProfileId: smoke.smokeProfileId,
                preSmokeId: smoke.preSmokeId,
                postSmokeId: smoke.postSmokeId,
                tempsId: smoke.tempsId,
                ratingId: smoke.ratingId,
                status: SmokeStatus.Complete,
            }
            return await this.Update(smoke['_id'].toString(), smokeDto);
        })
    }

}