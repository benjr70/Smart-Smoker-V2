import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '../common/base.service';
import { CurrentSmokeService } from '../common/current-smoke.service';
import { TempDto } from './tempDto';
import { Temp, TempDocument } from './temps.schema';

@Injectable()
export class TempsService extends BaseService<TempDocument> {
  constructor(
    @InjectModel('Temp') model: Model<TempDocument>,
    private readonly currentSmoke: CurrentSmokeService,
  ) {
    super(model, 'Temp');
  }

  async saveNewTemp(tempDto: TempDto): Promise<Temp> {
    return this.currentSmoke.upsertCurrent<Temp>('tempsId', {
      update: (tempsId) => {
        tempDto.tempsId = tempsId;
        return this.create(tempDto);
      },
      create: async () => {
        const temp = await this.create(tempDto);
        return { result: temp, childId: temp['_id'].toString() };
      },
    });
  }

  async saveTempBatch(tempDto: TempDto[]) {
    const tempsId = await this.GetTempID();
    if (tempsId === undefined) {
      return;
    }
    const rows = tempDto.map((row) => ({ ...row, tempsId }));
    return this.model.insertMany(rows);
  }

  async getAllTempsCurrent(): Promise<Temp[]> {
    return this.currentSmoke.readCurrent<Temp[]>(
      'tempsId',
      (tempsId) => this.model.find({ tempsId }).exec(),
      [],
    );
  }

  async getAllTempsById(id: string): Promise<Temp[]> {
    return this.model.find({ tempsId: id }).exec();
  }

  async GetTempID(): Promise<string | undefined> {
    return this.currentSmoke.readCurrent<string | undefined>(
      'tempsId',
      (tempsId) => Promise.resolve(tempsId),
      undefined,
    );
  }

  /**
   * Temps are addressed by their shared `tempsId` (a smoke's temp series), not
   * by `_id` — so this overrides the by-id `delete` from BaseService.
   */
  async delete(id: string) {
    return this.model.deleteMany({ tempsId: id });
  }
}
