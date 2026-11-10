import { Model } from 'mongoose';

/**
 * One document's stamp as a bulk write carries it: which document, and the
 * update written to it.
 *
 * Spelled out rather than inferred at the call, because Mongoose's own bulk
 * operation type is a union wide enough that resolving an inline literal
 * against it costs the compiler more than everything else in the file that
 * builds one. `Update` is the whole update rather than just its `$set`, so a
 * caller that has to unset a field beside the ones it sets describes both.
 */
export interface BulkStamp<Update> {
  updateOne: {
    filter: { _id: unknown };
    update: Update;
  };
}

/**
 * A list of stamps as `Model.bulkWrite` takes them.
 *
 * The cast is the whole of it, and having it in one named place is the point:
 * the shapes above are what Mongoose accepts, but it cannot be *told* so
 * without resolving the union {@link BulkStamp} exists to avoid, and a cast
 * written out at each call site is a cast nobody can check against the others.
 * Everything that stamps documents in bulk — the statistics' peaks and cook
 * windows, the temperature-series repair's rows and cooks — goes through here.
 */
export const asBulkWrite = <Doc>(
  stamps: BulkStamp<unknown>[],
): Parameters<Model<Doc>['bulkWrite']>[0] =>
  stamps as unknown as Parameters<Model<Doc>['bulkWrite']>[0];
