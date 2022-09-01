import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { SmokeService } from "src/smoke/smoke.service";
import { SmokeDto } from "src/smoke/smokeDto";
import { StateService } from "src/State/state.service";
import { SmokeProfile, SmokeProFileDocument } from "./smokeProfile.schema";
import { SmokeProFileDto } from "./smokeProfileDto";


@Injectable()
export class SmokeProfileService {
    constructor(@InjectModel('SmokeProfile')private smokeProfileModel: Model<SmokeProFileDocument>,
    private stateService: StateService,
    private smokeService: SmokeService){}

    async getCurrentSmokeProfile(): Promise<SmokeProfile>{
        return this.stateService.GetState().then(async state => {
            if(!state){
               await this.stateService.create({smokeId: '', smoking: false});
            }
            return this.smokeService.GetById(state.smokeId).then(smoke => {
                 return this.smokeProfileModel.findById(smoke.smokeProfileId)
             })
         })
    }

    async saveCurrentSmokeProfile(dto: SmokeProFileDto): Promise<SmokeProfile> {
        let state = await this.stateService.GetState();
        if(state.smokeId.length > 0){
            let smoke = await this.smokeService.GetById(state.smokeId);
            if(smoke.smokeProfileId){
                await this.update(smoke.smokeProfileId, dto);
            }else {
                let smokeProfile = await this.create(dto);
                let smokeDto: SmokeDto = {
                    smokeProfileId: smokeProfile["_id"],
                    preSmokeId: smoke.preSmokeId,
                    postSmokeId: smoke.postSmokeId,
                    tempsId: smoke.tempsId,
                }
                await this.smokeService.Update(smoke['_id'], smokeDto);
                return smokeProfile;
            }
        } else {

        }
    }

    async create(smokeProfileDto: SmokeProFileDto): Promise<SmokeProfile> {
        const createdSmokeProfile = new this.smokeProfileModel(smokeProfileDto);
        return createdSmokeProfile.save();
    }

    async getById(id: string): Promise<SmokeProfile> {
        return this.smokeProfileModel.findById(id);
    }

    async update(id: string, smokeProfileDto: SmokeProFileDto): Promise<SmokeProfile>{
        return this.smokeProfileModel.findByIdAndUpdate({_id: id}, smokeProfileDto).then(() => {
            return this.getById(id);
        })
    }
}