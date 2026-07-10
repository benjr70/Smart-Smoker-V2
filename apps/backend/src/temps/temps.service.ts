import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '../common/base.service';
import { SmokeService } from '../smoke/smoke.service';
import { SmokeDto } from '../smoke/smokeDto';
import { StateService } from '../State/state.service';
import { TempDto } from './tempDto';
import { Temp, TempDocument } from './temps.schema';

@Injectable()
export class TempsService extends BaseService<TempDocument> {
  constructor(
    @InjectModel('Temp') model: Model<TempDocument>,
    private stateService: StateService,
    private smokeService: SmokeService,
  ) {
    super(model, 'Temp');
  }

  async saveNewTemp(tempDto: TempDto) {
    return this.stateService.GetState().then((state) => {
      if (!state || !state.smokeId || state.smokeId.length <= 0) {
        return;
      }
      this.smokeService.getById(state.smokeId).then((smoke) => {
        if (!smoke) {
          return;
        }
        if (smoke.tempsId) {
          tempDto.tempsId = smoke.tempsId;
          return this.create(tempDto);
        } else {
          this.create(tempDto).then(async (temp) => {
            const smokeDto: SmokeDto = {
              preSmokeId: smoke.preSmokeId,
              tempsId: temp['_id'].toString(),
              status: smoke.status,
            };
            await this.smokeService.update(state.smokeId, smokeDto);
          });
        }
      });
    });
  }

  async saveTempBatch(tempDto: TempDto[]) {
    this.GetTempID().then((tempsId) => {
      if (tempsId != undefined) {
        tempDto = tempDto.map((tempDto) => {
          tempDto.tempsId = tempsId;
          return tempDto;
        });
        return this.model.insertMany(tempDto);
      }
    });
  }

  async getAllTempsCurrent(): Promise<Temp[]> {
    return this.stateService.GetState().then((state) => {
      if (!state || !state.smokeId || state.smokeId.length <= 0) {
        return [];
      }
      return this.smokeService.getById(state.smokeId).then((smoke) => {
        if (smoke?.tempsId && smoke.tempsId.length > 0) {
          return this.model.find({ tempsId: smoke.tempsId });
        } else {
          return [];
        }
      });
    });
  }

  async getAllTempsById(id: string): Promise<Temp[]> {
    return this.model.find({ tempsId: id });
  }

  async GetTempID(): Promise<string | undefined> {
    return this.stateService.GetState().then((state) => {
      if (!state || !state.smokeId || state.smokeId.length <= 0) {
        return undefined;
      }
      return this.smokeService.getById(state.smokeId).then((smoke) => {
        return smoke?.tempsId;
      });
    });
  }

  /**
   * Temps are addressed by their shared `tempsId` (a smoke's temp series), not
   * by `_id` — so this overrides the by-id `delete` from BaseService.
   */
  async delete(id: string) {
    return this.model.deleteMany({ tempsId: id });
  }
}
