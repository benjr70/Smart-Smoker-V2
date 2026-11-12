import { Model } from 'mongoose';
import { TimelineReading } from '../timeline/timeline.derive';
import { TempDocument } from './temps.schema';

/**
 * The two reads of a temperature series that the cook's stamps and the cook's
 * timeline both make — as functions over the collection rather than methods on
 * either module.
 *
 * Here because the stamps moved to the Active Cook and the derivations stayed
 * with the timeline, and both of them have to read the same series the same
 * way: what a cook was stamped as starting at is read from the edge of its
 * series, and the peak it is stamped with is the peak the statistics backfill
 * computes. Two copies of either query would be two answers about one cook.
 *
 * Free functions over an injected model, because the one thing neither side
 * may do is depend on the other: the Active Cook is depended on by everything
 * (the timeline included), so a service edge back would close a DI cycle.
 */

/** A row as it is stored: a reading, and whatever id it was written under. */
export type StoredReading = TimelineReading & { _id?: unknown };

/** The half of a cook these reads need: which series it recorded into. */
export interface SeriesOwner {
  tempsId?: string;
}

/**
 * The row itself at one end — first (`1`) or last (`-1`) — of a cook's *dated*
 * readings.
 *
 * Undated rows are excluded in the query rather than skipped afterwards: a
 * reading may be stored without a date, and ascending order puts every one of
 * them ahead of the whole cook, so the row that came back would carry no
 * moment and the cook would read as having no duration at all — while the
 * derivation behind `GET /timeline/:id`, which ignores undated rows, went on
 * reporting one for the same cook.
 */
export const edgeReadingRow = async (
  tempModel: Model<TempDocument>,
  smoke: SeriesOwner,
  direction: 1 | -1,
): Promise<StoredReading | null> => {
  if (!smoke.tempsId) {
    return null;
  }
  return tempModel
    .findOne({ tempsId: smoke.tempsId, date: { $ne: null } })
    .sort({ date: direction })
    .exec();
};

/**
 * The hottest chamber reading of each of many series, in one query — the
 * number stamped onto a cook at finish, asked of a whole archive at once.
 *
 * One query for many series because the statistics rebuild backfills the peaks
 * of every cook that has none, and asked one at a time that would be a query
 * per cook. A series nothing readable was recorded for is absent from the
 * answer rather than present as a zero.
 *
 * `until` bounds the scan to the rows at or before a moment — the cook's
 * window. A series may run on past the cook that recorded it (the box is fired
 * up again weeks later against a session nobody ended), and the hottest of
 * those later rows is not a fact about the cook. Undated rows are excluded with
 * the bound, because a row that cannot say when it was read cannot be placed
 * inside the window.
 */
export const peakChambersOf = async (
  tempModel: Model<TempDocument>,
  tempsIds: string[],
  until: Date | null = null,
): Promise<Map<string, number>> => {
  if (tempsIds.length === 0) {
    return new Map();
  }
  const rows = await tempModel
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
};

/**
 * The hottest a single cook's chamber ever ran, or `null` where its series
 * recorded nothing readable — the number stamped at finish.
 */
export const peakChamberOf = async (
  tempModel: Model<TempDocument>,
  smoke: SeriesOwner,
  until: Date | null = null,
): Promise<number | null> => {
  if (!smoke.tempsId) {
    return null;
  }
  const peaks = await peakChambersOf(tempModel, [String(smoke.tempsId)], until);
  return peaks.get(String(smoke.tempsId)) ?? null;
};
