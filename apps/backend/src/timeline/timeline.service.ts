import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { withSettingsDefaults } from '../appSettings/app-settings.defaults';
import {
  ApplicationSettings,
  ApplicationSettingsDocument,
} from '../appSettings/app-settings.schema';
import { SmokeDocument, SmokeStatus } from '../smoke/smoke.schema';
import { TempDocument } from '../temps/temps.schema';
import {
  deriveTimeline,
  durationBetween,
  momentOf,
  TimelineReading,
  TimelineSmoke,
} from './timeline.derive';
import { SmokeTimeline } from './timeline.dto';
import { primaryWatchedTarget } from './watched-probe';

/**
 * The timing of a cook: when it started, when it ended, how long it ran, how
 * hot it ever got, and what it was being taken to.
 *
 * Deliberately owns its collections rather than the feature services around
 * them. Stamping happens on the two paths that already depend on the smoke —
 * the session's smoking toggle and the finish flow — and a service dependency
 * in either direction closes a DI cycle (`smoke → state`, `settings → profile →
 * common → smoke`). Reading the three collections directly leaves this module
 * with no service edges at all, so anything may depend on it.
 */
@Injectable()
export class TimelineService {
  constructor(
    @InjectModel('Smoke') private readonly smokeModel: Model<SmokeDocument>,
    @InjectModel('Temp') private readonly tempModel: Model<TempDocument>,
    @InjectModel(ApplicationSettings.name)
    private readonly settingsModel: Model<ApplicationSettingsDocument>,
  ) {}

  /**
   * Record that a cook has begun, if it has not already.
   *
   * The condition is part of the write rather than a read beforehand, so a
   * second toggle — or two clients toggling at once — cannot move a start that
   * has already happened. Smoking is stopped and restarted freely during a
   * cook; only the first time is the time it started.
   */
  async stampStart(smokeId: string): Promise<void> {
    await this.smokeModel
      .updateOne(
        { _id: smokeId, startedAt: null },
        { $set: { startedAt: new Date() } },
      )
      .exec();
  }

  /**
   * Record that a cook is over, and what it was being taken to.
   *
   * The target is snapshotted here rather than read back later because the
   * settings it comes from go on being edited: a cook finished at 203°F must
   * still read 203°F after the next one is set up for chicken. Conditional for
   * the same reason as the start — a finish that already happened is not
   * moved, and its snapshot is not rewritten.
   */
  async stampFinish(smokeId: string): Promise<void> {
    const stored = await this.settingsModel.findOne().exec();
    const targetTemp = primaryWatchedTarget(withSettingsDefaults(stored));
    await this.smokeModel
      .updateOne(
        { _id: smokeId, finishedAt: null },
        { $set: { finishedAt: new Date(), targetTemp } },
      )
      .exec();
  }

  /** A stored cook's timeline, by id; an unknown id derives nothing. */
  async getTimeline(smokeId: string): Promise<SmokeTimeline> {
    const smoke = await this.smokeModel.findById(smokeId).exec();
    return this.timelineOf(smoke);
  }

  /**
   * The timeline of a smoke already in hand — the form the readers that walk a
   * list of smokes use, so a row costs one query rather than two.
   */
  async timelineOf(smoke: StoredSmoke | null): Promise<SmokeTimeline> {
    if (!smoke) {
      return deriveTimeline({ complete: false }, []);
    }
    return deriveTimeline(asTimelineSmoke(smoke), await this.readings(smoke));
  }

  /**
   * How long a cook ran — the one number a list of cooks needs, read without
   * loading any of them.
   *
   * The whole series is deliberately not touched here: a twelve-hour cook is
   * tens of thousands of readings, and the history screen asks about every cook
   * ever recorded at once. A stamped cook is answered from the stamps alone,
   * and an unstamped one costs a single indexed row per end.
   */
  async getDurationMs(smoke: StoredSmoke): Promise<number | null> {
    const startedAt = smoke.startedAt ?? (await this.edgeReading(smoke, 1));
    const finishedAt =
      smoke.finishedAt ??
      (smoke.status === SmokeStatus.Complete
        ? await this.edgeReading(smoke, -1)
        : null);
    return durationBetween(startedAt ?? null, finishedAt ?? null);
  }

  /**
   * The moment of a cook's first (`1`) or last (`-1`) *dated* reading, if it
   * kept any.
   *
   * Undated rows are excluded in the query rather than skipped afterwards: a
   * reading may be stored without a date, and ascending order puts every one of
   * them ahead of the whole cook, so the row that came back would carry no
   * moment and the cook would read as having no duration at all — while the
   * derivation behind `GET /timeline/:id`, which ignores undated rows, went on
   * reporting one for the same cook.
   */
  private async edgeReading(
    smoke: StoredSmoke,
    direction: 1 | -1,
  ): Promise<Date | null> {
    if (!smoke.tempsId) {
      return null;
    }
    const edge = await this.tempModel
      .findOne({ tempsId: smoke.tempsId, date: { $ne: null } })
      .sort({ date: direction })
      .exec();
    return edge ? momentOf(edge) : null;
  }

  /** Every reading of a cook, oldest first; none at all when it stored none. */
  private async readings(smoke: {
    tempsId?: string;
  }): Promise<TimelineReading[]> {
    if (!smoke.tempsId) {
      return [];
    }
    return this.tempModel
      .find({ tempsId: smoke.tempsId })
      .sort({ date: 1 })
      .exec();
  }
}

/**
 * A persisted smoke, as much of one as the timeline reads. Structural rather
 * than the Mongoose document type so a caller may hand over a lean object.
 */
export interface StoredSmoke {
  startedAt?: Date | null;
  finishedAt?: Date | null;
  targetTemp?: number | null;
  tempsId?: string;
  status?: SmokeStatus;
}

/** A persisted smoke read as the half the derivation cares about. */
const asTimelineSmoke = (smoke: StoredSmoke): TimelineSmoke => ({
  startedAt: smoke.startedAt ?? null,
  finishedAt: smoke.finishedAt ?? null,
  targetTemp: smoke.targetTemp ?? null,
  complete: smoke.status === SmokeStatus.Complete,
});
