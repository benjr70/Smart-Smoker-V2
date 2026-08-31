import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '../common/base.service';
import { Smoke, SmokeDocument, SmokeStatus } from './smoke.schema';
import { SmokeDto } from './smokeDto';
import { ServePlanDto } from './serve-plan.dto';
import { StateService } from '../State/state.service';
import { TimelineService } from '../timeline/timeline.service';
import { tempSeriesFilter } from '../temps/temp-series.filter';
import { cookEventsOfSmoke } from '../cookEvents/cook-events.filter';
import { StatsService } from '../stats/stats.service';

@Injectable()
export class SmokeService extends BaseService<SmokeDocument> {
  private readonly logger = new Logger(SmokeService.name);

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
    @InjectModel('CookEvent')
    private readonly cookEventModel: Model<unknown>,
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
      // The cook log is a set of rows keyed by the cook itself rather than a
      // linked child id, so it goes by the same filter its own service reads
      // it with — and by the model, since `CookEventsService` depends on this
      // module's dependencies and importing it back would close a DI cycle.
      this.deleteCookLog(id),
    ]);
    const deleted = await this.delete(id);
    // Only once nothing of the cook is left: statistics recomputed mid-cascade
    // would count a session that is on its way out.
    await this.restatArchive('after deleting smoke ' + id);
    return deleted;
  }

  /**
   * Recompute the stored statistics for work that has already been committed,
   * without letting them fail it.
   *
   * The cook is finished, or gone, by the time this runs. A recompute that
   * throws here would answer a request that succeeded with a 500, and the
   * client's natural retry — delete it again, finish it again — has nothing
   * left to do and would only fail differently. The statistics carry their own
   * staleness guards, so the worst this costs is that the next Stats read
   * rebuilds instead of being served.
   */
  private async restatArchive(occasion: string): Promise<void> {
    try {
      await this.stats.recalculate();
    } catch (error) {
      this.logger.warn(
        `Statistics were not recomputed ${occasion}; the next stats read will rebuild them. ${error}`,
      );
    }
  }

  private async deleteChild(child: Model<unknown>, id?: string): Promise<void> {
    if (!id) {
      return;
    }
    await child.deleteOne({ _id: id }).exec();
  }

  /** Every event stamped against this cook. */
  private async deleteCookLog(smokeId: string): Promise<void> {
    await this.cookEventModel.deleteMany(cookEventsOfSmoke(smokeId)).exec();
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
   * Write the Serve Plan onto the cook in progress — the path the planner card
   * and the Post-Smoke rest field both persist through.
   *
   * Against the current cook rather than an id, because that is the only cook a
   * plan can be about: the card is on the Smoke step of the session that is
   * running, and asking a client to carry the cook's id would give it a way to
   * plan a cook that finished last weekend.
   *
   * Only the fields the caller sent are written. The plan is two steppers on
   * one card and one of them moves at a time, so a write that carried the whole
   * plan would let a phone that had not seen the touchscreen's last tap undo
   * it.
   *
   * `null` where nothing is cooking: there is no cook to plan, which is a fact
   * about the session rather than a failure of the request.
   */
  async updateServePlan(plan: ServePlanDto): Promise<Smoke | null> {
    const smoke = await this.getCurrentSmoke();
    if (!smoke) {
      return null;
    }
    return this.update(smoke['_id'].toString(), {
      ...(plan.serveAt === undefined ? {} : { serveAt: plan.serveAt }),
      ...(plan.restMinutes === undefined
        ? {}
        : { restMinutes: plan.restMinutes }),
    } as Partial<SmokeDocument>);
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
      await this.restatArchive('after finishing the cook');
      return finished;
    });
  }
}
