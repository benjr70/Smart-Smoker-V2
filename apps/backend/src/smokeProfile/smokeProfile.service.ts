import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RatingsService } from '../ratings/ratings.service';
import { BaseService } from '../common/base.service';
import { CurrentSmokeService } from '../common/current-smoke.service';
import { Smoke } from '../smoke/smoke.schema';
import { SmokeProfile, SmokeProFileDocument } from './smokeProfile.schema';
import { SmokeProFileDto } from './smokeProfileDto';

@Injectable()
export class SmokeProfileService extends BaseService<SmokeProFileDocument> {
  constructor(
    @InjectModel('SmokeProfile')
    model: Model<SmokeProFileDocument>,
    private readonly currentSmoke: CurrentSmokeService,
    private readonly ratingsService: RatingsService,
  ) {
    super(model, 'SmokeProfile');
  }

  getCurrentSmokeProfile(): Promise<SmokeProfile> {
    const defaultProfile = {
      notes: '',
      woodType: '',
      chamberName: 'Chamber',
      probe1Name: 'Probe1',
      probe2Name: 'Probe2',
      probe3Name: 'Probe3',
    } as SmokeProfile;
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
