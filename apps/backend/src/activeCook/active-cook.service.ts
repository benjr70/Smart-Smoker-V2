import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ApplicationSettings,
  ApplicationSettingsDocument,
} from '../appSettings/app-settings.schema';
import { SmokeDocument, SmokeStatus } from '../smoke/smoke.schema';
import { STATE_SINGLETON_ID, StateDocument } from '../State/state.schema';
import { STATS_RECOMPUTE, StatsRecomputePort } from '../stats/stats-recompute';
import { TempDocument } from '../temps/temps.schema';
import {
  ActiveCook,
  ActiveCookTransitions,
  attachToCook,
  ChildAttachment,
  CookChildKey,
  CookSnapshot,
  CookTransition,
  idleCook,
  isActive,
  StartedCook,
  ToggledCook,
} from './active-cook';
import {
  StampCollections,
  stampCookFinishAt,
  stampCookPull,
  stampCookStart,
} from './cook-stamps';

/** What MongoDB refuses an insert that an index already holds with. */
const DUPLICATE_KEY = 11000;

/**
 * The one place that answers "which cook is the smoker attached to".
 *
 * Deliberately owns the two collections it reads rather than depending on the
 * services around them. Every module that reaches the current cook depends on
 * this one, so a service edge in the other direction would close a DI cycle —
 * which is exactly what the old current-smoke helper, built on `StateService`
 * and `SmokeService`, could not escape.
 */
@Injectable()
export class ActiveCookService implements ActiveCookTransitions {
  constructor(
    @InjectModel('state') private readonly stateModel: Model<StateDocument>,
    @InjectModel('Smoke') private readonly smokeModel: Model<SmokeDocument>,
    /**
     * The cook's readings and the installation's settings: what a stamp is
     * computed from — the earliest reading a start may be placed at, the peak
     * a finish records, the target the meat was being taken to. Their models
     * for the same reason as the two above; see {@link stampCookStart}.
     */
    @InjectModel('Temp') private readonly tempModel: Model<TempDocument>,
    @InjectModel(ApplicationSettings.name)
    private readonly settingsModel: Model<ApplicationSettingsDocument>,
    /** See {@link STATS_RECOMPUTE}. Called once, by a finish that won. */
    @Inject(STATS_RECOMPUTE) private readonly stats: StatsRecomputePort,
  ) {}

  /** The collections a stamp is written over. See {@link StampCollections}. */
  private get stamps(): StampCollections {
    return {
      smokeModel: this.smokeModel,
      tempModel: this.tempModel,
      settingsModel: this.settingsModel,
    };
  }

  /**
   * Start a cook from a pre-smoke: create the cook record and attach the
   * smoker to it. Says whether this call is the one that started it.
   *
   * The slot in the stored state is claimed first, conditionally on it still
   * holding whatever this call read as idle, and the pre-smoke and the cook are
   * written by the winner only. Two phones setting up a cook at the same moment
   * therefore produce one cook and one pre-smoke, not two of each with one of
   * them orphaned — which is what creating first and attaching afterwards would
   * leave behind.
   *
   * The cook's id is minted here rather than taken from the insert, because the
   * claim has to name the cook it is claiming for. Between the claim and the
   * insert the state names a cook that does not exist yet, which the idle rule
   * already reads as idle (and logs) — and if the insert fails, that same rule
   * is what lets the next start claim the slot again rather than leaving the
   * smoker stuck on a cook that was never written.
   *
   * The smoking flag is left exactly as it was: lighting the smoker is the
   * toggle's business, and a cook is set up long before anybody presses Start.
   */
  async start<T>(
    createPreSmoke: ChildAttachment<T>['create'],
  ): Promise<StartedCook<T>> {
    const cook = await this.resolve();
    if (isActive(cook)) {
      return { won: false, cook, preSmoke: null };
    }
    const smokeId = new Types.ObjectId();
    if (!(await this.claimSmoker(smokeId))) {
      return { won: false, cook: await this.resolve(), preSmoke: null };
    }
    const { result, childId } = await createPreSmoke();
    await this.smokeModel.create({
      _id: smokeId,
      preSmokeId: childId,
      status: SmokeStatus.InProgress,
      date: new Date(),
    });
    return { won: true, cook: await this.resolve(), preSmoke: result };
  }

  /**
   * Point the stored state at a cook that is about to exist, if nothing else
   * has claimed it first.
   *
   * The filter is the state's own `smokeId` as this call just read it, which is
   * what makes the claim conditional: whichever of two starts writes first
   * moves the value out from under the other's filter, and the second matches
   * nothing. A smoker with no state document at all is claimed by
   * {@link claimUnwrittenSmoker}.
   */
  private async claimSmoker(smokeId: Types.ObjectId): Promise<boolean> {
    const state = await this.stateModel.findOne().exec();
    if (!state) {
      return this.claimUnwrittenSmoker(smokeId);
    }
    const claimed = await this.stateModel
      .updateOne(
        { smokeId: state.smokeId ?? null },
        { $set: { smokeId: String(smokeId) } },
      )
      .exec();
    return claimed.modifiedCount > 0;
  }

  /**
   * Claim the slot on a smoker that has no state document at all — a fresh
   * install whose boot seeding could not reach the database.
   *
   * There is no value to make the claim conditional on, so creating the
   * document *is* the condition. An upsert carrying `$set` would not do: its
   * filter is every state there is, so the second of two starts would match
   * the document the first had just inserted and overwrite the cook named in
   * it — two winners, and the first one's cook left with nothing pointing at
   * it. `$setOnInsert` changes nothing on a document that already exists, so
   * only the call that inserted one has won.
   *
   * The insert names {@link STATE_SINGLETON_ID} so that two claims landing in
   * the same instant contend on the `_id` index rather than both inserting.
   * The store's refusal is read as the loss it is; the losing caller is handed
   * the cook, as every losing caller is, rather than a write error.
   */
  private async claimUnwrittenSmoker(
    smokeId: Types.ObjectId,
  ): Promise<boolean> {
    try {
      const seeded = await this.stateModel
        .updateOne(
          { _id: STATE_SINGLETON_ID },
          { $setOnInsert: { smokeId: String(smokeId), smoking: false } },
          { upsert: true },
        )
        .exec();
      return seeded.upsertedCount > 0;
    } catch (error) {
      if ((error as { code?: number }).code === DUPLICATE_KEY) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Flip the smoking flag, and — the first time it goes on — record that the
   * cook has started.
   *
   * One flip, in the store, in one write. The flag used to be read, negated in
   * the API and written back, so two presses that overlapped could both read
   * `false` and both write `true`: the second press of a real pair did nothing,
   * and the pitmaster's Stop left the box running. Negated where the value
   * lives, two presses are always on and then off however they interleave.
   *
   * The start belongs here rather than at the cook's creation because a cook is
   * set up while the meat is still being trimmed; it begins when somebody
   * presses Start Smoking. Stopping and restarting during a cook is ordinary,
   * so only the switch-on stamps, and the stamp itself is written once (see
   * {@link stampCookStart}).
   *
   * The stamp follows the flip rather than leading it, because the two failures
   * are not equal. A stamp written before a flip that then fails is permanent —
   * the write-once condition will never match again, so every duration and
   * elapsed clock for that cook is wrong and no retry can fix it. A flip that
   * succeeds before a stamp that fails leaves a running cook without a start,
   * which the next switch-on stamps correctly.
   */
  async toggle(): Promise<ToggledCook> {
    const flipped = await this.stateModel
      .findOneAndUpdate(
        // A cook has to be named. There is nothing to start or stop on an idle
        // smoker, and a flag flipped on without a cook behind it is the shape
        // that used to send readings into no series at all.
        { smokeId: { $nin: ['', null] } },
        [{ $set: { smoking: { $not: ['$smoking'] } } }],
        { new: true },
      )
      .exec();
    if (!flipped) {
      return { won: false, cook: await this.resolve(), state: null };
    }
    if (flipped.smoking) {
      await stampCookStart(this.stamps, String(flipped.smokeId));
    }
    return { won: true, cook: await this.resolve(), state: flipped };
  }

  /**
   * The Active Cook as it stands, or idle.
   *
   * Three things count as idle, and this is the one place that says so: no
   * state document at all (a fresh install, before anything has been written),
   * a state that names no cook, and a state naming a cook the archive no
   * longer holds. Callers used to answer each of those differently — one
   * created the missing document as it read, one returned `null`, one
   * dereferenced it and took the process down.
   *
   * The smoking flag travels either way, because a smoker marked as running
   * with no cook behind it is a thing both the relay path and the alert check
   * have to be able to see.
   *
   * Reads never write. The self-heal that created the state document from a
   * read is gone: seeding the singleton at startup is what covers a fresh
   * install, which leaves this safe to call from anywhere, the reading-ingest
   * path included.
   */
  async resolve(): Promise<CookSnapshot> {
    const state = await this.stateModel.findOne().exec();
    if (!state) {
      return idleCook();
    }
    const smoking = state.smoking === true;
    if (!state.smokeId || state.smokeId.length === 0) {
      return idleCook(smoking);
    }
    const smoke = await this.smokeModel.findById(state.smokeId).exec();
    if (!smoke) {
      // Logged rather than repaired: the repair is a write, and this read is
      // made on the hottest path in the application. Worth saying out loud all
      // the same — a state pointing at a deleted cook is how the smoker ends
      // up stuck, and nothing else in the request notices.
      Logger.warn(
        `the stored state names cook ${state.smokeId}, which no longer exists; reading as idle`,
        'ActiveCook',
      );
      return idleCook(smoking);
    }
    return {
      idle: false,
      smokeId: String(state.smokeId),
      smoke,
      smoking,
    };
  }

  /**
   * Record that the meat of the Active Cook has come off, and say whether this
   * call is the one that recorded it.
   *
   * On the Active Cook rather than on an id, because the gesture is made on the
   * cook that is running: a client carrying an id could stamp a pull onto a
   * cook that finished last weekend. Lost where the pull was already stamped —
   * a step control tapped back and forth, two clients advancing at once, a
   * screen that remounts — so a rest already half over is never restarted. See
   * {@link stampCookPull} for the moment and the temperature.
   */
  async pull(): Promise<CookTransition> {
    const cook = await this.resolve();
    if (!isActive(cook)) {
      return { won: false, cook };
    }
    const won = await stampCookPull(this.stamps, cook.smokeId);
    return { won, cook: await this.resolve() };
  }

  /**
   * End the Active Cook: stamp that it is over, mark it complete, and make the
   * statistics right again. Says whether this call is the one that ended it.
   *
   * The stamp leads, so a cook is never left marked complete with no finish
   * recorded — the state a reader would have to backfill from readings that may
   * not exist. It is written once (see {@link stampCookFinishAt}), which is why
   * the win is decided on the *completion* rather than on the stamp: an
   * auto-stop that already stamped a cook deliberately leaves it in progress,
   * and the pitmaster's late End Smoke has to keep that honest finish while
   * still being the call that completes the cook and recounts the archive.
   *
   * The recompute follows the completion, because that is the moment a cook
   * joins the archive, and only the winner makes it — two phones ending one
   * cook recount it once.
   */
  async finish(): Promise<CookTransition> {
    const cook = await this.resolve();
    if (!isActive(cook)) {
      return { won: false, cook };
    }
    await stampCookFinishAt(this.stamps, cook.smokeId, new Date(), null);
    const completed = await this.smokeModel
      .updateOne(
        { _id: cook.smokeId, status: { $ne: SmokeStatus.Complete } },
        { $set: { status: SmokeStatus.Complete } },
      )
      .exec();
    if (completed.modifiedCount === 0) {
      return { won: false, cook: await this.resolve() };
    }
    await this.recomputeStats(cook.smokeId);
    return { won: true, cook: await this.resolve() };
  }

  /**
   * End a cook nobody ended: record that it was over when its readings
   * stopped, and switch the smoker off.
   *
   * The moment is a parameter because a cook does not end when somebody
   * notices it has — a cook whose readings stopped yesterday finished
   * yesterday, and stamping the noticing would record one that ran until the
   * app was next opened.
   *
   * The stamp leads the flip, because the two failures are not equal. Smoking
   * switched off without a stamp leaves a cook that still derives its duration
   * from a series the box may pollute later, and nothing will trigger again:
   * the flag the staleness rule reads is off. A stamp whose flip then fails is
   * recoverable — the cook's record is already honest, and the next check comes
   * back for the flag, which is why the flip is made whether or not the stamp
   * was this call's to write.
   *
   * What it deliberately does not do is complete the cook. The session stays in
   * progress and stays attached, so the pitmaster still walks the normal End
   * Smoke wizard whenever they next open the app, and the finish stamped here
   * is what their late manual finish then keeps.
   */
  async autoStop(at: Date, notice: string): Promise<CookTransition> {
    const cook = await this.resolve();
    if (!isActive(cook)) {
      return { won: false, cook };
    }
    const stamped = await stampCookFinishAt(this.stamps, cook.smokeId, at);
    await this.switchOff(cook);
    if (!stamped) {
      return { won: false, cook: await this.resolve() };
    }
    return { won: true, cook: await this.resolve() };
  }

  /**
   * Switch the smoking flag off for a cook that is over, and say whether this
   * call is the one that switched it.
   *
   * Conditional on the flag still being on and on the smoker still being
   * attached to the cook this stop is about, so two triggers racing cannot both
   * report a flip — and so a stop decided about yesterday's cook cannot switch
   * off a cook the pitmaster has since started.
   *
   * Not a toggle: a second call must not switch smoking back on, and nothing
   * here stamps a start.
   */
  private async switchOff(cook: ActiveCook): Promise<boolean> {
    const stopped = await this.stateModel
      .updateOne(
        { smokeId: cook.smokeId, smoking: true },
        { $set: { smoking: false } },
      )
      .exec();
    return stopped.modifiedCount > 0;
  }

  /**
   * Recompute the statistics for a finish that is already committed, without
   * letting them fail it.
   *
   * The cook is over by the time this runs. A recompute that threw here would
   * answer a request that succeeded with a 500, and the client's natural retry
   * — finish it again — would lose the conditional write and have nothing left
   * to do. The statistics carry their own staleness guards, so the worst a miss
   * costs is that the next Stats read rebuilds instead of being served.
   */
  private async recomputeStats(smokeId: string): Promise<void> {
    try {
      await this.stats.recompute();
    } catch (error) {
      Logger.warn(
        `the statistics were not recomputed after finishing cook ${smokeId}; the next stats read will rebuild them. ${error}`,
        'ActiveCook',
      );
    }
  }

  /**
   * Attach one child record to the Active Cook — update the one it links, or
   * create one and link it. See {@link attachToCook} for the rule; this adds
   * the cook it is about and the one write that puts a link on a cook.
   */
  async attach<T>(
    key: CookChildKey,
    attachment: ChildAttachment<T>,
  ): Promise<T> {
    return attachToCook(
      await this.resolve(),
      key,
      attachment,
      (cook, childId) => this.link(cook, key, childId),
    );
  }

  /**
   * Put one link on the cook, naming only the key being attached.
   *
   * One field, not the record: the old helper wrote all five links and the
   * status back from the snapshot it had read, so a sibling attached in
   * between — the ratings seed runs inside exactly that window — was
   * overwritten with the stale value. A cook keeps everything this write does
   * not name.
   */
  private async link(
    cook: ActiveCook,
    key: CookChildKey,
    childId: string,
  ): Promise<void> {
    await this.smokeModel
      .updateOne({ _id: cook.smokeId }, { $set: { [key]: childId } })
      .exec();
  }
}
