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

/** `null` in a filter means "missing or null", as it does in MongoDB. */
const fieldMatches = (value: unknown, expected: unknown): boolean => {
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
  const chain = {
    sort(spec: FakeDoc) {
      sort = spec;
      return chain;
    },
    limit(count: number) {
      rows = rows.slice(0, count);
      return chain;
    },
    async exec() {
      const result = ordered(rows, sort);
      if (!one) {
        return result;
      }
      return result.length > 0 ? result[0] : null;
    },
  };
  return chain;
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
