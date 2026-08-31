import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { BaseService } from '../common/base.service';
import { CurrentSmokeService } from '../common/current-smoke.service';
import { SmokeDocument } from '../smoke/smoke.schema';
import { TempDto } from './tempDto';
import { TempSample, decimateSeries, pointsAsked } from './temp-series';
import { tempSeriesFilter } from './temp-series.filter';
import { Temp, TempDocument } from './temps.schema';

/**
 * How far outside a cook's stamped window a reading may be dated and still be
 * taken as part of that cook.
 *
 * A reading's date is the smoker's clock; the stamps are the server's, and the
 * two do not agree — that disagreement is the thing {@link StaleCookService}
 * already defends against when it decides a cook is silent. Without slack, a
 * device running a few minutes fast loses the last few minutes of every cook it
 * records, and one running slow loses the first. The slack is far wider than
 * any plausible skew between two boxes on the same network and far narrower
 * than the shortest silence that can end a cook (an hour, the floor the
 * settings enforce), so it can admit the ends of a cook without admitting a
 * stray.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 15 * 60 * 1000;

/**
 * The date bound of a cook, as a fragment of a temps filter: empty when the
 * cook carries no stamps at all, so spreading it into a filter leaves that
 * filter alone.
 *
 * Each stamp bounds the side it knows about — a cook still running has only a
 * start — and both sides are bounded loosely, by {@link
 * CLOCK_SKEW_TOLERANCE_MS}.
 *
 * The lower bound is honest only because the start stamp is: a start is written
 * no later than the earliest reading its cook had already taken (see
 * `TimelineService.stampStart`), so a cook whose first stamp attempt failed and
 * was deferred to a later switch-on is still bounded at its own beginning
 * rather than hours into itself. Nothing a cook recorded falls below its own
 * start.
 *
 * Rows stored without a date are kept. They cannot be placed inside or outside
 * any window, and a range predicate answers "outside" for every one of them;
 * the archive holds such rows (see the peak scan in the timeline module), and a
 * legacy cook made of them would vanish from its own chart the moment anything
 * stamped it.
 */
const cookWindow = (
  smoke: Pick<SmokeDocument, 'startedAt' | 'finishedAt'> | null,
): FilterQuery<TempDocument> => {
  const range: { $gte?: Date; $lte?: Date } = {};
  if (smoke?.startedAt) {
    range.$gte = new Date(smoke.startedAt.getTime() - CLOCK_SKEW_TOLERANCE_MS);
  }
  if (smoke?.finishedAt) {
    range.$lte = new Date(smoke.finishedAt.getTime() + CLOCK_SKEW_TOLERANCE_MS);
  }
  return Object.keys(range).length
    ? { $or: [{ date: range }, { date: null }] }
    : {};
};

@Injectable()
export class TempsService extends BaseService<TempDocument> {
  constructor(
    @InjectModel('Temp') model: Model<TempDocument>,
    @InjectModel('Smoke') private readonly smokeModel: Model<SmokeDocument>,
    private readonly currentSmoke: CurrentSmokeService,
  ) {
    super(model, 'Temp');
  }

  async saveNewTemp(tempDto: TempDto): Promise<Temp> {
    return this.currentSmoke.upsertCurrent<Temp>('tempsId', {
      update: (tempsId) => {
        tempDto.tempsId = tempsId;
        return this.create(tempDto);
      },
      create: async () => {
        const temp = await this.create(tempDto);
        return { result: temp, childId: temp['_id'].toString() };
      },
    });
  }

  async saveTempBatch(tempDto: TempDto[]) {
    const tempsId = await this.GetTempID();
    if (tempsId === undefined) {
      return;
    }
    const rows = tempDto.map((row) => ({ ...row, tempsId }));
    return this.model.insertMany(rows);
  }

  /**
   * The current smoke's readings, oldest first.
   *
   * A series is a cook, and a cook has a direction: the chart that draws it
   * takes the span of the plot from the readings themselves. Left unordered,
   * Mongo answers in whatever order it finds the rows in — in practice
   * newest-first, since that is the order of the index this collection is read
   * through — and a backwards cook draws a backwards time axis with the lines
   * outside the plot. The order belongs here, at the one place the series is
   * read, rather than in each reader that would otherwise have to know.
   */
  async getAllTempsCurrent(): Promise<Temp[]> {
    return this.currentSmoke.readCurrent<Temp[]>(
      'tempsId',
      (tempsId) => this.model.find({ tempsId }).sort({ date: 1 }).exec(),
      [],
    );
  }

  /**
   * The most recent reading of the current smoke, or `undefined` when no smoke
   * is active. The stored series is the smoker's latest-reading cache: readings
   * are already persisted as they arrive, so a watcher that wakes on its own
   * schedule reads the newest row instead of needing the producer to push to it.
   */
  async getLatestCurrentTemp(): Promise<Temp | undefined> {
    return this.currentSmoke.readCurrent<Temp | undefined>(
      'tempsId',
      async (tempsId) => {
        const [latest] = await this.model
          .find({ tempsId })
          .sort({ date: -1 })
          .limit(1)
          .exec();
        return latest;
      },
      undefined,
    );
  }

  /**
   * A stored smoke's readings, oldest first, for the same reason as above —
   * and bounded to the cook they belong to.
   *
   * A session whose smoking flag was never switched off keeps collecting
   * readings: the next power-on of the box, weeks later, writes into the same
   * series, and the chart of that cook then draws a fortnight-wide plot with
   * the real cook squeezed into a sliver at one end. Once the cook carries the
   * stamps that say when it ran (see the timeline and auto-stop modules), the
   * window is known, and the readings from outside it are not part of this
   * cook by any reading of the word.
   *
   * Clipped here, at the one place a stored series is read, rather than in each
   * chart that draws one: every client — history, the smoker app — is handed
   * the clean series without knowing the problem exists. And clipped rather
   * than deleted: the strays stay in the collection, so nothing is lost if the
   * stamps themselves ever turn out to be wrong.
   *
   * The cook's stamps are what bound the series, generously and never to
   * nothing; see {@link cookWindow} for what the bounds are and why. A cook
   * with no stamps at all — every cook recorded before they existed — reads
   * back whole, exactly as it always did.
   */
  async getAllTempsById(id: string): Promise<Temp[]> {
    const smoke = await this.smokeModel.findOne({ tempsId: id }).exec();
    const window = cookWindow(smoke);
    const clipped = await this.series(id, window);
    if (clipped.length || !Object.keys(window).length) {
      return clipped;
    }
    // Nothing survived the clip, which no real cook does: a cook has readings
    // or it has none, and a stamped one had readings by definition. What it
    // means is that the stamp and the readings disagree about what time it is
    // — a smoker whose clock is wrong by more than any tolerance — and the
    // choice is between a blank chart and an unclipped one. The unclipped one
    // at least shows the cook.
    return this.series(id);
  }

  /**
   * A stored cook as a chart-ready series: numbers rather than the strings the
   * device sent, and at most `points` of them.
   *
   * Read through {@link getAllTempsById} rather than beside it, so a series
   * asked for this way is the same cook — clipped to its own window, ordered
   * as it was cooked — that every other reader is handed.
   */
  async getSeriesById(id: string, points?: number): Promise<TempSample[]> {
    const rows = await this.getAllTempsById(id);
    return decimateSeries(rows, pointsAsked(points));
  }

  /** One stored series, oldest first, under an optional extra condition. */
  private async series(
    id: string,
    window: FilterQuery<TempDocument> = {},
  ): Promise<Temp[]> {
    return this.model
      .find({ tempsId: id, ...window })
      .sort({ date: 1 })
      .exec();
  }

  async GetTempID(): Promise<string | undefined> {
    return this.currentSmoke.readCurrent<string | undefined>(
      'tempsId',
      (tempsId) => Promise.resolve(tempsId),
      undefined,
    );
  }

  /**
   * Temps are addressed by their shared `tempsId` (a smoke's temp series), not
   * by `_id` — so this overrides the by-id `delete` from BaseService. The whole
   * series goes, first reading included; see {@link tempSeriesFilter}.
   */
  async delete(id: string) {
    return this.model.deleteMany(tempSeriesFilter(id));
  }
}
