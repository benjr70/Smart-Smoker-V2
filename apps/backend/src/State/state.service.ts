import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '../common/base.service';
import { State, StateDocument } from './state.schema';
import { StateDto } from './stateDto';
import { TimelineService } from '../timeline/timeline.service';

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
    await this.model.findOneAndUpdate(
      { _id: state['_id'].toString() },
      stateDto,
    );
    const updated = await this.GetState();
    if (!updated) {
      // The write landed but the read-back is empty: the singleton was removed
      // underneath us. Callers are promised a State, so say so loudly instead
      // of handing back an undefined that every caller would dereference.
      throw new NotFoundException('state not found after update');
    }
    return updated;
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

  async clearSmoke() {
    const stateDto: StateDto = {
      smokeId: '',
      smoking: false,
    };
    return await this.updateCurrent(stateDto);
  }
}
