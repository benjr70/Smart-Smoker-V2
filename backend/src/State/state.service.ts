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

    async GetState(): Promise<State> {
        return await (await this.stateModel.find().exec())[0];
    }

    async update( stateDto: State): Promise<State> {
        const state = await this.GetState()
        return this.stateModel.findOneAndUpdate({_id: state["_id"]}, stateDto).then(() => {
            return this.GetState();
        })
    }

    async toggleSmoking(): Promise<State> {
        const state = await this.GetState()
        if(state.smoking){
            state.smoking = false;
        } else {
            state.smoking = true;
        }
        return this.update(state);
    }
    

    clearSmoke(){
        let stateDto: StateDto ={
            smokeId: '',
            smoking: false,
        }
        return this.update(stateDto);
    }
}