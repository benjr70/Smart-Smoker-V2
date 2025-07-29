import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { SmokeService } from "../smoke/smoke.service";
import { SmokeDto } from "../smoke/smokeDto";
import { StateService } from "../State/state.service";
import { PostSmoke, PostSmokeDocument } from "./postSmoke.schema";
import { PostSmokeDto } from "./postSmokeDto";

@Injectable()
export class PostSmokeService {
    constructor(@InjectModel('PostSmoke')private postSmokeModel: Model<PostSmokeDocument>,
    private stateService: StateService,
    private smokeService: SmokeService){}


    getCurrentPostSmoke(): Promise<PostSmoke>{
        return this.stateService.GetState().then(async state => {
            if(!state){
               await this.stateService.create({smokeId: '', smoking: false});
            }
            return this.smokeService.GetById(state.smokeId).then(smoke => {
                if(smoke.postSmokeId){
                    return this.postSmokeModel.findById(smoke.postSmokeId)
                } else {
                    return {notes: '', restTime: '', steps: ['']}
                }
             })
         })
    }

    async saveCurrentPostSmoke(dto: PostSmokeDto): Promise<PostSmoke> {
        let state = await this.stateService.GetState();
        if(state.smokeId.length > 0){
            let smoke = await this.smokeService.GetById(state.smokeId);
            if(smoke.postSmokeId){
                await this.update(smoke.postSmokeId, dto);
            }else {
                let postSmoke = await this.create(dto);
                let smokeDto: SmokeDto = {
                    smokeProfileId: smoke.smokeProfileId,
                    preSmokeId: smoke.preSmokeId,
                    postSmokeId: postSmoke["_id"].toString(),
                    tempsId: smoke.tempsId,
                    status: smoke.status,
                }
                await this.smokeService.Update(smoke['_id'].toString(), smokeDto);
                return postSmoke;
            }
        } else {

        }
    }

    async create(postSmokeDto: PostSmokeDto): Promise<PostSmoke> {
        const createdPostSmoke = new this.postSmokeModel(postSmokeDto);
        return createdPostSmoke.save();
    }

    async getById(id: string): Promise<PostSmoke> {
        return this.postSmokeModel.findById(id);
    }

    async update(id: string, postSmokeDto: PostSmokeDto): Promise<PostSmoke>{
        return this.postSmokeModel.findByIdAndUpdate({_id: id}, postSmokeDto).then(() => {
            return this.getById(id);
        })
    }

    async Delete(id: string) {
        return this.postSmokeModel.deleteOne({_id: id});
    }
}