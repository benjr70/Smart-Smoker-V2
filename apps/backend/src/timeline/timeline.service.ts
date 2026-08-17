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
import { StateDocument } from '../State/state.schema';
import { PreSmoke, PreSmokeDocument } from '../presmoke/presmoke.schema';
import { estimateCompletion } from './completion-estimate';
import { CurrentCook, sampleHistoricalRate } from './history-rate';
import {
  deriveTimeline,
  durationBetween,
  firstMeatReading,
  momentOf,
  probeSeries,
  TimelineReading,
  TimelineSmoke,
} from './timeline.derive';
import { CurrentSmokeTimeline, SmokeTimeline } from './timeline.dto';
import { primaryWatchedProbe, primaryWatchedTarget } from './watched-probe';

/**
 * How many of the user's most recent finished cooks the historical rate is read
 * from.
 */
const HISTORY_SAMPLE_SIZE = 10;

/**
 * How many rows from the start of a past cook are read looking for the first
 * reading the meat actually took.
 */
const OPENING_ROWS = 50;

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
    @InjectModel('state') private readonly stateModel: Model<StateDocument>,
    @InjectModel(PreSmoke.name)
    private readonly preSmokeModel: Model<PreSmokeDocument>,
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

  /**
   * The cook in progress: its timeline so far, and when it will be done.
   *
   * `now` is a parameter rather than read from the clock inside, so that the
   * projection is a function of its inputs and can be exercised against a fixed
   * moment.
   */
  async getCurrentTimeline(
    now: Date = new Date(),
  ): Promise<CurrentSmokeTimeline> {
    const state = await this.stateModel.findOne().exec();
    const smoke = state?.smokeId
      ? await this.smokeModel.findById(state.smokeId).exec()
      : null;
    // The series is read once and derived from twice: the timeline and the
    // projection want the same readings, and a running cook's series is the
    // largest read this route makes.
    const readings = smoke ? await this.readings(smoke) : [];
    const timeline = smoke
      ? deriveTimeline(asTimelineSmoke(smoke), readings)
      : deriveTimeline({ complete: false }, []);
    const settings = withSettingsDefaults(
      await this.settingsModel.findOne().exec(),
    );
    const probe = primaryWatchedProbe(settings);
    return {
      ...timeline,
      estimate: estimateCompletion({
        readings: probeSeries(readings, probe?.slot, timeline.startedAt),
        target: probe?.target ?? null,
        smoking: state?.smoking === true,
        now,
        historicalRate: await this.historicalRate(smoke),
      }),
    };
  }

  /**
   * What this user's past cooks say the meat on the smoker climbs at, or `null`
   * when their history cannot say.
   *
   * Only the most recent cooks are read: the whole point of the sample is the
   * middle of it, a hundredth cook cannot move that, and every cook read costs a
   * pre-smoke and a first-reading query on a route the clients poll.
   */
  private async historicalRate(
    smoke: StoredSmoke | null,
  ): Promise<number | null> {
    const current = await this.cookOf(smoke);
    if (!current?.meatType) {
      // Nothing was typed into the pre-smoke form, so no past cook can be
      // matched to this one and the history read is not worth making.
      return null;
    }
    const completed = await this.smokeModel
      .find({ status: SmokeStatus.Complete })
      .sort({ date: -1 })
      .limit(HISTORY_SAMPLE_SIZE)
      .exec();
    const cooks = await Promise.all(
      completed.map(async (past) => ({
        ...(await this.cookOf(past)),
        targetTemp: past.targetTemp ?? null,
        durationMs: await this.getDurationMs(past),
        startTemp: firstMeatReading(await this.openingReadings(past)),
      })),
    );
    return sampleHistoricalRate(cooks, current);
  }

  /** What a cook was of and what it weighed, from its pre-smoke stage. */
  private async cookOf(smoke: StoredSmoke | null): Promise<CurrentCook | null> {
    if (!smoke?.preSmokeId) {
      return null;
    }
    const preSmoke = await this.preSmokeModel.findById(smoke.preSmokeId).exec();
    return {
      meatType: preSmoke?.meatType ?? null,
      weight: preSmoke?.weight?.weight ?? null,
      weightUnit: preSmoke?.weight?.unit ?? null,
    };
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

  /**
   * The opening rows of a cook's series, oldest first — enough of them to find
   * where the meat started.
   *
   * Not merely the first row: a cook records while the chamber comes up to heat
   * and the meat probes still read zero, and reading the climb from that one
   * row would find no meat reading at all and drop the whole cook out of the
   * history sample. Bounded, because a whole series is tens of thousands of
   * rows and this is read once per past cook on a polled route.
   */
  private async openingReadings(
    smoke: StoredSmoke,
  ): Promise<TimelineReading[]> {
    if (!smoke.tempsId) {
      return [];
    }
    return this.tempModel
      .find({ tempsId: smoke.tempsId, date: { $ne: null } })
      .sort({ date: 1 })
      .limit(OPENING_ROWS)
      .exec();
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
  /** The pre-smoke stage carrying what the cook was of, and what it weighed. */
  preSmokeId?: string;
  status?: SmokeStatus;
}

/** A persisted smoke read as the half the derivation cares about. */
const asTimelineSmoke = (smoke: StoredSmoke): TimelineSmoke => ({
  startedAt: smoke.startedAt ?? null,
  finishedAt: smoke.finishedAt ?? null,
  targetTemp: smoke.targetTemp ?? null,
  complete: smoke.status === SmokeStatus.Complete,
});
