import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '../common/base.service';
import { State, StateDocument } from './state.schema';
import { StateDto } from './stateDto';

@Injectable()
export class StateService extends BaseService<StateDocument> {
  constructor(@InjectModel('state') model: Model<StateDocument>) {
    super(model, 'state');
  }

  async GetState(): Promise<State> {
    return (await this.model.find().exec())[0];
  }

  /**
   * Singleton write for the one-and-only state document. Distinct from the
   * inherited by-id `update(id, dto)` — callers never carry a state id, so this
   * discovers (or self-heals) the singleton, then updates it.
   */
  async updateCurrent(stateDto: State): Promise<State> {
    const state = await this.GetState();
    if (!state) {
      // Create a new state if none exists
      return this.create(stateDto);
    }
    return this.model
      .findOneAndUpdate({ _id: state['_id'].toString() }, stateDto)
      .then(() => {
        return this.GetState();
      });
  }

  async toggleSmoking(): Promise<State | null> {
    const state = await this.GetState();
    if (!state || !state.smokeId || state.smokeId.length <= 0) {
      return null;
    }
    state.smoking = !state.smoking;
    return this.updateCurrent(state);
  }

  async clearSmoke() {
    const stateDto: StateDto = {
      smokeId: '',
      smoking: false,
    };
    return await this.updateCurrent(stateDto);
  }
}
