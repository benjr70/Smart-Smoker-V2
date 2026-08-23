/**
 * A stand-in for a Mongoose model, backed by a plain array.
 *
 * The timeline service is worth testing through what it *stores* rather than
 * through which model method it happened to call: "stamped once and never
 * again" is a fact about the document afterwards, and a jest.fn() assertion on
 * an update call cannot tell that apart from an update that overwrote. This
 * fake applies the writes, so the tests read the result back through the
 * service's own public reads.
 *
 * It implements only the query shapes this module uses.
 */
export type FakeDoc = Record<string, any>;

/**
 * `null` in a filter means "missing or null", as it does in MongoDB, and
 * `{ $ne: x }` is its negation — so `{ $ne: null }` keeps only the rows that
 * actually carry the field, which is how MongoDB reads it too.
 */
const fieldMatches = (value: unknown, expected: unknown): boolean => {
  // An object of `$` keys is a set of conditions, all of which must hold;
  // anything else — a Date, say — is a plain value, compared as one.
  if (
    expected &&
    typeof expected === 'object' &&
    Object.keys(expected).some((key) => key.startsWith('$'))
  ) {
    return Object.entries(expected as Record<string, unknown>).every(
      ([operator, operand]) => {
        switch (operator) {
          case '$ne':
            return !fieldMatches(value, operand);
          case '$gte':
            return (
              value !== null &&
              value !== undefined &&
              new Date(value as string).getTime() >=
                new Date(operand as string).getTime()
            );
          case '$lte':
            return (
              value !== null &&
              value !== undefined &&
              new Date(value as string).getTime() <=
                new Date(operand as string).getTime()
            );
          case '$in':
            return (operand as unknown[]).some((one) =>
              fieldMatches(value, one),
            );
          default:
            throw new Error(`fake model does not implement ${operator}`);
        }
      },
    );
  }
  if (expected === null) {
    return value === null || value === undefined;
  }
  return String(value) === String(expected);
};

const matches = (doc: FakeDoc, filter: FakeDoc): boolean =>
  Object.entries(filter).every(([field, expected]) =>
    fieldMatches(doc[field], expected),
  );

const ordered = (rows: FakeDoc[], sort: FakeDoc | null): FakeDoc[] => {
  if (!sort) {
    return rows;
  }
  const [[field, direction]] = Object.entries(sort);
  return [...rows].sort(
    (a, b) =>
      (new Date(a[field]).getTime() - new Date(b[field]).getTime()) *
      Number(direction),
  );
};

/** A chainable query over the matched rows, resolved by `exec()`. */
const query = (rows: FakeDoc[], one: boolean) => {
  let sort: FakeDoc | null = null;
  let limit: number | null = null;
  const chain = {
    /**
     * What the caller narrowed the query with, readable afterwards — so a test
     * can hold a polled read to being a bounded one.
     */
    applied: {} as { sort?: FakeDoc; limit?: number },
    sort(spec: FakeDoc) {
      sort = spec;
      chain.applied.sort = spec;
      return chain;
    },
    limit(count: number) {
      limit = count;
      chain.applied.limit = count;
      return chain;
    },
    async exec() {
      // Ordered before limited, as MongoDB does it: a limit applied to the
      // rows in storage order would answer a different ten cooks than the ten
      // most recent the caller asked for.
      const sorted = ordered(rows, sort);
      // Copies, because a document that has been read is a snapshot of
      // storage and not a live handle into it: a later write does not reach
      // back into the object the caller is already holding, and code that
      // reads a field it has just written to the store must read it back.
      const result = (limit === null ? sorted : sorted.slice(0, limit)).map(
        (doc) => ({ ...doc }),
      );
      if (!one) {
        return result;
      }
      return result.length > 0 ? result[0] : null;
    },
  };
  return chain;
};

/** A field path as an aggregation writes one: `$ChamberTemp`. */
const pathOf = (expression: unknown): string =>
  typeof expression === 'string'
    ? expression.replace(/^\$/, '')
    : pathOf(
        (expression as { $convert: { input: string } }).$convert?.input ?? '',
      );

/** Whether an accumulator's input is `$convert`-ed, and so read as a number. */
const isConverted = (expression: unknown): boolean =>
  typeof expression === 'object' &&
  expression !== null &&
  '$convert' in (expression as Record<string, unknown>);

/**
 * The extreme of one field across a group, in the direction asked for.
 *
 * Numbers where the pipeline converted them — the peaks of a series, whose
 * readings are stored as strings — and otherwise whatever was stored, compared
 * as MongoDB compares dates. What cannot be read is skipped, as `$max` skips it.
 */
const extremeOf = (
  rows: FakeDoc[],
  field: string,
  direction: 1 | -1,
  converted: boolean,
): unknown => {
  const readable = rows
    .map((doc) => doc[field])
    .filter(
      (value) =>
        value !== undefined &&
        value !== null &&
        value !== '' &&
        (!converted || Number.isFinite(Number(value))),
    );
  if (readable.length === 0) {
    return null;
  }
  const ranked = readable.map((value) =>
    converted ? Number(value) : new Date(value as string).getTime(),
  );
  const best = ranked.reduce(
    (leader, value, index) =>
      (value - ranked[leader]) * direction > 0 ? index : leader,
    0,
  );
  return converted ? ranked[best] : readable[best];
};

/**
 * The aggregations this module makes: `$match` on a filter, then a single
 * `$group` of `$min`/`$max` — the peaks of a series, or the two ends of each of
 * many series, read without pulling any of them across the wire.
 *
 * A group with an `_id` of `null` produces one row for everything matched; an
 * `_id` naming a field produces one row per distinct value of it. A group over
 * no documents at all produces no rows rather than rows of nulls.
 */
const aggregated = (rows: FakeDoc[], pipeline: FakeDoc[]): FakeDoc[] => {
  const matched = pipeline.reduce<FakeDoc[]>(
    (kept, stage) =>
      stage.$match ? kept.filter((doc) => matches(doc, stage.$match)) : kept,
    rows,
  );
  const group = pipeline.find((stage) => stage.$group)?.$group;
  if (!group) {
    return matched;
  }
  if (matched.length === 0) {
    return [];
  }
  const keyPath = group._id === null ? null : pathOf(group._id);
  const buckets = new Map<unknown, FakeDoc[]>();
  matched.forEach((doc) => {
    const key = keyPath === null ? null : doc[keyPath];
    buckets.set(key, [...(buckets.get(key) ?? []), doc]);
  });
  return [...buckets.entries()].map(([key, bucket]) =>
    Object.entries(group).reduce<FakeDoc>(
      (row, [name, spec]) => {
        if (name === '_id') {
          return row;
        }
        const accumulator = spec as Record<string, unknown>;
        const direction = '$min' in accumulator ? -1 : 1;
        const input = accumulator.$min ?? accumulator.$max;
        return {
          ...row,
          [name]: extremeOf(
            bucket,
            pathOf(input),
            direction,
            isConverted(input),
          ),
        };
      },
      { _id: key ?? null },
    ),
  );
};

/** A fake model over `docs`; writes mutate the array the caller passed in. */
export const fakeModel = (docs: FakeDoc[]) => ({
  docs,
  findById(id: string) {
    return query(
      docs.filter((doc) => fieldMatches(doc._id, id)),
      true,
    );
  },
  find(filter: FakeDoc = {}) {
    return query(
      docs.filter((doc) => matches(doc, filter)),
      false,
    );
  },
  findOne(filter: FakeDoc = {}) {
    return query(
      docs.filter((doc) => matches(doc, filter)),
      true,
    );
  },
  aggregate(pipeline: FakeDoc[]) {
    return {
      async exec() {
        return aggregated(docs, pipeline);
      },
    };
  },
  countDocuments(filter: FakeDoc = {}) {
    return {
      async exec() {
        return docs.filter((doc) => matches(doc, filter)).length;
      },
    };
  },
  /**
   * Many updates in one round trip, applied in the order they were given —
   * how a whole archive's worth of stamps is written without a query per
   * document.
   */
  async bulkWrite(
    operations: {
      updateOne: { filter: FakeDoc; update: { $set?: FakeDoc } };
    }[],
  ) {
    operations.forEach(({ updateOne }) => {
      const target = docs.find((doc) => matches(doc, updateOne.filter));
      if (target) {
        Object.assign(target, updateOne.update.$set ?? {});
      }
    });
    return { modifiedCount: operations.length };
  },
  /**
   * `upsert` inserts the document the filter describes when nothing matches —
   * how the singletons of this codebase are written, so the first write needs
   * no separate create.
   */
  updateOne(
    filter: FakeDoc,
    update: { $set?: FakeDoc; $inc?: Record<string, number> },
    options: { upsert?: boolean } = {},
  ) {
    const target = docs.find((doc) => matches(doc, filter));
    if (target) {
      Object.assign(target, update.$set ?? {});
      Object.entries(update.$inc ?? {}).forEach(([field, by]) => {
        target[field] = ((target[field] as number) ?? 0) + by;
      });
    } else if (options.upsert) {
      // What Mongo inserts for an upsert nothing matched: the filter's own
      // equalities, the `$set`, and each `$inc` field starting from its step.
      docs.push({ ...filter, ...(update.$set ?? {}), ...(update.$inc ?? {}) });
    }
    return {
      async exec() {
        return target
          ? { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }
          : {
              matchedCount: 0,
              modifiedCount: 0,
              upsertedCount: options.upsert ? 1 : 0,
            };
      },
    };
  },
});
