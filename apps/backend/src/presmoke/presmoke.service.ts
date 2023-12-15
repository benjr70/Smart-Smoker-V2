import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SmokeService } from 'src/smoke/smoke.service';
import { SmokeDto } from 'src/smoke/smokeDto';
import { StateService } from 'src/State/state.service';
import { PreSmoke, PreSmokeDocument } from './presmoke.schema';
import { PreSmokeDto } from './presmokeDto';
import { SmokeStatus } from 'src/smoke/smoke.schema';

@Injectable()
export class PreSmokeService {
    constructor(@InjectModel(PreSmoke.name)private preSmokeModel: Model<PreSmokeDocument>,
                private stateService: StateService,
                private smokeService: SmokeService){}

    async save(preSmokeDto: PreSmokeDto): Promise<PreSmoke>{
        return this.stateService.GetState().then( state => {
            if( state.smokeId.length > 0){
               return this.smokeService.GetById(state.smokeId).then(smoke => {
                    if(smoke.preSmokeId){
                        return this.Update(smoke.preSmokeId, preSmokeDto);
                    } else {
                        return this.create(preSmokeDto).then(preSmoke =>{
                            let smokeDto: SmokeDto = {
                                preSmokeId: preSmoke["_id"].toString(),
                                status: smoke.status,
                            }
                             this.smokeService.create(smokeDto);
                             return preSmoke
                        })
                    }
                })
            } else {
               return this.create(preSmokeDto).then(preSmoke => {
                    let smokeDto: SmokeDto = {
                        preSmokeId: preSmoke["_id"].toString(),
                        status: SmokeStatus.InProgress
                      }
                    this.smokeService.create(smokeDto).then(smoke => {
                        state.smokeId = smoke["_id"].toString();
                        this.stateService.update(state);
                    })
                    return preSmoke;
                })
            }
        })
    }

    async create(preSmokeDto: PreSmokeDto): Promise<PreSmoke>{
        const createdPreSmoke = new this.preSmokeModel(preSmokeDto);
        return createdPreSmoke.save();
    }

    async findAll(): Promise<PreSmokeDto[]> {
        return this.preSmokeModel.find().exec();
    }

    async GetByID(id: string): Promise<PreSmoke> {
        return await this.preSmokeModel.findById(id);   
    }

    
    async GetByCurrent(): Promise<PreSmoke> {
        return this.stateService.GetState().then(async state => {
            if(!state){
               await this.stateService.create({smokeId: '', smoking: false});
            }
            return this.smokeService.GetById(state.smokeId).then(smoke => {
                 return this.preSmokeModel.findById(smoke.preSmokeId)
             })
         })
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