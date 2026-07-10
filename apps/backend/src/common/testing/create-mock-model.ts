/**
 * Shared test factory for Mongoose model mocks.
 *
 * Replaces the copy-pasted `jest.fn().mockImplementation(...)` + static-method
 * boilerplate that was duplicated across every `*.service.spec.ts`. The returned
 * value is callable as a document constructor (`new model(dto)` yields an object
 * carrying the dto plus a resolving `save()`), and carries the static query
 * helpers the persistence services rely on. Every query helper is
 * `.exec()`-chainable — it returns `{ exec: () => Promise<default> }` to match
 * how `BaseService` drives Mongoose (`findById(id).exec()`, `find().exec()`,
 * `findByIdAndUpdate(...).exec()`, `deleteOne(...).exec()`). `create` resolves
 * directly, mirroring `Model.create` which returns a promise with no `.exec()`.
 * Per-spec behavior is supplied via `overrides` or by re-stubbing individual
 * static methods in a test.
 *
 * Test-only helper — excluded from coverage collection.
 */
type MockDocument = { save: jest.Mock } & Record<string, unknown>;

export interface MockModel {
  (dto?: Record<string, unknown>): MockDocument;
  new (dto?: Record<string, unknown>): MockDocument;
  find: jest.Mock;
  findById: jest.Mock;
  findOne: jest.Mock;
  findOneAndUpdate: jest.Mock;
  findByIdAndUpdate: jest.Mock;
  deleteOne: jest.Mock;
  deleteMany: jest.Mock;
  create: jest.Mock;
}

export function createMockModel(
  overrides: Partial<Record<keyof MockModel, unknown>> = {},
): MockModel {
  const model = jest.fn().mockImplementation((dto = {}) => ({
    ...dto,
    save: jest.fn().mockResolvedValue({ ...dto, _id: 'mock-id' }),
  })) as unknown as MockModel;

  const chainable = <T>(value: T) => ({
    exec: jest.fn().mockResolvedValue(value),
  });

  model.find = jest.fn().mockReturnValue(chainable([]));
  model.findById = jest.fn().mockReturnValue(chainable(null));
  model.findOne = jest.fn().mockReturnValue(chainable(null));
  model.findOneAndUpdate = jest.fn().mockReturnValue(chainable(null));
  model.findByIdAndUpdate = jest.fn().mockReturnValue(chainable(null));
  model.deleteOne = jest.fn().mockReturnValue(chainable({ deletedCount: 1 }));
  model.deleteMany = jest.fn().mockReturnValue(chainable({ deletedCount: 0 }));
  model.create = jest.fn().mockResolvedValue(null);

  Object.assign(model, overrides);

  return model;
}
