import { Inject, Injectable, forwardRef } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Promise } from "mongoose";
import { Smoke, SmokeDocument } from "./smoke.schema";
import { SmokeDto, SmokeHistory } from "./smokeDto";
import { PreSmokeService } from "src/presmoke/presmoke.service";
import { SmokeProfileService } from "src/smokeProfile/smokeProfile.service";
import { PreSmokeDto } from "src/presmoke/presmokeDto";



@Injectable()
export class SmokeService {
    constructor(@InjectModel('Smoke')private smokeModule: Model<SmokeDocument>,
        @Inject(forwardRef(() => PreSmokeService))
        private preSmokeService: PreSmokeService,
        private smokeProfileService: SmokeProfileService,
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

    async getSmokeHistory(): Promise<SmokeHistory[]> {
        return await this.getAll().then(async smokeList => {
            let test = smokeList.map(async smoke => {
                const preSmoke =  await this.preSmokeService.GetByID(smoke.preSmokeId);
                const smokeProfile = await this.smokeProfileService.getById(smoke.smokeProfileId);
                let smokeHistory: SmokeHistory = {
                    name: preSmoke.name,
                    meatType: preSmoke.meatType,
                    date: smoke.date ? smoke.date.toDateString() : '',
                    weight: preSmoke.weight.weight ? preSmoke.weight.weight.toString() : '',
                    weightUnit: preSmoke.weight.unit,
                    woodType: smokeProfile != null ? smokeProfile.woodType : '' ,
                    smokeId: smoke["_id"]
                }
                return smokeHistory;
            });
            return Promise.all(test);
        });
    }

    async getAll(): Promise<Smoke[]>{
        return this.smokeModule.find().exec();
    }

}