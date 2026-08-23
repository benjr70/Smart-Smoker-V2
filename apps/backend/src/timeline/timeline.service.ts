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
import {
  estimateCompletion,
  LIVE_WINDOW_MINUTES,
  needsHistoricalRate,
} from './completion-estimate';
import { CurrentCook, isSameMeat, sampleHistoricalRate } from './history-rate';
import {
  deriveTimeline,
  durationBetween,
  firstMeatReading,
  MEAT_FIELDS,
  momentOf,
  probeField,
  probeSeries,
  TEMP_FIELDS,
  TimelineReading,
  TimelineSmoke,
} from './timeline.derive';
import { CurrentSmokeTimeline, SmokeTimeline } from './timeline.dto';
import { primaryWatchedProbe, primaryWatchedTarget } from './watched-probe';

/**
 * How many rows from the start of a cook are read looking for the first reading
 * the meat actually took.
 *
 * Not merely the first row: a cook records while the chamber comes up to heat
 * and the meat probes still read zero, and a probe pushed in late reads zero for
 * a while after that. At a row every ten seconds or so this is the better part
 * of half an hour of that, which is longer than any of it lasts.
 */
const OPENING_ROWS = 200;

/** The fields a series' peaks are asked for, and the shape they come back in. */
const PEAK_FIELDS = TEMP_FIELDS;

/** The highest each probe read across a cook, absent where none did. */
type SeriesPeaks = Partial<Record<(typeof PEAK_FIELDS)[number], number | null>>;

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
   * Record that a cook the user has just ended is over, as of now — the manual
   * End Smoke path, expressed through {@link stampFinishAt}.
   *
   * A cook stopped earlier keeps the moment it was stopped at: the guard inside
   * is what makes an End Smoke pressed a week after the readings stopped record
   * the cook that happened rather than the week that followed it.
   */
  async stampFinish(smokeId: string): Promise<boolean> {
    return this.stampFinishAt(smokeId, new Date());
  }

  /**
   * Record that a cook was over at a given moment, and what it was being taken
   * to.
   *
   * The moment is a parameter because a cook does not always end when somebody
   * notices it has: a session whose readings stopped yesterday finished
   * yesterday, and stamping the moment of the noticing would record a cook that
   * ran until the app was next opened. The peak is scanned over the rows at or
   * before that moment for the same reason — a stray firing of the box after
   * the cook is not the cook's peak.
   *
   * The target is snapshotted here rather than read back later because the
   * settings it comes from go on being edited: a cook finished at 203°F must
   * still read 203°F after the next one is set up for chicken. Conditional for
   * the same reason as the start — a finish that already happened is not
   * moved, and its snapshot is not rewritten.
   *
   * The cook is read before any of that work is done, and a finish that has
   * already happened stops here: the guard on the write would reject it
   * anyway, and everything between the two — a settings read and a scan of the
   * whole series for its peak — would have been done to be thrown away. The
   * guard still stands, because two clients finishing at once can both get
   * past this read.
   *
   * Answers whether this call is the one that stamped, so a caller may do the
   * work that must happen once per finish (recompute the statistics, tell the
   * user) exactly once even when two of them race.
   */
  async stampFinishAt(smokeId: string, finishedAt: Date): Promise<boolean> {
    const smoke = await this.smokeModel.findById(smokeId).exec();
    if (!smoke || smoke.finishedAt) {
      return false;
    }
    const stored = await this.settingsModel.findOne().exec();
    const targetTemp = primaryWatchedTarget(withSettingsDefaults(stored));
    const peakChamber = await this.peakChamberOf(smoke, finishedAt);
    const result = await this.smokeModel
      .updateOne(
        { _id: smokeId, finishedAt: null },
        {
          $set: {
            finishedAt,
            targetTemp,
            // Recorded whatever the readings said, so that a cook whose series
            // held nothing readable is never scanned for a peak again — see
            // the field's own note.
            peakChamberScanned: true,
            // The peak itself only where the cook recorded one: a series with
            // no readable chamber reading has no peak, and a stamped zero
            // would be a claim about how the cook ran.
            ...(peakChamber === null ? {} : { peakChamber }),
          },
        },
      )
      .exec();
    return result.modifiedCount > 0;
  }

  /**
   * The moment of a cook's newest dated reading, or `null` when it has kept
   * none — what "the readings stopped at" means to the auto-stop, and the
   * moment an abandoned cook's finish is backdated to.
   */
  async lastReadingAt(smoke: StoredSmoke): Promise<Date | null> {
    return this.edgeReading(smoke, -1);
  }

  /**
   * The hottest a cook's chamber ever ran, from its readings — the number that
   * is stamped at finish and backfilled onto cooks finished before the stamp
   * existed.
   *
   * Asked of {@link peakChambersOf} rather than of the peaks of every probe:
   * the chamber is the only one wanted here, and the four meat maxima the
   * fuller aggregation computes would be four accumulators nobody reads.
   */
  private async peakChamberOf(
    smoke: StoredSmoke,
    until: Date | null = null,
  ): Promise<number | null> {
    if (!smoke.tempsId) {
      return null;
    }
    const peaks = await this.peakChambersOf([String(smoke.tempsId)], until);
    return peaks.get(String(smoke.tempsId)) ?? null;
  }

  /**
   * The hottest chamber reading of each of many series, in one query — the
   * number stamped onto a cook at finish, asked of a whole archive at once.
   *
   * Exists for the same reason {@link getDurationsMs} does: the statistics
   * rebuild backfills the peaks of every cook that has none, and asked one at a
   * time that would be a query per cook. A series nothing readable was recorded
   * for is absent from the answer rather than present as a zero.
   *
   * `until` bounds the scan to the rows at or before a moment — the cook's
   * window. A series may run on past the cook that recorded it (the box is
   * fired up again weeks later against a session nobody ended), and the hottest
   * of those later rows is not a fact about the cook. Undated rows are excluded
   * with the bound, because a row that cannot say when it was read cannot be
   * placed inside the window.
   */
  async peakChambersOf(
    tempsIds: string[],
    until: Date | null = null,
  ): Promise<Map<string, number>> {
    if (tempsIds.length === 0) {
      return new Map();
    }
    const rows = await this.tempModel
      .aggregate([
        {
          $match: {
            tempsId: { $in: tempsIds },
            ...(until ? { date: { $ne: null, $lte: until } } : {}),
          },
        },
        {
          $group: {
            _id: '$tempsId',
            // Converted before the `$max`: readings are stored as strings, and
            // a `$max` over strings is alphabetical — `'99'` sorts above
            // `'245'`, so it would call 99°F the hotter of the two.
            peak: {
              $max: {
                $convert: {
                  input: '$ChamberTemp',
                  to: 'double',
                  onError: null,
                  onNull: null,
                },
              },
            },
          },
        },
      ])
      .exec();
    return new Map(
      (rows as { _id: unknown; peak: unknown }[])
        .filter((row) => typeof row.peak === 'number' && isFinite(row.peak))
        .map((row) => [String(row._id), row.peak as number]),
    );
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
    const settings = withSettingsDefaults(
      await this.settingsModel.findOne().exec(),
    );
    const probe = primaryWatchedProbe(settings);
    if (!smoke) {
      return {
        ...deriveTimeline({ complete: false }, []),
        estimate: estimateCompletion({
          readings: [],
          target: probe?.target ?? null,
          smoking: state?.smoking === true,
          now,
        }),
      };
    }
    const peaks = await this.peaksOf(smoke);
    const timeline = await this.runningTimeline(smoke, peaks);
    const input = {
      readings: probeSeries(
        await this.estimateReadings(smoke, timeline.startedAt, now),
        probe?.slot,
        timeline.startedAt,
      ),
      target: probe?.target ?? null,
      smoking: state?.smoking === true,
      now,
      peakTemp: probe ? peaks[probeField(probe.slot)] ?? null : null,
    };
    return {
      ...timeline,
      estimate: estimateCompletion({
        ...input,
        // Asked of the projection first: reading the user's history costs a
        // query per past cook of the meat, and for most of a cook the answer
        // would be weighted to nothing and thrown away.
        historicalRate: needsHistoricalRate(input)
          ? await this.historicalRate(smoke)
          : null,
      }),
    };
  }

  /**
   * The running cook's timeline, read without loading the cook.
   *
   * `deriveTimeline` reads its numbers off the whole series, which is the right
   * shape for a finished cook read once and the wrong one for a cook in progress
   * polled every minute: the series only grows, so the cost of a poll would grow
   * with it all cook long. The same numbers are read here from the stamps, the
   * two edges of the series, and a peak the store computes itself.
   */
  private async runningTimeline(
    smoke: StoredSmoke,
    peaks: SeriesPeaks,
  ): Promise<SmokeTimeline> {
    const startedAt = smoke.startedAt ?? (await this.edgeReading(smoke, 1));
    const finishedAt =
      smoke.finishedAt ??
      (smoke.status === SmokeStatus.Complete
        ? await this.edgeReading(smoke, -1)
        : null);
    return {
      startedAt: startedAt ?? null,
      finishedAt: finishedAt ?? null,
      durationMs: durationBetween(startedAt ?? null, finishedAt ?? null),
      peakChamber: peaks.ChamberTemp ?? null,
      peakMeat: MEAT_FIELDS.reduce<number | null>((highest, field) => {
        const value = peaks[field] ?? null;
        return value !== null && (highest === null || value > highest)
          ? value
          : highest;
      }, null),
      targetTemp: smoke.targetTemp ?? null,
    };
  }

  /**
   * The highest each probe ever read this cook, computed in the store.
   *
   * A `$max` over the series rather than a read of it: the peaks are a fact
   * about every row, and the alternative to asking MongoDB for them is pulling
   * a twelve-hour cook across the wire on every poll to reduce it here.
   */
  private async peaksOf(smoke: StoredSmoke): Promise<SeriesPeaks> {
    if (!smoke.tempsId) {
      return {};
    }
    const [peaks] = await this.tempModel
      .aggregate([
        { $match: { tempsId: smoke.tempsId } },
        {
          $group: PEAK_FIELDS.reduce<{ _id: null } & Record<string, unknown>>(
            (group, field) => ({
              ...group,
              // Readings are stored as strings, and a `$max` over strings is
              // alphabetical: it would call 99°F hotter than 203°F.
              [field]: {
                $max: {
                  $convert: {
                    input: `$${field}`,
                    to: 'double',
                    onError: null,
                    onNull: null,
                  },
                },
              },
            }),
            { _id: null },
          ),
        },
      ])
      .exec();
    return peaks ?? {};
  }

  /**
   * The rows the projection is read from: where the cook started, and what it
   * has been doing lately.
   *
   * Two bounded slices rather than the series between them, because that is all
   * the projection reads: the progress bar is anchored at the cook's first
   * reading, and the climb rate is a line through the last half hour. Whatever
   * happened in the middle of a twelve-hour cook is already in the peaks.
   */
  private async estimateReadings(
    smoke: StoredSmoke,
    startedAt: Date | null,
    now: Date,
  ): Promise<TimelineReading[]> {
    const [opening, recent] = await Promise.all([
      this.openingReadings(smoke, startedAt),
      this.readingsSince(
        smoke,
        new Date(now.getTime() - LIVE_WINDOW_MINUTES * 60_000),
      ),
    ]);
    // The two slices overlap on a young cook, and the same row counted twice
    // would weight one moment double in the line through them.
    const byMoment = new Map<number, TimelineReading>();
    [...opening, ...recent].forEach((row) => {
      const moment = momentOf(row);
      if (moment) {
        byMoment.set(moment.getTime(), row);
      }
    });
    return [...byMoment.values()];
  }

  /**
   * What this user's past cooks say the meat on the smoker climbs at, or `null`
   * when their history cannot say.
   *
   * Every completed cook counts, however long ago it was: a user with four
   * briskets behind a winter of chicken has brisket history, and a cap on
   * recency would tell them they had none. What is kept small instead is the
   * cost of that — the pre-smokes are read in one query and the cooks that turn
   * out to be of another meat are dropped before anything else is read of them.
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
      .exec();
    const sameMeat = await this.sameMeatCooks(completed, current.meatType);
    const cooks = await Promise.all(
      sameMeat.map(async ({ smoke: past, cook }) => ({
        ...cook,
        targetTemp: past.targetTemp ?? null,
        durationMs: await this.getDurationMs(past),
        startTemp: firstMeatReading(await this.openingReadings(past)),
      })),
    );
    return sampleHistoricalRate(cooks, current);
  }

  /**
   * The completed cooks that were of the same meat as the one on the smoker,
   * with what each was and weighed.
   *
   * The pre-smokes come back in a single query rather than one per cook: which
   * cooks match is decided from them, and the per-cook reads that follow are
   * then made only for the handful that do.
   */
  private async sameMeatCooks(
    completed: StoredSmoke[],
    meatType: string,
  ): Promise<{ smoke: StoredSmoke; cook: CurrentCook }[]> {
    const preSmokes = await this.preSmokeModel
      .find({
        _id: { $in: completed.map((past) => past.preSmokeId).filter(Boolean) },
      })
      .exec();
    const byId = new Map(
      preSmokes.map((preSmoke) => [String(preSmoke._id), preSmoke]),
    );
    return completed
      .map((past) => ({
        smoke: past,
        preSmoke: past.preSmokeId ? byId.get(String(past.preSmokeId)) : null,
      }))
      .filter(({ preSmoke }) => isSameMeat(preSmoke?.meatType, meatType))
      .map(({ smoke: past, preSmoke }) => ({
        smoke: past,
        cook: {
          meatType: preSmoke?.meatType ?? null,
          weight: preSmoke?.weight?.weight ?? null,
          weightUnit: preSmoke?.weight?.unit ?? null,
        },
      }));
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
   * How long each of many cooks ran — the same answer as {@link getDurationMs},
   * for a whole archive at once.
   *
   * The reason it exists is the cost: `getDurationMs` costs up to two queries
   * per unstamped cook, which is a fan-out that grows with the archive, and the
   * stats read asks about every cook there has ever been. The ends of every
   * series come back instead in one grouped read of the temperatures — a
   * `$min`/`$max` per `tempsId` — and cooks that carry stamps are answered from
   * those without the store being asked at all.
   *
   * Answers are in the order the cooks were given, so a caller may zip them
   * back onto whatever it read them from.
   */
  async getDurationsMs(smokes: StoredSmoke[]): Promise<(number | null)[]> {
    const wanted = smokes.filter(
      (smoke) => Boolean(smoke.tempsId) && this.needsReadings(smoke),
    );
    const edges = await this.seriesEdges([
      ...new Set(wanted.map((smoke) => String(smoke.tempsId))),
    ]);
    return smokes.map((smoke) => {
      const edge = smoke.tempsId ? edges.get(String(smoke.tempsId)) : undefined;
      const startedAt = smoke.startedAt ?? edge?.first ?? null;
      const finishedAt =
        smoke.finishedAt ??
        (smoke.status === SmokeStatus.Complete ? edge?.last ?? null : null);
      return durationBetween(startedAt, finishedAt);
    });
  }

  /** Whether a cook's ends have to be hunted for in its readings. */
  private needsReadings(smoke: StoredSmoke): boolean {
    return (
      !smoke.startedAt ||
      (!smoke.finishedAt && smoke.status === SmokeStatus.Complete)
    );
  }

  /**
   * The first and last *dated* reading of each of many series, in one query.
   *
   * Undated rows are excluded in the match for the reason
   * {@link edgeReading} excludes them: a row stored without a moment would
   * otherwise be the earliest thing in the cook and leave it with no length.
   */
  private async seriesEdges(
    tempsIds: string[],
  ): Promise<Map<string, { first: Date | null; last: Date | null }>> {
    if (tempsIds.length === 0) {
      return new Map();
    }
    const rows = await this.tempModel
      .aggregate([
        { $match: { tempsId: { $in: tempsIds }, date: { $ne: null } } },
        {
          $group: {
            _id: '$tempsId',
            first: { $min: '$date' },
            last: { $max: '$date' },
          },
        },
      ])
      .exec();
    return new Map(
      (rows as { _id: unknown; first: unknown; last: unknown }[]).map((row) => [
        String(row._id),
        {
          first: row.first ? new Date(row.first as string) : null,
          last: row.last ? new Date(row.last as string) : null,
        },
      ]),
    );
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
   * where the meat started, and no more.
   *
   * Bounded twice over: from the cook's start, so the rows recorded while the
   * meat was still being trimmed are not read at all, and by a row count,
   * because a whole series is tens of thousands of rows and this is read on a
   * polled route.
   */
  private async openingReadings(
    smoke: StoredSmoke,
    from: Date | null = null,
  ): Promise<TimelineReading[]> {
    if (!smoke.tempsId) {
      return [];
    }
    return this.tempModel
      .find({
        tempsId: smoke.tempsId,
        date: from ? { $ne: null, $gte: from } : { $ne: null },
      })
      .sort({ date: 1 })
      .limit(OPENING_ROWS)
      .exec();
  }

  /**
   * A cook's readings from `since` onwards, oldest first — the half hour the
   * climb rate is drawn through, whose size is the window's rather than the
   * cook's.
   */
  private async readingsSince(
    smoke: StoredSmoke,
    since: Date,
  ): Promise<TimelineReading[]> {
    if (!smoke.tempsId) {
      return [];
    }
    return this.tempModel
      .find({ tempsId: smoke.tempsId, date: { $ne: null, $gte: since } })
      .sort({ date: 1 })
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
