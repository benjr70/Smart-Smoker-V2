import { Inject, Injectable, forwardRef } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Promise } from "mongoose";
import { Smoke, SmokeDocument } from "./smoke.schema";
import { SmokeDto } from "./smokeDto";
import { PreSmokeService } from "src/presmoke/presmoke.service";
import { SmokeProfileService } from "src/smokeProfile/smokeProfile.service";
import { PreSmokeDto } from "src/presmoke/presmokeDto";
import { PreSmoke } from "src/presmoke/presmoke.schema";
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

}