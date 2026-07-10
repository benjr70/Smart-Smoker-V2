import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '../common/base.service';
import { SmokeService } from '../smoke/smoke.service';
import { SmokeDto } from '../smoke/smokeDto';
import { StateService } from '../State/state.service';
import { PreSmoke, PreSmokeDocument } from './presmoke.schema';
import { PreSmokeDto } from './presmokeDto';
import { SmokeStatus } from '../smoke/smoke.schema';

@Injectable()
export class PreSmokeService extends BaseService<PreSmokeDocument> {
  constructor(
    @InjectModel(PreSmoke.name) model: Model<PreSmokeDocument>,
    private stateService: StateService,
    private smokeService: SmokeService,
  ) {
    super(model, 'PreSmoke');
  }

  async save(preSmokeDto: PreSmokeDto): Promise<PreSmoke> {
    return this.stateService.GetState().then(async (state) => {
      // If no state exists, create one
      if (!state) {
        state = await this.stateService.create({ smokeId: '', smoking: false });
      }
      if (state.smokeId && state.smokeId.length > 0) {
        return this.smokeService.getById(state.smokeId).then((smoke) => {
          if (!smoke) {
            return this.startSmokeWith(preSmokeDto, state);
          }
          if (smoke.preSmokeId) {
            return this.update(smoke.preSmokeId, preSmokeDto);
          } else {
            return this.create(preSmokeDto).then((preSmoke) => {
              const smokeDto: SmokeDto = {
                preSmokeId: preSmoke['_id'].toString(),
                status: smoke.status,
              };
              this.smokeService.create(smokeDto);
              return preSmoke;
            });
          }
        });
      } else {
        return this.startSmokeWith(preSmokeDto, state);
      }
    });
  }

  private async startSmokeWith(
    preSmokeDto: PreSmokeDto,
    state: any,
  ): Promise<PreSmoke> {
    return this.create(preSmokeDto).then((preSmoke) => {
      const smokeDto: SmokeDto = {
        preSmokeId: preSmoke['_id'].toString(),
        status: SmokeStatus.InProgress,
      };
      this.smokeService.create(smokeDto).then((smoke) => {
        state.smokeId = smoke['_id'].toString();
        this.stateService.updateCurrent(state);
      });
      return preSmoke;
    });
  }

  async GetByCurrent(): Promise<PreSmoke | null> {
    return this.stateService.GetState().then(async (state) => {
      if (!state) {
        await this.stateService.create({ smokeId: '', smoking: false });
        return null;
      }
      if (!state.smokeId || state.smokeId.length === 0) {
        return null;
      }
      return this.smokeService.getById(state.smokeId).then((smoke) => {
        if (!smoke || !smoke.preSmokeId) {
          return null;
        }
        return this.model.findById(smoke.preSmokeId);
      });
    });
  }
}
