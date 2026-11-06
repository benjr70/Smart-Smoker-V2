import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '../common/base.service';
import { SmokeService } from '../smoke/smoke.service';
import { SmokeDto } from '../smoke/smokeDto';
import { StateService } from '../State/state.service';
import { childIdOf, CookSnapshot } from '../activeCook/active-cook';
import { ActiveCookService } from '../activeCook/active-cook.service';
import { PreSmoke, PreSmokeDocument } from './presmoke.schema';
import { PreSmokeDto } from './presmokeDto';
import { SmokeStatus } from '../smoke/smoke.schema';
import { markStatsStale } from '../stats/mark-stats-stale';
import { StatsService } from '../stats/stats.service';

@Injectable()
export class PreSmokeService extends BaseService<PreSmokeDocument> {
  constructor(
    @InjectModel(PreSmoke.name) model: Model<PreSmokeDocument>,
    /**
     * The session, for the one thing this service still writes to it: starting
     * a cook, which is a transition rather than a read.
     */
    private stateService: StateService,
    private smokeService: SmokeService,
    private readonly stats: StatsService,
    /** Which cook the smoker is attached to — see {@link GetByCurrent}. */
    private readonly activeCook: ActiveCookService,
  ) {
    super(model, 'PreSmoke');
  }

  /**
   * What was cooked, and how much of it, are the numbers the Stats screen is
   * mostly made of — so every write here leaves the stored statistics out of
   * date. Correcting a meat type or a weight moves no cook in or out of the
   * archive, which is the only change that read can notice by itself.
   *
   * Marked while the cook is still running too, which costs a rebuild the next
   * time somebody opens the screen. That is the cheap side of the trade: the
   * alternative is deciding here whether this document belongs to a finished
   * cook, which is a walk this service has no reason to do on every save.
   */
  protected async afterWrite(): Promise<void> {
    await markStatsStale(this.stats, 'pre-smoke');
  }

  async save(preSmokeDto: PreSmokeDto): Promise<PreSmoke> {
    return this.stateService.GetState().then(async (state) => {
      // If no state exists, create one
      if (!state) {
        state = await this.stateService.create({ smokeId: '', smoking: false });
      }
      if (state.smokeId && state.smokeId.length > 0) {
        return this.smokeService.getById(state.smokeId).then((smoke) => {
          if (!smoke) {
            return this.startSmokeWith(preSmokeDto, state);
          }
          if (smoke.preSmokeId) {
            return this.update(smoke.preSmokeId, preSmokeDto);
          } else {
            return this.create(preSmokeDto).then((preSmoke) => {
              const smokeDto: SmokeDto = {
                preSmokeId: preSmoke['_id'].toString(),
                status: smoke.status,
              };
              this.smokeService.create(smokeDto);
              return preSmoke;
            });
          }
        });
      } else {
        return this.startSmokeWith(preSmokeDto, state);
      }
    });
  }

  private async startSmokeWith(
    preSmokeDto: PreSmokeDto,
    state: any,
  ): Promise<PreSmoke> {
    return this.create(preSmokeDto).then((preSmoke) => {
      const smokeDto: SmokeDto = {
        preSmokeId: preSmoke['_id'].toString(),
        status: SmokeStatus.InProgress,
      };
      this.smokeService.create(smokeDto).then((smoke) => {
        state.smokeId = smoke['_id'].toString();
        this.stateService.updateCurrent(state);
      });
      return preSmoke;
    });
  }

  /**
   * What the cook in progress is of, or `null` where there is no cook or its
   * pre-smoke was never saved.
   *
   * Read through the Active Cook, which is also what makes this a read: it
   * used to walk the stored state itself and create the document it found
   * missing — a write on a fresh install's first screen, made on the way to
   * answering a question.
   *
   * `cook` is the Active Cook a caller has already resolved: the alert check
   * seeds its probe targets from the meat of the one cook it is judging.
   */
  async GetByCurrent(cook?: CookSnapshot): Promise<PreSmoke | null> {
    const preSmokeId = childIdOf(
      cook ?? (await this.activeCook.resolve()),
      'preSmokeId',
    );
    if (!preSmokeId) {
      return null;
    }
    return this.model.findById(preSmokeId);
  }
}
