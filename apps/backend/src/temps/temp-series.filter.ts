import { FilterQuery, Types } from 'mongoose';

import { TempDocument } from './temps.schema';

/**
 * Every reading of a cook, addressed as one series.
 *
 * A series is named after its own first reading: that reading is written before
 * the smoke has a `tempsId` to carry, and its `_id` is what becomes the series
 * id linked onto the smoke. Every reading after it carries that id in
 * `tempsId`. So the series is the rows with the id *plus* the row that is the
 * id — and a filter on `tempsId` alone silently leaves the first reading
 * behind, one orphan per cook, for as long as the collection lives.
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
