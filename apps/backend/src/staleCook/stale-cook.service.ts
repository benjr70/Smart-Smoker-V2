import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { idleThresholdMsOf } from '../appSettings/auto-stop-threshold';
import {
  ApplicationSettings,
  ApplicationSettingsDocument,
} from '../appSettings/app-settings.schema';
import { PushDispatcherService } from '../pushDispatcher/push-dispatcher.service';
import { SmokeDocument } from '../smoke/smoke.schema';
import {
  DEFAULT_SMOKE_PROFILE,
  SmokeProFileDocument,
} from '../smokeProfile/smokeProfile.schema';
import { StateService } from '../State/state.service';
import { StatsService } from '../stats/stats.service';
import { TimelineService } from '../timeline/timeline.service';
import { EventsGateway } from '../websocket/events.gateway';

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * The cook being stopped, as the stop itself reads one: which cook it is, and
 * where to find what its probes are called.
 *
 * Structural rather than the stored document type so the stop is written
 * against the two fields it uses, and so a caller may hand over a lean object.
 */
interface StoppableCook {
  _id: unknown;
  smokeProfileId?: string;
}

/** What an auto-stop did, for the caller that has to tell somebody about it. */
export interface AutoStoppedCook {
  /** The cook that was stopped. */
  smokeId: string;
  /** The moment it was recorded as having finished: its last real reading. */
  finishedAt: Date;
  /** How long its readings had been silent when the threshold was crossed. */
  idleHours: number;
  /** The configured silence that ended it — the rule, not the measurement. */
  thresholdHours: number;
}

/**
 * How long the push fan-out is given to finish before the announcement is
 * abandoned.
 *
 * The dispatcher talks to third-party push endpoints, and an endpoint that
 * accepts the connection and then never answers holds its promise open until
 * TCP gives up — minutes. Nothing here waits on the announcement, so the only
 * thing this bounds is how long a doomed send may sit in memory holding the
 * cook's message; generous enough that a slow-but-alive push service still
 * delivers.
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
 * Hours as a sentence says them: a whole number carries no decimal point, a
 * fractional threshold keeps the digits the operator typed, and one hour is
 * singular. Rounded first, because a stored threshold is a float and
 * `5.999999999` is six hours to everyone but a computer.
 */
const formatHours = (hours: number): string => {
  const rounded = Number(hours.toFixed(2));
  return `${rounded} ${rounded === 1 ? 'hour' : 'hours'}`;
};

/**
 * The one place that decides an abandoned cook is over, and ends it.
 *
 * A session whose smoking flag was never switched off goes on claiming to be
 * running for as long as nobody presses End Smoke — and because an unstamped
 * cook's duration is read from the ends of its temperature series, the next
 * power-on of the box weeks later lands in the old cook and records one that
 * "ran" for a fortnight. The cure is to notice the silence and end the cook at
 * its last real reading.
 *
 * Both things that can notice — a reading arriving after a long gap, and any
 * app polling the current timeline — come here rather than deciding for
 * themselves, so the two cannot drift apart in what "stale" means or in what
 * stopping does. Every write it makes is conditional, so two of them racing
 * stamp the cook exactly once and exactly one of them is told it happened.
 *
 * What it deliberately does not do: complete the cook. The session stays
 * InProgress and current, so the pitmaster still walks the normal End Smoke
 * wizard whenever they next open the app; the finish stamp written here is what
 * their late manual finish then keeps.
 */
@Injectable()
export class StaleCookService {
  private readonly logger = new Logger(StaleCookService.name);

  constructor(
    private readonly state: StateService,
    private readonly timeline: TimelineService,
    /**
     * The statistics of the archive, recomputed once a cook has been stopped —
     * its honest duration is one of the numbers they are made of.
     */
    private readonly stats: StatsService,
    /**
     * The socket every app is listening on. A stop the clients are not told
     * about is undone by the next press of a Stop button that still believes
     * the cook is running — see {@link announceStop}.
     *
     * Forward-referenced because the gateway is also a trigger: the reading
     * path there calls {@link autoStopIfStale}, so the two depend on each other
     * and Nest has to resolve one of them lazily. Wiring only; nothing about
     * the announcement changed.
     */
    @Inject(forwardRef(() => EventsGateway))
    private readonly events: EventsGateway,
    /**
     * The phones. The socket only reaches an app that is open, and the whole
     * premise of a stale cook is that nobody is looking — see
     * {@link announcePush}.
     */
    private readonly push: PushDispatcherService,
    /**
     * The cook itself, read through its model rather than `SmokeService`:
     * that service depends on the state and on the statistics, both of which
     * are dependencies here, so injecting it would close a DI cycle. The read
     * is a find-by-id and carries none of its policy.
     */
    @InjectModel('Smoke') private readonly smokeModel: Model<SmokeDocument>,
    @InjectModel(ApplicationSettings.name)
    private readonly settingsModel: Model<ApplicationSettingsDocument>,
    /**
     * What the cook's probes are called, read through its model for the same
     * reason the cook is: the service that wraps it drags the statistics, the
     * ratings and the current-smoke reader in behind it, and all this needs is
     * a find-by-id for the names the stop announcement carries.
     */
    @InjectModel('SmokeProfile')
    private readonly profileModel: Model<SmokeProFileDocument>,
  ) {}

  /**
   * Stop the current cook if its readings have been silent for longer than the
   * configured threshold, and say what was stopped — `null` when nothing was.
   *
   * `now` is a parameter rather than the clock, as everywhere else in this
   * codebase's timing code, so the decision is a function of its inputs.
   *
   * The three conditions are the whole policy: smoking is on (a cook the user
   * deliberately paused, or one they are ending through the wizard, is theirs
   * to finish), the cook has at least one dated reading (a session prepared the
   * night before is not abandoned, it has not started), and the newest reading
   * is older than the threshold — by the device's clock and by the store's
   * alike, so that a smoker whose clock is behind cannot have a live cook
   * stopped underneath it.
   *
   * A stale cook that already carries a finish is not stopped again — but its
   * smoking flag is still switched off, which is how a stop interrupted between
   * its two writes is finished off. Nothing is reported for that: the stop was
   * reported when it was stamped.
   */
  async autoStopIfStale(
    now: Date = new Date(),
  ): Promise<AutoStoppedCook | null> {
    const state = await this.state.GetState();
    if (!state?.smoking || !state.smokeId) {
      return null;
    }
    const smoke = await this.smokeModel.findById(state.smokeId).exec();
    if (!smoke) {
      return null;
    }
    const lastReading = await this.timeline.lastReading(smoke);
    if (!lastReading) {
      return null;
    }
    const lastReadingAt = lastReading.readAt;
    const idleMs = now.getTime() - lastReadingAt.getTime();
    // Both clocks have to call the cook silent. The reading's date is the
    // device's, and a smoker whose clock is behind reports a cook that is
    // plainly alive as ancient; the store's own record of when it accepted
    // that reading cannot be moved by any device. Stopping a live cook is the
    // expensive mistake — the gateway drops readings once smoking is off, so
    // the rest of a real cook would go unrecorded — and leaving a zombie one
    // running an hour longer is not.
    const storedIdleMs = lastReading.storedAt
      ? now.getTime() - lastReading.storedAt.getTime()
      : idleMs;
    const thresholdHours = await this.idleThresholdHours();
    const threshold = thresholdHours * MS_PER_HOUR;
    if (idleMs <= threshold || storedIdleMs <= threshold) {
      return null;
    }
    // A cook that already carries a finish has been stopped — by an earlier
    // auto-stop, or by the user — and its stamps are not written twice. Its
    // smoking flag is switched off all the same: a stop whose flip failed after
    // its stamp was written leaves exactly that shape, a cook recorded as
    // finished by a session that still says it is running, and this poll is the
    // only thing that will ever come back for it. Nothing is reported and the
    // statistics are left alone, because the stop itself was reported when it
    // was stamped.
    if (smoke.finishedAt) {
      await this.switchOff(smoke);
      return null;
    }
    return this.stop(smoke, lastReadingAt, idleMs, thresholdHours);
  }

  /**
   * End the cook: stamp its finish where its readings stopped, then switch
   * smoking off.
   *
   * The stamp leads, because the two failures are not equal. Smoking switched
   * off without a stamp leaves a cook that still derives its duration from a
   * series the box may pollute later, and nothing will trigger again — the flag
   * this service reads is off. A stamp whose flip then fails is recoverable:
   * the cook's record is already honest, and the next check comes back for the
   * flag (see the stamped-cook branch of {@link autoStopIfStale}).
   *
   * Whoever wins the conditional stamp is the one caller told a stop happened,
   * and the only one that recomputes the statistics.
   */
  private async stop(
    smoke: StoppableCook,
    finishedAt: Date,
    idleMs: number,
    thresholdHours: number,
  ): Promise<AutoStoppedCook | null> {
    const smokeId = String(smoke._id);
    const stamped = await this.timeline.stampFinishAt(smokeId, finishedAt);
    await this.switchOff(smoke);
    if (!stamped) {
      return null;
    }
    await this.restatArchive(smokeId);
    this.announcePush(smokeId, thresholdHours);
    return {
      smokeId,
      finishedAt,
      idleHours: idleMs / MS_PER_HOUR,
      thresholdHours,
    };
  }

  /**
   * Tell the pitmaster, wherever they are, that the box ended their cook.
   *
   * The socket announcement only reaches an app that is already open, and a
   * cook goes stale precisely because nobody is watching one; the push is the
   * only thing that reaches somebody who walked away days ago and never pressed
   * End Smoke. It rides here, in the branch that won the conditional stamp and
   * after the stop is committed, so two triggers racing produce one push and no
   * push is ever sent for a stop that did not happen.
   *
   * The number it carries is the threshold rather than the measured silence:
   * the rule the box applied is what explains a stop the user did not ask for,
   * and it reads the same whenever they get to the message.
   *
   * Nothing waits for it. What noticed the zombie is a poll of a timeline or a
   * reading arriving over the socket, and neither may be held up because a
   * phone is hard to reach — a subscriber's push endpoint that accepts the
   * connection and then never answers would otherwise stall that request until
   * TCP gave up, which no `catch` around an `await` can prevent. So the send is
   * started here and left to finish on its own: the fan-out is issued before
   * this returns (one stop, one push), the delivery is bounded by
   * {@link PUSH_TIMEOUT_MS}, and every outcome is swallowed inside, so the
   * promise dropped on the floor can neither reject nor outlive the box.
   */
  private announcePush(smokeId: string, thresholdHours: number): void {
    void this.deliverPush(smokeId, thresholdHours);
  }

  /**
   * The send itself, with every way it can end funnelled into a log line: a
   * rejection, a synchronous throw from a dispatcher that is not wired up, and
   * the deadline that stands in for the endpoint which never answers. The stop
   * is already written, and none of these may become an unhandled rejection.
   */
  private async deliverPush(
    smokeId: string,
    thresholdHours: number,
  ): Promise<void> {
    try {
      await withDeadline(
        this.push.notify(
          'Smoker',
          `Cook auto-stopped after ${formatHours(
            thresholdHours,
          )} idle — open the app to finish it`,
        ),
        PUSH_TIMEOUT_MS,
      );
    } catch (error) {
      this.logger.warn(
        `Smoke ${smokeId} was auto-stopped but no push could be delivered. ${error}`,
      );
    }
  }

  /**
   * Switch the session's smoking flag off, and tell the apps it went off.
   *
   * The two belong together wherever the flag is flipped. The apps hold the
   * flag in memory and only ever learn it changed from the socket, and their
   * Stop button toggles what they hold: a kiosk that was left showing the
   * abandoned cook would flip a stop it never heard about straight back on,
   * restarting the cook this service just ended. Only the call that actually
   * flipped announces, so two triggers racing produce one announcement.
   */
  private async switchOff(smoke: StoppableCook): Promise<void> {
    if (await this.state.stopSmoking(String(smoke._id))) {
      await this.announceStop(smoke);
    }
  }

  /**
   * Tell every connected app the cook is no longer smoking, without letting a
   * silent socket fail the read that noticed.
   *
   * The frame carries the cook's names because that is what a `smokeUpdate`
   * is and the apps apply all of it; a session that never had a profile
   * written is announced with the names it would be served on a fresh read,
   * rather than blanks that would wipe the labels on screen.
   */
  private async announceStop(smoke: StoppableCook): Promise<void> {
    try {
      const profile = smoke.smokeProfileId
        ? await this.profileModel.findById(smoke.smokeProfileId).exec()
        : null;
      this.events.broadcastSmokeUpdate({
        smoking: false,
        chamberName: profile?.chamberName ?? DEFAULT_SMOKE_PROFILE.chamberName,
        probe1Name: profile?.probe1Name ?? DEFAULT_SMOKE_PROFILE.probe1Name,
        probe2Name: profile?.probe2Name ?? DEFAULT_SMOKE_PROFILE.probe2Name,
        probe3Name: profile?.probe3Name ?? DEFAULT_SMOKE_PROFILE.probe3Name,
      });
    } catch (error) {
      this.logger.warn(
        `Smoke ${String(
          smoke._id,
        )} was auto-stopped but the clients could not be told; they will read the stopped state on their next load. ${error}`,
      );
    }
  }

  /**
   * Recompute the statistics now that the archive holds one more finished cook,
   * without letting them fail the read that noticed.
   *
   * This runs behind a poll of the current timeline, or behind a reading
   * arriving over the websocket: neither has anything to do with the numbers on
   * the Stats screen, and failing them because a recompute threw would break a
   * running cook's display over a screen nobody is looking at. The statistics
   * carry their own staleness guards, so the cost of a miss is a rebuild at the
   * next Stats read.
   */
  private async restatArchive(smokeId: string): Promise<void> {
    try {
      await this.stats.recalculate();
    } catch (error) {
      this.logger.warn(
        `Statistics were not recomputed after auto-stopping smoke ${smokeId}; the next stats read will rebuild them. ${error}`,
      );
    }
  }

  /**
   * How long the readings may be silent before the cook is taken to be over,
   * from the application settings.
   *
   * Read on every check rather than cached, so an operator who lengthens the
   * threshold mid-cook is obeyed by the next poll. A stored document that
   * predates the field, or one carrying nonsense, reads as the shipped default
   * rather than as `undefined` — which would compare as "never idle" and leave
   * the zombie cooks this exists to end.
   *
   * Read lean, which here is not an optimisation: hydrating a document against
   * the settings schema returns only the paths that schema declares, and the
   * auto-stop block is written by a different slice from this reader. Until
   * both have landed a hydrated read would hand back a document with no
   * threshold on it whatever the operator had stored, and this would go on
   * quietly applying the default. A lean read is of what is stored, so
   * whichever slice arrives first, the other works the day it lands.
   */
  private async idleThresholdHours(): Promise<number> {
    const stored: unknown = await this.settingsModel.findOne().lean().exec();
    // Read as milliseconds and told here in hours: the shared reader is the
    // one place that decides what a stored threshold means, and this service
    // speaks in hours because the stop announcement quotes the rule to the
    // pitmaster in hours.
    return idleThresholdMsOf(stored) / MS_PER_HOUR;
  }
}
