import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RatingsService } from '../ratings/ratings.service';
import { BaseService } from '../common/base.service';
import { ActiveCook, childIdOf, CookSnapshot } from '../activeCook/active-cook';
import { ActiveCookService } from '../activeCook/active-cook.service';
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
    private readonly activeCook: ActiveCookService,
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

  /**
   * The smoke profile of the cook in progress, or placeholder defaults where
   * there is none.
   *
   * `cook` is the Active Cook a caller has already resolved — the alert check
   * names probes as the cook it is judging named them, and a profile read
   * against a cook worked out again here could name another cook's.
   */
  async getCurrentSmokeProfile(cook?: CookSnapshot): Promise<SmokeProfile> {
    const profileId = childIdOf(
      cook ?? (await this.activeCook.resolve()),
      'smokeProfileId',
    );
    return profileId ? this.getById(profileId) : { ...DEFAULT_SMOKE_PROFILE };
  }

  saveCurrentSmokeProfile(dto: SmokeProFileDto): Promise<SmokeProfile> {
    return this.activeCook.attach<SmokeProfile>('smokeProfileId', {
      update: (id) => this.update(id, dto),
      create: async () => {
        const created = await this.create(dto);
        return { result: created, childId: created['_id'].toString() };
      },
      /**
       * Setting the profile is what opens a session, and the Smoke step shows
       * a score before anybody has given one — so the first profile a cook
       * gains seeds a blank rating alongside it. Only the first: a cook that
       * is already scored keeps the score it has.
       */
      onFirstAttach: async (cook: ActiveCook) => {
        if (!cook.smoke.ratingId) {
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
