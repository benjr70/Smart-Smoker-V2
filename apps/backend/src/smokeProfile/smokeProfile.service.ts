import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RatingsService } from 'src/ratings/ratings.service';
import { SmokeService } from 'src/smoke/smoke.service';
import { SmokeDto } from 'src/smoke/smokeDto';
import { StateService } from 'src/State/state.service';
import { BaseService } from '../common/base.service';
import { SmokeProfile, SmokeProFileDocument } from './smokeProfile.schema';
import { SmokeProFileDto } from './smokeProfileDto';

@Injectable()
export class SmokeProfileService extends BaseService<SmokeProFileDocument> {
  constructor(
    @InjectModel('SmokeProfile')
    model: Model<SmokeProFileDocument>,
    private stateService: StateService,
    private smokeService: SmokeService,
    private ratingsService: RatingsService,
  ) {
    super(model, 'SmokeProfile');
  }

  async getCurrentSmokeProfile(): Promise<SmokeProfile> {
    return this.stateService.GetState().then(async (state) => {
      const defaultProfile = {
        notes: '',
        woodType: '',
        chamberName: 'Chamber',
        probe1Name: 'Probe1',
        probe2Name: 'Probe2',
        probe3Name: 'Probe3',
      };
      if (!state) {
        await this.stateService.create({ smokeId: '', smoking: false });
        return defaultProfile;
      }
      if (!state.smokeId || state.smokeId.length === 0) {
        return defaultProfile;
      }
      return this.smokeService.getById(state.smokeId).then((smoke) => {
        if (!smoke) {
          return defaultProfile;
        }
        if (smoke.smokeProfileId) {
          return this.model.findById(smoke.smokeProfileId);
        } else {
          return defaultProfile;
        }
      });
    });
  }

  async saveCurrentSmokeProfile(
    dto: SmokeProFileDto,
  ): Promise<SmokeProfile | null> {
    const state = await this.stateService.GetState();
    if (!state || !state.smokeId || state.smokeId.length === 0) {
      return null;
    }
    const smoke = await this.smokeService.getById(state.smokeId);
    if (!smoke) {
      return null;
    }
    if (!smoke.ratingId) {
      await this.ratingsService.saveCurrentRatings({
        smokeFlavor: 0,
        seasoning: 0,
        tenderness: 0,
        overallTaste: 0,
        notes: '',
      });
    }
    if (smoke.smokeProfileId) {
      return this.update(smoke.smokeProfileId, dto);
    } else {
      const smokeProfile = await this.create(dto);
      const smokeDto: SmokeDto = {
        smokeProfileId: smokeProfile['_id'].toString(),
        preSmokeId: smoke.preSmokeId,
        postSmokeId: smoke.postSmokeId,
        tempsId: smoke.tempsId,
        status: smoke.status,
      };
      await this.smokeService.update(smoke['_id'].toString(), smokeDto);
      return smokeProfile;
    }
  }
}
