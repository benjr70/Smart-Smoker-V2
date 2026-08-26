/**
 * A stand-in for a Mongoose model, backed by a plain array.
 *
 * The cook-events service is worth testing through what it *stores*: "the
 * event carries the temperatures the pit was at" and "deleting a smoke takes
 * its events with it" are facts about the collection afterwards, which a
 * `jest.fn()` on a model method cannot tell from a write that went to the
 * wrong place. Writes here are applied, and the tests read them back through
 * the service's own listing.
 *
 * It implements only the query shapes this module uses.
 *
 * Test-only helper — excluded from coverage collection.
 */
export type FakeDoc = Record<string, any>;

const matches = (doc: FakeDoc, filter: FakeDoc): boolean =>
  Object.entries(filter).every(
    ([field, expected]) => String(doc[field]) === String(expected),
  );

const ordered = (rows: FakeDoc[], sort: FakeDoc | null): FakeDoc[] => {
  if (!sort) {
    return rows;
  }
  const [[field, direction]] = Object.entries(sort);
  return [...rows].sort(
    (one, other) =>
      (new Date(one[field]).getTime() - new Date(other[field]).getTime()) *
      Number(direction),
  );
};

const query = (rows: FakeDoc[], one: boolean) => {
  let sort: FakeDoc | null = null;
  const chain = {
    sort(spec: FakeDoc) {
      sort = spec;
      return chain;
    },
    async exec() {
      // Copies: a document that has been read is a snapshot of storage, not a
      // live handle into it.
      const result = ordered(rows, sort).map((doc) => ({ ...doc }));
      if (!one) {
        return result;
      }
      return result.length > 0 ? result[0] : null;
    },
  };
  return chain;
};

/** A fake model over `docs`; writes mutate the array the caller passed in. */
export const fakeCollection = (docs: FakeDoc[]) => {
  let nextId = 1;
  const model = function (dto: FakeDoc = {}) {
    const doc: FakeDoc = { _id: `event-${nextId++}`, ...dto };
    return {
      ...doc,
      async save() {
        docs.push(doc);
        return { ...doc };
      },
    };
  } as any;
  model.docs = docs;
  model.find = (filter: FakeDoc = {}) =>
    query(
      docs.filter((doc) => matches(doc, filter)),
      false,
    );
  model.findById = (id: string) =>
    query(
      docs.filter((doc) => matches(doc, { _id: id })),
      true,
    );
  model.deleteOne = (filter: FakeDoc) => ({
    async exec() {
      const index = docs.findIndex((doc) => matches(doc, filter));
      if (index < 0) {
        return { deletedCount: 0 };
      }
      docs.splice(index, 1);
      return { deletedCount: 1 };
    },
  });
  model.deleteMany = (filter: FakeDoc) => ({
    async exec() {
      const kept = docs.filter((doc) => !matches(doc, filter));
      const deletedCount = docs.length - kept.length;
      docs.splice(0, docs.length, ...kept);
      return { deletedCount };
    },
  });
  return model;
};
