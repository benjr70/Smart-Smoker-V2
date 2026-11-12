import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { isActive } from '../activeCook/active-cook';
import { ActiveCookService } from '../activeCook/active-cook.service';
import { idleThresholdMsOf } from '../appSettings/auto-stop-threshold';
import {
  ApplicationSettings,
  ApplicationSettingsDocument,
} from '../appSettings/app-settings.schema';
import { TimelineService } from '../timeline/timeline.service';

const MS_PER_HOUR = 60 * 60 * 1000;

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
 * What the pitmaster is told about a stop they did not ask for.
 *
 * The number it carries is the threshold rather than the measured silence: the
 * rule the box applied is what explains the stop, and it reads the same
 * whenever they get to the message. Composed here because the threshold is this
 * module's rule — the Active Cook decides whether the notice is sent, not what
 * it says.
 */
const autoStopNotice = (thresholdHours: number): string =>
  `Cook auto-stopped after ${formatHours(
    thresholdHours,
  )} idle — open the app to finish it`;

/**
 * The one place that decides an abandoned cook is over.
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
 * themselves, so the two cannot drift apart in what "stale" means.
 *
 * The decision is all this holds. Ending the cook is a transition of the cook,
 * and belongs to the module that owns them: this service writes nothing about
 * cook state, recomputes nothing and announces nothing, which is what let its
 * own stop procedure, its cook-model access and its duplicate stats recompute
 * go. See {@link ActiveCookService.autoStop} for what a stop *is*, including
 * why it deliberately leaves the cook in progress.
 */
@Injectable()
export class StaleCookService {
  constructor(
    /**
     * The cook itself: whether one is running, and the transition that ends it.
     * A plain reference — the Active Cook imports no feature module, so the
     * `forwardRef` that used to hold this service to the session and the
     * gateway is gone.
     */
    private readonly activeCook: ActiveCookService,
    /**
     * Where the cook's series ends, by both clocks. Through the timeline
     * because that is the one read of a series' edges, and the staleness rule
     * is about temperature readings — which is the half of this decision that
     * stays here.
     */
    private readonly timeline: TimelineService,
    @InjectModel(ApplicationSettings.name)
    private readonly settingsModel: Model<ApplicationSettingsDocument>,
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
   * Nothing is reported for a stop this call did not win. A cook that already
   * carries a finish has been stopped — by an earlier trigger, or by the user —
   * and the stop was reported when it was stamped; the Active Cook still
   * switches its smoking flag off, which is how a stop interrupted between its
   * two writes is finished off.
   */
  async autoStopIfStale(
    now: Date = new Date(),
  ): Promise<AutoStoppedCook | null> {
    const cook = await this.activeCook.resolve();
    if (!isActive(cook) || !cook.smoking) {
      return null;
    }
    const lastReading = await this.timeline.lastReading(cook.smoke);
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
    const stopped = await this.activeCook.autoStop(
      lastReadingAt,
      autoStopNotice(thresholdHours),
    );
    if (!stopped.won) {
      return null;
    }
    return {
      smokeId: cook.smokeId,
      finishedAt: lastReadingAt,
      idleHours: idleMs / MS_PER_HOUR,
      thresholdHours,
    };
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
    // speaks in hours because the stop notice quotes the rule to the pitmaster
    // in hours.
    return idleThresholdMsOf(stored) / MS_PER_HOUR;
  }
}
