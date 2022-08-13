import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Smoke, SmokeDocument } from "./smoke.schema";
import { SmokeDto } from "./smokeDto";



@Injectable()
export class SmokeService {
    constructor(@InjectModel('Smoke')private smokeModule: Model<SmokeDocument>){}

    async create(smokeDto: SmokeDto): Promise<Smoke> {
        const createdSmoke = new this.smokeModule(smokeDto);
        return await createdSmoke.save();
    }

    async GetById(id: string): Promise<Smoke> {
        return await this.smokeModule.findById(id);
    }

    async Update(id: string, smokeDto: SmokeDto): Promise<Smoke> {
        return this.smokeModule.findOneAndUpdate({_id: id}, smokeDto).then(() => {
            return this.GetById(id);
        });
    }
}