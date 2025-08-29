import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SmokeService } from 'src/smoke/smoke.service';
import { SmokeDto } from 'src/smoke/smokeDto';
import { StateService } from 'src/State/state.service';
import { SmokeProfile, SmokeProFileDocument } from './smokeProfile.schema';
import { SmokeProFileDto } from './smokeProfileDto';
import { RatingsService } from 'src/ratings/ratings.service';

@Injectable()
export class SmokeProfileService {
  constructor(
    @InjectModel('SmokeProfile')
    private smokeProfileModel: Model<SmokeProFileDocument>,
    private stateService: StateService,
    private smokeService: SmokeService,
    private ratingsService: RatingsService,
  ) {}

  async getCurrentSmokeProfile(): Promise<SmokeProfile> {
    return this.stateService.GetState().then(async (state) => {
      if (!state) {
        await this.stateService.create({ smokeId: '', smoking: false });
      }
      return this.smokeService.GetById(state.smokeId).then((smoke) => {
        if (smoke.smokeProfileId) {
          return this.smokeProfileModel.findById(smoke.smokeProfileId);
        } else {
          return {
            notes: '',
            woodType: '',
            chamberName: 'Chamber',
            probe1Name: 'Probe1',
            probe2Name: 'Probe2',
            probe3Name: 'Probe2',
          };
        }
      });
    });
  }

  async saveCurrentSmokeProfile(dto: SmokeProFileDto): Promise<SmokeProfile> {
    const state = await this.stateService.GetState();
    if (state.smokeId.length > 0) {
      const smoke = await this.smokeService.GetById(state.smokeId);
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
        await this.update(smoke.smokeProfileId, dto);
      } else {
        const smokeProfile = await this.create(dto);
        const smokeDto: SmokeDto = {
          smokeProfileId: smokeProfile['_id'].toString(),
          preSmokeId: smoke.preSmokeId,
          postSmokeId: smoke.postSmokeId,
          tempsId: smoke.tempsId,
          status: smoke.status,
        };
        await this.smokeService.Update(smoke['_id'].toString(), smokeDto);
        return smokeProfile;
      }
    } else {
    }
  }

  async create(smokeProfileDto: SmokeProFileDto): Promise<SmokeProfile> {
    const createdSmokeProfile = new this.smokeProfileModel(smokeProfileDto);
    return createdSmokeProfile.save();
  }

  async getById(id: string): Promise<SmokeProfile> {
    return await this.smokeProfileModel.findById(id);
  }

  async update(
    id: string,
    smokeProfileDto: SmokeProFileDto,
  ): Promise<SmokeProfile> {
    return this.smokeProfileModel
      .findByIdAndUpdate({ _id: id }, smokeProfileDto)
      .then(() => {
        return this.getById(id);
      });
  }

  async Delete(id: string) {
    return this.smokeProfileModel.deleteOne({ _id: id });
  }
}
