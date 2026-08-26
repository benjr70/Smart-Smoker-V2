import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '../common/base.service';
import { State, StateDocument } from './state.schema';
import { StateDto } from './stateDto';
import { TimelineService } from '../timeline/timeline.service';
import { cookEventsOfSmoke } from '../cookEvents/cook-events.filter';
import { Smoke, SmokeStatus } from '../smoke/smoke.schema';
import {
  COOK_LOG_ANNOUNCER,
  CookLogAnnouncerPort,
} from '../websocket/cook-log-announcer';

/** What a state means before anything has been cooked: idle, no smoke. */
const IDLE_STATE: StateDto = { smokeId: '', smoking: false };

@Injectable()
export class StateService
  extends BaseService<StateDocument>
  implements OnModuleInit
{
  constructor(
    @InjectModel('state') model: Model<StateDocument>,
    private readonly timeline: TimelineService,
    /**
     * The discarded cook's log, reached through its model rather than through
     * `CookEventsService`: that service reads this one to find the cook in
     * progress, so injecting it here would close a DI cycle. Removing rows by
     * the cook they belong to carries none of that service's policy — the
     * filter it reads them with is shared instead.
     */
    @InjectModel('CookEvent')
    private readonly cookEventModel: Model<unknown>,
    /**
     * The session's cook, read to decide whether clearing is putting a finished
     * cook away or throwing an unfinished one out. Its model rather than
     * `SmokeService`: that service depends on this one, so injecting it here
     * would close a DI cycle — the same reason `StaleCookModule` reads the cook
     * through its model.
     */
    @InjectModel('Smoke')
    private readonly smokeModel: Model<Pick<Smoke, 'status'>>,
    /**
     * How every open screen hears that the cook log it is showing is no longer
     * anybody's. Taken as a port rather than as the gateway, because the two
     * would otherwise import each other; see {@link COOK_LOG_ANNOUNCER}.
     */
    @Inject(COOK_LOG_ANNOUNCER)
    private readonly events: CookLogAnnouncerPort,
  ) {
    super(model, 'state');
  }

  /**
   * Guarantee the singleton exists before anything reads it.
   *
   * A brand-new database — a fresh production install or any freshly booted
   * hermetic stack — has an empty `states` collection, and every reader then
   * has to invent its own handling for a state that is merely unwritten.
   * Seeding once at startup means the rest of the application only ever sees a
   * real document.
   *
   * Failure is logged, never thrown: an unreachable database at boot must not
   * stop the API from starting, and the readers still guard.
   */
  async onModuleInit(): Promise<void> {
    try {
      if (await this.GetState()) {
        return;
      }
      await this.create(IDLE_STATE);
      Logger.log('seeded the initial idle state document', 'State');
    } catch (err) {
      Logger.error(
        `could not seed the initial state: ${
          err instanceof Error ? err.message : String(err)
        }`,
        'State',
      );
    }
  }

  /**
   * The one-and-only state document, or `undefined` when none has been written
   * yet.
   *
   * Nullable in the type on purpose: a fresh install has an empty `states`
   * collection, and the previous non-nullable `Promise<State>` hid that from
   * every caller until one of them dereferenced `undefined` on the websocket
   * relay path and took the process down.
   */
  async GetState(): Promise<State | undefined> {
    return (await this.model.find().exec())[0];
  }

  /**
   * Singleton write for the one-and-only state document. Distinct from the
   * inherited by-id `update(id, dto)` — callers never carry a state id, so this
   * discovers (or self-heals) the singleton, then updates it.
   */
  async updateCurrent(stateDto: State): Promise<State> {
    const state = await this.GetState();
    if (!state) {
      // Create a new state if none exists
      return this.create(stateDto);
    }
    return this.model
      .findOneAndUpdate({ _id: state['_id'].toString() }, stateDto)
      .then(() => {
        return this.GetState();
      });
  }

  /**
   * Flip the smoking flag, and — the first time it goes on — record that the
   * cook has started.
   *
   * The start belongs here rather than at session creation because a session is
   * set up while the meat is still being trimmed; the cook begins when somebody
   * presses Start Smoking. Stopping and restarting during a cook is ordinary,
   * so only the switch-on stamps, and the stamp itself is written once (see
   * {@link TimelineService.stampStart}).
   *
   * The stamp follows the state write rather than leading it, because the two
   * failures are not equal. A stamp written before a state write that then
   * fails is permanent — the write-once condition will never match again, so
   * every duration and elapsed clock for that cook is wrong and no retry can
   * fix it. A state write that succeeds before a stamp that fails leaves a
   * running cook without a start, which the next toggle stamps correctly.
   */
  async toggleSmoking(): Promise<State | null> {
    const state = await this.GetState();
    if (!state || !state.smokeId || state.smokeId.length <= 0) {
      return null;
    }
    state.smoking = !state.smoking;
    const updated = await this.updateCurrent(state);
    if (state.smoking) {
      await this.timeline.stampStart(state.smokeId);
    }
    return updated;
  }

  /**
   * Switch smoking off for a cook that is over, and say whether this call is
   * the one that switched it.
   *
   * Conditional on the flag still being on, and on the session still being the
   * one named, so the two triggers of an auto-stop racing each other cannot
   * both report a stop — and so a stop decided about yesterday's cook cannot
   * switch off a cook the user has since started.
   *
   * Distinct from {@link toggleSmoking}: this is not a toggle (a second call
   * must not switch smoking back on) and it stamps no start.
   */
  async stopSmoking(smokeId: string): Promise<boolean> {
    const result = await this.model
      .updateOne({ smokeId, smoking: true }, { $set: { smoking: false } })
      .exec();
    return result.modifiedCount > 0;
  }

  /**
   * Discard the session: no cook, not smoking, and — when the cook was never
   * finished — nothing left stamped against it.
   *
   * The log goes first and never fails the clear. Events left behind belong to
   * a smoke nothing points at any more, but a session the user asked to clear
   * that stayed set up because a delete failed is the worse outcome by far —
   * the next cook would record into the last one.
   *
   * The clear is then announced, because the screens do not unmount when it
   * happens — the stale-cook recovery clears from under a mounted smoke step.
   * Without the announcement the card keeps showing the cleared cook's entries,
   * and a Remove tapped there deletes an event of a cook that has been put
   * away.
   */
  async clearSmoke() {
    await this.discardCookLog();
    const stateDto: StateDto = {
      smokeId: '',
      smoking: false,
    };
    const cleared = await this.updateCurrent(stateDto);
    this.announceEmptyCookLog();
    return cleared;
  }

  /**
   * Tell every connected client that there is no cook log to show.
   *
   * Empty whichever way the clear went: the discarded session's events are
   * gone, and a finished cook's are kept but belong to a cook the session no
   * longer names — and what a live screen shows is the log of the cook in
   * progress. Never throws: the session *is* cleared, and an unreachable
   * socket must not turn that into an error the user retries.
   */
  private announceEmptyCookLog(): void {
    try {
      this.events.broadcastCookEvents([]);
    } catch (err) {
      Logger.error(
        `could not announce the cleared cook log: ${
          err instanceof Error ? err.message : String(err)
        }`,
        'State',
      );
    }
  }

  /**
   * The cook log of a session being thrown away — and only of one being thrown
   * away.
   *
   * Clearing is not only how an abandoned session is discarded: it is also the
   * last step of finishing a cook (the wizard finishes the smoke, then clears
   * the session that still names it), so the state alone cannot say which of
   * the two is happening. The cook's own status can. A completed cook is
   * archived, its log is its history, and this must not touch it; an unfinished
   * one is being thrown out, and a log left behind would belong to a session
   * nothing points at any more.
   *
   * A cook the collection no longer holds is treated as unfinished: what is
   * left of it is an orphaned log, and nothing is archived that could lose by
   * its removal.
   */
  private async discardCookLog(): Promise<void> {
    try {
      const state = await this.GetState();
      if (!state?.smokeId) {
        return;
      }
      const smoke = await this.smokeModel.findById(state.smokeId).exec();
      if (smoke?.status === SmokeStatus.Complete) {
        return;
      }
      await this.cookEventModel
        .deleteMany(cookEventsOfSmoke(state.smokeId))
        .exec();
    } catch (err) {
      Logger.error(
        `could not discard the cook log: ${
          err instanceof Error ? err.message : String(err)
        }`,
        'State',
      );
    }
  }
}
