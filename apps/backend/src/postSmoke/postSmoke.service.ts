import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SmokeService } from '../smoke/smoke.service';
import { SmokeDto } from '../smoke/smokeDto';
import { StateService } from '../State/state.service';
import { PostSmoke, PostSmokeDocument } from './postSmoke.schema';
import { PostSmokeDto } from './postSmokeDto';

@Injectable()
export class PostSmokeService {
  constructor(
    @InjectModel('PostSmoke') private postSmokeModel: Model<PostSmokeDocument>,
    private stateService: StateService,
    private smokeService: SmokeService,
  ) {}

  getCurrentPostSmoke(): Promise<PostSmoke> {
    const defaultPostSmoke = { notes: '', restTime: '', steps: [''] };
    return this.stateService.GetState().then(async (state) => {
      if (!state) {
        await this.stateService.create({ smokeId: '', smoking: false });
        return defaultPostSmoke;
      }
      if (!state.smokeId || state.smokeId.length === 0) {
        return defaultPostSmoke;
      }
      return this.smokeService.GetById(state.smokeId).then((smoke) => {
        if (!smoke) {
          return defaultPostSmoke;
        }
        if (smoke.postSmokeId) {
          return this.postSmokeModel.findById(smoke.postSmokeId);
        } else {
          return defaultPostSmoke;
        }
      });
    });
  }

  async saveCurrentPostSmoke(dto: PostSmokeDto): Promise<PostSmoke | null> {
    const state = await this.stateService.GetState();
    if (!state || !state.smokeId || state.smokeId.length === 0) {
      return null;
    }
    const smoke = await this.smokeService.GetById(state.smokeId);
    if (!smoke) {
      return null;
    }
    if (smoke.postSmokeId) {
      await this.update(smoke.postSmokeId, dto);
      return this.getById(smoke.postSmokeId);
    } else {
      const postSmoke = await this.create(dto);
      const smokeDto: SmokeDto = {
        smokeProfileId: smoke.smokeProfileId,
        preSmokeId: smoke.preSmokeId,
        postSmokeId: postSmoke['_id'].toString(),
        tempsId: smoke.tempsId,
        status: smoke.status,
      };
      await this.smokeService.Update(smoke['_id'].toString(), smokeDto);
      return postSmoke;
    }
  }

  async create(postSmokeDto: PostSmokeDto): Promise<PostSmoke> {
    const createdPostSmoke = new this.postSmokeModel(postSmokeDto);
    return createdPostSmoke.save();
  }

  async getById(id: string): Promise<PostSmoke> {
    return this.postSmokeModel.findById(id);
  }

  async update(id: string, postSmokeDto: PostSmokeDto): Promise<PostSmoke> {
    return this.postSmokeModel
      .findByIdAndUpdate({ _id: id }, postSmokeDto)
      .then(() => {
        return this.getById(id);
      });
  }

  async Delete(id: string) {
    return this.postSmokeModel.deleteOne({ _id: id });
  }
}
