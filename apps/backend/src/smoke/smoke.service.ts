import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '../common/base.service';
import { Smoke, SmokeDocument, SmokeStatus } from './smoke.schema';
import { SmokeDto } from './smokeDto';
import { StateService } from '../State/state.service';
import { TimelineService } from '../timeline/timeline.service';

@Injectable()
export class SmokeService extends BaseService<SmokeDocument> {
  constructor(
    @InjectModel('Smoke') model: Model<SmokeDocument>,
    private stateService: StateService,
    private readonly timeline: TimelineService,
  ) {
    super(model, 'Smoke');
  }

  create(smokeDto: SmokeDto): Promise<SmokeDocument> {
    smokeDto.date = new Date();
    return super.create(smokeDto);
  }

  /**
   * Degenerate `state → smoke` walk kept local to `SmokeService`. It cannot
   * delegate to `CurrentSmokeService` — that would make `SmokeModule` depend on
   * `CommonModule` (which depends on `SmokeModule`), a DI cycle.
   */
  async getCurrentSmoke(): Promise<Smoke | null> {
    return this.stateService.GetState().then((state) => {
      if (!state || !state.smokeId || state.smokeId.length === 0) {
        return null;
      }
      return this.getById(state.smokeId);
    });
  }

  /**
   * Complete the current cook: record that it ended, and what it was being
   * taken to, before marking it complete.
   *
   * The stamp is written first so a cook is never left marked complete with no
   * finish recorded — the state a reader would have to backfill from readings
   * that may not exist.
   */
  async FinishSmoke(): Promise<Smoke | null> {
    return await this.getCurrentSmoke().then(async (smoke) => {
      if (!smoke) {
        return null;
      }
      await this.timeline.stampFinish(smoke['_id'].toString());
      const smokeDto: SmokeDto = {
        smokeProfileId: smoke.smokeProfileId,
        preSmokeId: smoke.preSmokeId,
        postSmokeId: smoke.postSmokeId,
        tempsId: smoke.tempsId,
        ratingId: smoke.ratingId,
        status: SmokeStatus.Complete,
      };
      return await this.update(smoke['_id'].toString(), smokeDto);
    });
  }
}
