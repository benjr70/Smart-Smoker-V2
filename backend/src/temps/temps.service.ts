import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { SmokeService } from "src/smoke/smoke.service";
import { SmokeDto } from "src/smoke/smokeDto";
import { StateService } from "src/State/state.service";
import { TempDto } from "./tempDto";
import { Temp, TempDocument } from "./temps.schema";

@Injectable()
export class TempsService {

    constructor(@InjectModel('Temp')private tempModel: Model<TempDocument>,
    private stateService: StateService,
    private smokeService: SmokeService){}

    async saveNewTemp(tempDto: TempDto) {
        return this.stateService.GetState().then(state => {
            if(state.smokeId.length < 0){
                return;
            }
            this.smokeService.GetById(state.smokeId).then(smoke => {
                if(smoke.tempsId){
                    tempDto.tempsId = smoke.tempsId
                    return this.create(tempDto);
                }else{
                    this.create(tempDto).then(async temp => {
                        let smokeDto: SmokeDto = {
                            preSmokeId: smoke.preSmokeId,
                            tempsId: temp["_id"].toString()
                        }
                        await this.smokeService.Update(state.smokeId, smokeDto);
                    })
                }

            })

        })
    }

    async getAllTempsCurrent(): Promise<Temp[]> {
        return this.stateService.GetState().then(state => {
            if(state.smokeId.length < 0){
                return this.smokeService.GetById(state.smokeId).then(smoke => {
                    if(smoke.tempsId && smoke.tempsId.length > 0){
                        return this.tempModel.find({tempsId: smoke.tempsId});
                    } else {
                        return [];
                    }
                })
            } else {
                return [];
            }
        })
    }

    async create(tempDto: TempDto): Promise<Temp>{
        const Temp = new this.tempModel(tempDto);
        return Temp.save();
    }
}