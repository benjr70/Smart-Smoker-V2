import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '../common/base.service';
import { childIdOf, CookSnapshot, isActive } from '../activeCook/active-cook';
import { ActiveCookService } from '../activeCook/active-cook.service';
import { PreSmoke, PreSmokeDocument } from './presmoke.schema';
import { PreSmokeDto } from './presmokeDto';
import { markStatsStale } from '../stats/mark-stats-stale';
import { StatsService } from '../stats/stats.service';

@Injectable()
export class PreSmokeService extends BaseService<PreSmokeDocument> {
  constructor(
    @InjectModel(PreSmoke.name) model: Model<PreSmokeDocument>,
    private readonly stats: StatsService,
    /**
     * Which cook the smoker is attached to, and the module that starts one.
     * This service used to write the stored state itself and create the cook
     * through `SmokeService`; starting is a transition, and transitions are the
     * Active Cook's. See {@link save} and {@link GetByCurrent}.
     */
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

  /**
   * Write what is about to be cooked — and, when nothing is cooking yet, start
   * the cook it is for.
   *
   * This form is the first screen of a cook, so saving it is the gesture that
   * begins one: with no Active Cook, the cook is created from this
   * pre-smoke and the smoker is attached to it, as one transition that exactly
   * one caller can win. With a cook already running, the pre-smoke is simply
   * that cook's, updated where it has one and created and linked where it does
   * not.
   *
   * Both halves go through the Active Cook. This used to walk the stored state
   * itself, create the document it found missing, and — where the cook had no
   * pre-smoke yet — create a *second* cook to hang the new pre-smoke off,
   * leaving the running cook with no pre-smoke at all.
   *
   * A start that loses falls through to the attach, so two phones opening the
   * wizard together both end up writing the pre-smoke of the one cook that was
   * started rather than one of them writing into nothing.
   */
  async save(preSmokeDto: PreSmokeDto): Promise<PreSmoke> {
    const cook = await this.activeCook.resolve();
    if (!isActive(cook)) {
      const started = await this.activeCook.start(() =>
        this.writePreSmoke(preSmokeDto),
      );
      if (started.won) {
        return started.preSmoke;
      }
    }
    return this.activeCook.attach('preSmokeId', {
      update: (preSmokeId) => this.update(preSmokeId, preSmokeDto),
      create: () => this.writePreSmoke(preSmokeDto),
    });
  }

  /** The pre-smoke written, as the cook links it: the record and its id. */
  private async writePreSmoke(
    preSmokeDto: PreSmokeDto,
  ): Promise<{ result: PreSmoke; childId: string }> {
    const preSmoke = await this.create(preSmokeDto);
    return { result: preSmoke, childId: preSmoke['_id'].toString() };
  }

  /**
   * What the Active Cook is of, or `null` where there is no cook or its
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
