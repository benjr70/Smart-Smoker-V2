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

  /**
   * The current smoke's readings, oldest first.
   *
   * A series is a cook, and a cook has a direction: the chart that draws it
   * takes the span of the plot from the readings themselves. Left unordered,
   * Mongo answers in whatever order it finds the rows in — in practice
   * newest-first, since that is the order of the index this collection is read
   * through — and a backwards cook draws a backwards time axis with the lines
   * outside the plot. The order belongs here, at the one place the series is
   * read, rather than in each reader that would otherwise have to know.
   */
  async getAllTempsCurrent(): Promise<Temp[]> {
    return this.currentSmoke.readCurrent<Temp[]>(
      'tempsId',
      (tempsId) => this.model.find({ tempsId }).sort({ date: 1 }).exec(),
      [],
    );
  }

  /**
   * The most recent reading of the current smoke, or `undefined` when no smoke
   * is active. The stored series is the smoker's latest-reading cache: readings
   * are already persisted as they arrive, so a watcher that wakes on its own
   * schedule reads the newest row instead of needing the producer to push to it.
   */
  async getLatestCurrentTemp(): Promise<Temp | undefined> {
    return this.currentSmoke.readCurrent<Temp | undefined>(
      'tempsId',
      async (tempsId) => {
        const [latest] = await this.model
          .find({ tempsId })
          .sort({ date: -1 })
          .limit(1)
          .exec();
        return latest;
      },
      undefined,
    );
  }

  /** A stored smoke's readings, oldest first, for the same reason as above. */
  async getAllTempsById(id: string): Promise<Temp[]> {
    return this.model.find({ tempsId: id }).sort({ date: 1 }).exec();
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
