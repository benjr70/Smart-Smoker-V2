import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ApplicationSettings,
  ApplicationSettingsDocument,
} from '../appSettings/app-settings.schema';
import { cookEventsOfSmoke } from '../cookEvents/cook-events.filter';
import { PUSH_NOTICE, PushNoticePort } from '../pushDispatcher/push-notice';
import { SmokeDocument, SmokeStatus } from '../smoke/smoke.schema';
import {
  DEFAULT_SMOKE_PROFILE,
  SmokeProFileDocument,
} from '../smokeProfile/smokeProfile.schema';
import { STATE_SINGLETON_ID, StateDocument } from '../State/state.schema';
import { STATS_RECOMPUTE, StatsRecomputePort } from '../stats/stats-recompute';
import { TempDocument } from '../temps/temps.schema';
import { COOK_BROADCAST, CookBroadcastPort } from '../websocket/cook-broadcast';
import {
  ActiveCook,
  ActiveCookTransitions,
  attachToCook,
  ChildAttachment,
  ClearedCook,
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
 * Who a push from this installation says it is from. Fixed here rather than
 * brought by the caller: the title names the application, and the sentence
 * underneath it is what varies.
 */
const PUSH_TITLE = 'Smoker';

/**
 * How long the push fan-out is given to finish before the notice is abandoned.
 *
 * The dispatcher talks to third-party push endpoints, and an endpoint that
 * accepts the connection and then never answers holds its promise open until
 * TCP gives up — minutes. Nothing here waits on the notice, so the only thing
 * this bounds is how long a doomed send may sit in memory holding the cook's
 * message; generous enough that a slow-but-alive push service still delivers.
 */
const PUSH_TIMEOUT_MS = 10_000;

/**
 * The given work, or a rejection once the deadline passes — because a promise
 * that never settles is not a failure any `catch` can see.
 *
 * The timer is cleared when the work settles first, and unreferenced so a send
 * still in flight cannot by itself keep the process (or a test run) alive.
 */
const withDeadline = <T>(work: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    timer.unref?.();
  });
  return Promise.race([Promise.resolve(work), deadline]).finally(() =>
    clearTimeout(timer),
  );
};

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
    /**
     * What the cook's probes are called, for the frame a stop announcement
     * carries. Its model for the same reason the cook is: the service that
     * wraps it drags the statistics, the ratings and this very module in behind
     * it, and all this needs is a find-by-id for four names.
     */
    @InjectModel('SmokeProfile')
    private readonly profileModel: Model<SmokeProFileDocument>,
    /**
     * The cook log, thrown out with a session that is discarded. Its model
     * rather than `CookEventsService`: that service reads the Active Cook to
     * find the cook its rows belong to, so injecting it here would close a DI
     * cycle. Removing rows by the cook they belong to carries none of its
     * policy — the filter it reads them with is shared instead.
     */
    @InjectModel('CookEvent')
    private readonly cookEventModel: Model<unknown>,
    /** See {@link STATS_RECOMPUTE}. Called once, by a finish that won. */
    @Inject(STATS_RECOMPUTE) private readonly stats: StatsRecomputePort,
    /**
     * The socket every open app is listening on. A transition the clients are
     * not told about is undone by the next press of a button on a screen that
     * still believes the old state; see {@link COOK_BROADCAST}.
     */
    @Inject(COOK_BROADCAST) private readonly broadcast: CookBroadcastPort,
    /**
     * The phones. The socket only reaches an app that is open, and the whole
     * premise of an abandoned cook is that nobody is looking; see
     * {@link PUSH_NOTICE}.
     */
    @Inject(PUSH_NOTICE) private readonly push: PushNoticePort,
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
    await this.recomputeStats(cook.smokeId);
    this.announcePush(cook.smokeId, notice);
    return { won: true, cook: await this.resolve() };
  }

  /**
   * Tell the pitmaster, wherever they are, that the box ended their cook.
   *
   * Sent from the branch that won the conditional stamp and after the stop is
   * committed, so two triggers racing produce one notice and no notice is ever
   * sent for a stop that did not happen.
   *
   * Nothing waits for it. What noticed the abandoned cook is a poll of a
   * timeline or a reading arriving over the socket, and neither may be held up
   * because a phone is hard to reach — a subscriber's push endpoint that
   * accepts the connection and then never answers would otherwise stall that
   * request until TCP gave up, which no `catch` around an `await` can prevent.
   * So the send is started here and left to finish on its own: the fan-out is
   * issued before this returns (one stop, one notice), the delivery is bounded
   * by {@link PUSH_TIMEOUT_MS}, and every outcome is swallowed inside, so the
   * promise dropped on the floor can neither reject nor outlive the box.
   */
  private announcePush(smokeId: string, notice: string): void {
    void this.deliverPush(smokeId, notice);
  }

  /**
   * The send itself, with every way it can end funnelled into a log line: a
   * rejection, a synchronous throw from a dispatcher that is not wired up, and
   * the deadline that stands in for the endpoint which never answers. The stop
   * is already written, and none of these may become an unhandled rejection.
   */
  private async deliverPush(smokeId: string, notice: string): Promise<void> {
    try {
      await withDeadline(
        this.push.notify(PUSH_TITLE, notice),
        PUSH_TIMEOUT_MS,
      );
    } catch (error) {
      Logger.warn(
        `cook ${smokeId} was auto-stopped but no push could be delivered. ${error}`,
        'ActiveCook',
      );
    }
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
    if (stopped.modifiedCount === 0) {
      return false;
    }
    await this.announceStop(cook);
    return true;
  }

  /**
   * Tell every connected app the cook is no longer smoking, without letting a
   * silent socket fail the stop that happened.
   *
   * Announced from inside the flip because the two belong together wherever the
   * flag is written by the backend: the apps hold the flag in memory and learn
   * of a change only from this event, and their Stop button toggles what they
   * hold. Only the call that actually flipped announces, so two triggers racing
   * produce one announcement.
   *
   * The frame carries the cook's names because that is what a `smokeUpdate` is
   * and the apps apply all of it; a cook that never had a profile written is
   * announced with the names it would be served on a fresh read, rather than
   * blanks that would wipe the labels on screen.
   */
  private async announceStop(cook: ActiveCook): Promise<void> {
    try {
      const profileId = cook.smoke.smokeProfileId;
      const profile = profileId
        ? await this.profileModel.findById(profileId).exec()
        : null;
      this.broadcast.broadcastSmokeUpdate({
        smoking: false,
        chamberName: profile?.chamberName ?? DEFAULT_SMOKE_PROFILE.chamberName,
        probe1Name: profile?.probe1Name ?? DEFAULT_SMOKE_PROFILE.probe1Name,
        probe2Name: profile?.probe2Name ?? DEFAULT_SMOKE_PROFILE.probe2Name,
        probe3Name: profile?.probe3Name ?? DEFAULT_SMOKE_PROFILE.probe3Name,
      });
    } catch (error) {
      Logger.warn(
        `cook ${cook.smokeId} was stopped but the clients could not be told; they will read the stopped state on their next load. ${error}`,
        'ActiveCook',
      );
    }
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
   * Put the session away: detach the cook, throw its log out if it was never
   * finished, and tell every open screen there is no cook log to show.
   *
   * The detach is the conditional write, and it is what names the cook being
   * put away: one atomic flip of the slot answers both "was this call the one
   * that detached" and "which cook was attached when it did". Resolving the
   * cook first and clearing second would let two clears each think they had the
   * cook — and would refuse to detach a state left naming a cook the archive no
   * longer holds, which reads as idle and is exactly the dangling session this
   * is relied on to heal.
   *
   * The log goes after the detach rather than before, and never fails the
   * clear. Events left behind belong to a cook nothing points at any more,
   * which is untidy; a session the pitmaster asked to clear that stayed set up
   * because a delete failed is far worse — the next cook would record into the
   * last one.
   */
  async clear(): Promise<ClearedCook> {
    const attached = await this.stateModel
      .findOneAndUpdate(
        // Something has to be attached. An idle smoker has no session to put
        // away, and nothing to tell the screens about.
        { smokeId: { $nin: ['', null] } },
        { $set: { smokeId: '', smoking: false } },
      )
      .exec();
    const state = await this.stateModel.findOne().exec();
    if (!attached) {
      return { won: false, cook: await this.resolve(), state };
    }
    await this.discardCookLog(String(attached.smokeId));
    this.announceEmptyCookLog();
    return { won: true, cook: await this.resolve(), state };
  }

  /**
   * The cook log of a session being thrown away — and only of one being thrown
   * away.
   *
   * Clearing is not only how an abandoned session is discarded: it is also the
   * last step of finishing a cook (the wizard finishes the cook, then clears
   * the session that still names it), so the clear alone cannot say which of
   * the two is happening. The cook's own status can. A completed cook is
   * archived, its log is its history, and this must not touch it; an unfinished
   * one is being thrown out, and a log left behind would belong to a session
   * nothing points at any more.
   *
   * A cook the archive no longer holds is treated as unfinished: what is left
   * of it is an orphaned log, and nothing is archived that could lose by its
   * removal.
   *
   * Never throws: the session *is* cleared by the time this runs, and a
   * database hiccup here must not turn that into an error the pitmaster
   * retries.
   */
  private async discardCookLog(smokeId: string): Promise<void> {
    try {
      const smoke = await this.smokeModel.findById(smokeId).exec();
      if (smoke?.status === SmokeStatus.Complete) {
        return;
      }
      await this.cookEventModel.deleteMany(cookEventsOfSmoke(smokeId)).exec();
    } catch (error) {
      Logger.error(
        `could not discard the cook log of ${smokeId}: ${error}`,
        'ActiveCook',
      );
    }
  }

  /**
   * Tell every connected client that there is no cook log to show.
   *
   * Empty whichever way the clear went: a discarded session's events are gone,
   * and a finished cook's are kept but belong to a cook the session no longer
   * names — and what a live screen shows is the log of the cook in progress.
   *
   * Announced because the screens do not unmount when a session is cleared —
   * the stale-cook recovery clears from under a mounted smoke step. Without it
   * the card keeps showing the cleared cook's entries, and a Remove tapped
   * there deletes an event of a cook that has been put away. Never throws: the
   * session is cleared, and an unreachable socket must not make that an error.
   */
  private announceEmptyCookLog(): void {
    try {
      this.broadcast.broadcastCookEvents([]);
    } catch (error) {
      Logger.error(
        `could not announce the cleared cook log: ${error}`,
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
