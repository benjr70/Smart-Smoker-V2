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
      const result = limit === null ? sorted : sorted.slice(0, limit);
      if (!one) {
        return result;
      }
      return result.length > 0 ? result[0] : null;
    },
  };
  return chain;
};

/**
 * The one aggregation this module makes: `$match` on a filter, then a single
 * `$group` of `$max` over `$convert`-ed fields — the peaks of a series read
 * without pulling the series across the wire.
 *
 * `$max` skips what it cannot read, as MongoDB's does, and a group over no
 * documents at all produces no row rather than a row of nulls.
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
  const peak = (field: string): number | null =>
    matched.reduce<number | null>((highest, doc) => {
      const value = Number(doc[field]);
      if (
        doc[field] === undefined ||
        doc[field] === '' ||
        !Number.isFinite(value)
      ) {
        return highest;
      }
      return highest === null || value > highest ? value : highest;
    }, null);
  return [
    Object.entries(group).reduce<FakeDoc>((row, [name, spec]) => {
      if (name === '_id') {
        return { ...row, _id: null };
      }
      const input = (spec as { $max: { $convert: { input: string } } }).$max
        .$convert.input;
      return { ...row, [name]: peak(input.replace(/^\$/, '')) };
    }, {}),
  ];
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
  updateOne(filter: FakeDoc, update: { $set: FakeDoc }) {
    const target = docs.find((doc) => matches(doc, filter));
    if (target) {
      Object.assign(target, update.$set);
    }
    return {
      async exec() {
        return { modifiedCount: target ? 1 : 0 };
      },
    };
  },
});
