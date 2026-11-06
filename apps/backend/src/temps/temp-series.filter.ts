import { FilterQuery, Types } from 'mongoose';

import { TempDocument } from './temps.schema';

/**
 * Every reading of a cook, addressed as one series.
 *
 * A series is named after its own first reading: the `_id` of that reading is
 * what becomes the series id linked onto the smoke, and every reading of the
 * cook — that one included — carries it in `tempsId`. So a filter on `tempsId`
 * alone is the series, which is why the reads are written with one.
 *
 * The `_id` branch here is what covers the readings written before that was
 * true. A first reading used to be stored before its cook had an id to carry,
 * and so carried none: one orphan per cook, invisible to every read that asks
 * by `tempsId`. `TempSeriesBackfillService` stamps those at boot and
 * `TempsService.saveNewTemp` no longer makes them, so this branch answers for
 * the window between a deploy and that repair — and a delete is the one place
 * where missing a reading cannot be undone.
 *
 * A series id that is not an object id cannot be an `_id` and would only make
 * Mongoose throw on the cast, so those match on `tempsId` alone.
 */
export const tempSeriesFilter = (
  tempsId: string,
): FilterQuery<TempDocument> => {
  if (!Types.ObjectId.isValid(tempsId)) {
    return { tempsId };
  }
  return { $or: [{ tempsId }, { _id: tempsId }] };
};
