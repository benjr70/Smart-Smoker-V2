import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ApplicationSettings,
  ApplicationSettingsDocument,
} from '../appSettings/app-settings.schema';
import { SmokeDocument } from '../smoke/smoke.schema';
import { StateService } from '../State/state.service';
import { StatsService } from '../stats/stats.service';
import { TimelineService } from '../timeline/timeline.service';

/**
 * How long a cook still marked as smoking may go without a reading before it is
 * taken to be over, when the settings document does not say.
 *
 * The setting itself is the threshold's home (see {@link idleThresholdMs}); this
 * is what a document written before the field existed reads as, and what the
 * shipped default is.
 */
const DEFAULT_AUTO_STOP_IDLE_HOURS = 6;

const MS_PER_HOUR = 60 * 60 * 1000;

/** What an auto-stop did, for the caller that has to tell somebody about it. */
export interface AutoStoppedCook {
  /** The cook that was stopped. */
  smokeId: string;
  /** The moment it was recorded as having finished: its last real reading. */
  finishedAt: Date;
  /** How long its readings had been silent when the threshold was crossed. */
  idleHours: number;
}

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
     * The cook itself, read through its model rather than `SmokeService`:
     * that service depends on the state and on the statistics, both of which
     * are dependencies here, so injecting it would close a DI cycle. The read
     * is a find-by-id and carries none of its policy.
     */
    @InjectModel('Smoke') private readonly smokeModel: Model<SmokeDocument>,
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
   * is older than the threshold.
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
    const lastReadingAt = await this.timeline.lastReadingAt(smoke);
    if (!lastReadingAt) {
      return null;
    }
    const idleMs = now.getTime() - lastReadingAt.getTime();
    if (idleMs <= (await this.idleThresholdMs())) {
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
      await this.state.stopSmoking(String(smoke._id));
      return null;
    }
    return this.stop(String(smoke._id), lastReadingAt, idleMs);
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
    smokeId: string,
    finishedAt: Date,
    idleMs: number,
  ): Promise<AutoStoppedCook | null> {
    const stamped = await this.timeline.stampFinishAt(smokeId, finishedAt);
    await this.state.stopSmoking(smokeId);
    if (!stamped) {
      return null;
    }
    await this.restatArchive(smokeId);
    return { smokeId, finishedAt, idleHours: idleMs / MS_PER_HOUR };
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
   */
  private async idleThresholdMs(): Promise<number> {
    const stored = await this.settingsModel.findOne().exec();
    const hours = (stored as StoredAutoStopSettings | null)?.autoStop
      ?.idleHours;
    return (
      (typeof hours === 'number' && isFinite(hours) && hours > 0
        ? hours
        : DEFAULT_AUTO_STOP_IDLE_HOURS) * MS_PER_HOUR
    );
  }
}

/**
 * The settings document as this service reads it: structurally, so the read
 * survives a stored document written before the auto-stop block existed.
 */
interface StoredAutoStopSettings {
  autoStop?: { idleHours?: number } | null;
}
