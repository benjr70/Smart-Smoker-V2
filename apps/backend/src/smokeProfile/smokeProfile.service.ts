import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RatingsService } from '../ratings/ratings.service';
import { BaseService } from '../common/base.service';
import { CurrentSmokeService } from '../common/current-smoke.service';
import { Smoke } from '../smoke/smoke.schema';
import { markStatsStale } from '../stats/mark-stats-stale';
import { StatsService } from '../stats/stats.service';
import {
  DEFAULT_SMOKE_PROFILE,
  SmokeProfile,
  SmokeProFileDocument,
} from './smokeProfile.schema';
import { SmokeProFileDto } from './smokeProfileDto';

@Injectable()
export class SmokeProfileService extends BaseService<SmokeProFileDocument> {
  constructor(
    @InjectModel('SmokeProfile')
    model: Model<SmokeProFileDocument>,
    private readonly currentSmoke: CurrentSmokeService,
    private readonly ratingsService: RatingsService,
    private readonly stats: StatsService,
  ) {
    super(model, 'SmokeProfile');
  }

  /**
   * Which wood a cook was smoked over is counted on the Stats screen, so every
   * write here leaves the stored statistics out of date — while moving no cook
   * in or out of the archive, which is the only change that read notices by
   * itself.
   */
  protected async afterWrite(): Promise<void> {
    await markStatsStale(this.stats, 'smoke-profile');
  }

  getCurrentSmokeProfile(): Promise<SmokeProfile> {
    const defaultProfile = { ...DEFAULT_SMOKE_PROFILE };
    return this.currentSmoke.readCurrent<SmokeProfile>(
      'smokeProfileId',
      (id) => this.getById(id),
      defaultProfile,
    );
  }

  saveCurrentSmokeProfile(dto: SmokeProFileDto): Promise<SmokeProfile> {
    return this.currentSmoke.upsertCurrent<SmokeProfile>('smokeProfileId', {
      update: (id) => this.update(id, dto),
      create: async () => {
        const created = await this.create(dto);
        return { result: created, childId: created['_id'].toString() };
      },
      onResolveSmoke: async (smoke: Smoke) => {
        if (!smoke.ratingId) {
          await this.ratingsService.saveCurrentRatings({
            smokeFlavor: 0,
            seasoning: 0,
            tenderness: 0,
            overallTaste: 0,
            notes: '',
          });
        }
      },
    });
  }
}
