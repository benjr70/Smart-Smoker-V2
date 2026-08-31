/**
 * A stored document, read for its id alone.
 *
 * `unknown` because the same value arrives as an `ObjectId` from a hydrated
 * document, as a string from a lean read, and as neither from a fake in a test
 * — and no reader here cares which.
 */
export interface WithDocumentId {
  _id?: unknown;
}

/**
 * The id of a stored document as a string, or `null` when it has none.
 *
 * One helper rather than an untyped `doc['_id'].toString()` at each call site:
 * the two readers of a cook's id — the plan write and the timeline's cook-log
 * lookup — modelled the same missing value two incompatible ways, one throwing
 * a `TypeError` on a lean object and the other quietly reading it as the empty
 * string. Answered as `null` so a caller has to say what a document with no id
 * means to it.
 */
export const documentId = (doc: object | null | undefined): string | null => {
  // Any stored document, because a Mongoose class does not declare the `_id`
  // its documents all carry: the one reach past the types lives here rather
  // than at each call site.
  const id = (doc as WithDocumentId | null | undefined)?._id;
  return id === null || id === undefined ? null : String(id);
};
