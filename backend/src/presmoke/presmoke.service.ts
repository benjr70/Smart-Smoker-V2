import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PreSmoke, PreSmokeDocument } from './presmoke.schema';
import { PreSmokeDto } from './presmokeDto';

@Injectable()
export class PreSmokeService {
    constructor(@InjectModel(PreSmoke.name)private preSmokeModel: Model<PreSmokeDocument>){}

    async create(preSmokeDto: PreSmokeDto): Promise<PreSmoke>{
        const createdPreSmoke = new this.preSmokeModel(preSmokeDto);
        return createdPreSmoke.save();
    }

    async findAll(): Promise<PreSmokeDto[]> {
        return this.preSmokeModel.find().exec();
    }

    async GetByID(id: string): Promise<PreSmoke> {
        return this.preSmokeModel.findById(id);   
    }

    async Update(id: string, preSmokeDto: PreSmokeDto): Promise<PreSmoke> {
        return this.preSmokeModel.findOneAndUpdate({_id: id}, preSmokeDto).then(() => {
            return this.GetByID(id);
        });
    }

    async Delete(id: string) {
        return this.preSmokeModel.deleteOne({_id: id});
    }
}