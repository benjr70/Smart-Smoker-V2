import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { State, StateDocument } from "./state.schema";
import { StateDto } from "./stateDto";


@Injectable()
export class StateService {
    constructor(@InjectModel('state')private stateModel: Model<StateDocument>){}

    async create(stateDto: StateDto): Promise<State> {
        const createdState = new this.stateModel(stateDto);
        return createdState.save();
    }

    async GetState(id: string): Promise<State> {
        return this.stateModel.findById(id);
    }

    async update(id: string, stateDto: StateDto): Promise<State> {
        return this.stateModel.findOneAndUpdate({_id: id}, stateDto).then(() => {
            return this.GetState(id);
        })
    }
    
}