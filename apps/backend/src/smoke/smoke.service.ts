import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '../common/base.service';
import { Smoke, SmokeDocument, SmokeStatus } from './smoke.schema';
import { SmokeDto } from './smokeDto';
import { StateService } from '../State/state.service';
import { TimelineService } from '../timeline/timeline.service';
import { tempSeriesFilter } from '../temps/temp-series.filter';
import { StatsService } from '../stats/stats.service';

@Injectable()
export class SmokeService extends BaseService<SmokeDocument> {
  constructor(
    @InjectModel('Smoke') model: Model<SmokeDocument>,
    private stateService: StateService,
    private readonly timeline: TimelineService,
    /**
     * The statistics of the archive, recomputed by the two things this service
     * does that change what the archive holds. Injected directly rather than
     * announced on an event bus: there is one listener, and a recompute that
     * has finished before the request returns is what lets the Stats screen be
     * right the moment it is opened.
     */
    private readonly stats: StatsService,
    /**
     * The children are reached through their models rather than their
     * services. Every one of those services already depends on `SmokeModule`
     * (directly, or through `CommonModule`), so injecting them here would close
     * a DI cycle. Removing a row is a model operation and carries no policy of
     * the owning service, so the collections are addressed directly.
     */
    @InjectModel('PreSmoke')
    private readonly preSmokeModel: Model<unknown>,
    @InjectModel('SmokeProfile')
    private readonly smokeProfileModel: Model<unknown>,
    @InjectModel('Temp')
    private readonly tempModel: Model<unknown>,
    @InjectModel('PostSmoke')
    private readonly postSmokeModel: Model<unknown>,
    @InjectModel('Ratings')
    private readonly ratingsModel: Model<unknown>,
  ) {
    super(model, 'Smoke');
  }

  create(smokeDto: SmokeDto): Promise<SmokeDocument> {
    smokeDto.date = new Date();
    return super.create(smokeDto);
  }

  /**
   * Delete a cook and everything recorded about it: its pre-smoke, its smoke
   * profile, its whole temperature series, its post-smoke and its rating.
   *
   * The children go first and the parent last. A failure part-way therefore
   * leaves the smoke still pointing at whatever survived — a state the same
   * request can be retried against — rather than orphaning children behind a
   * parent that no longer exists to name them.
   *
   * A child id that is absent (legacy cooks were written before some of these
   * existed) removes nothing and fails nothing: the aim is that after this
   * call, nothing of the cook remains.
   */
  async deleteDeep(id: string) {
    const smoke = await this.getByIdOrThrow(id);
    await Promise.all([
      this.deleteChild(this.preSmokeModel, smoke.preSmokeId),
      this.deleteChild(this.smokeProfileModel, smoke.smokeProfileId),
      this.deleteTempSeries(smoke.tempsId),
      this.deleteChild(this.postSmokeModel, smoke.postSmokeId),
      this.deleteChild(this.ratingsModel, smoke.ratingId),
    ]);
    const deleted = await this.delete(id);
    // Only once nothing of the cook is left: statistics recomputed mid-cascade
    // would count a session that is on its way out.
    await this.stats.recalculate();
    return deleted;
  }

  private async deleteChild(child: Model<unknown>, id?: string): Promise<void> {
    if (!id) {
      return;
    }
    await child.deleteOne({ _id: id }).exec();
  }

  /**
   * Temps are a series, not a document: the readings of the cook are removed
   * together, by the id they share and by the first reading that id came from
   * (see {@link tempSeriesFilter}).
   */
  private async deleteTempSeries(tempsId?: string): Promise<void> {
    if (!tempsId) {
      return;
    }
    await this.tempModel.deleteMany(tempSeriesFilter(tempsId)).exec();
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
      const finished = await this.update(smoke['_id'].toString(), smokeDto);
      // Statistics count completed cooks, so they are recomputed after the
      // cook became one — this is the moment a session joins the archive, and
      // the pitmaster who finishes a cook looks at their stats next.
      await this.stats.recalculate();
      return finished;
    });
  }
}
