import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PreSmoke, PreSmokeDocument } from './presmoke.schema';
import { PreSmokeDto } from './presmokeDto';

@Injectable()
export class PreSmokeService {
    constructor(@InjectModel(PreSmoke.name)private presmokeModel: Model<PreSmokeDocument>){}

    async create(preSmokeDto: PreSmokeDto): Promise<PreSmoke>{
        const createdSettings = new this.presmokeModel(preSmokeDto);
        return createdSettings.save();
    }

    async findAll(): Promise<PreSmokeDto[]> {
        return this.presmokeModel.find().exec();
    }
}