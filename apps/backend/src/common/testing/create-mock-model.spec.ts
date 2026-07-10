import { createMockModel } from './create-mock-model';

describe('createMockModel', () => {
  it('acts as a document constructor whose instances expose a resolving save()', async () => {
    const model = createMockModel();

    const instance = new model({ name: 'brisket' });
    const saved = await instance.save();

    expect(saved).toEqual(
      expect.objectContaining({ name: 'brisket', _id: expect.anything() }),
    );
  });

  it('provides the static query methods used by the persistence services', () => {
    const model = createMockModel();

    expect(jest.isMockFunction(model.findById)).toBe(true);
    expect(jest.isMockFunction(model.findOne)).toBe(true);
    expect(jest.isMockFunction(model.findOneAndUpdate)).toBe(true);
    expect(jest.isMockFunction(model.findByIdAndUpdate)).toBe(true);
    expect(jest.isMockFunction(model.deleteOne)).toBe(true);
  });

  it('exposes exec()-chainable query helpers with sensible defaults', async () => {
    const model = createMockModel();

    await expect(model.find().exec()).resolves.toEqual([]);
    await expect(model.findById('x').exec()).resolves.toBeNull();
    await expect(model.findOne().exec()).resolves.toBeNull();
    await expect(model.findByIdAndUpdate('x', {}, {}).exec()).resolves.toBeNull();
    await expect(model.deleteOne({ _id: 'x' }).exec()).resolves.toEqual({
      deletedCount: 1,
    });
    await expect(model.deleteMany({}).exec()).resolves.toEqual({
      deletedCount: 0,
    });
  });

  it('applies static-method overrides through the exec() chain', async () => {
    const model = createMockModel({
      findById: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: 'seeded' }) }),
    });

    await expect(model.findById('seeded').exec()).resolves.toEqual({
      _id: 'seeded',
    });
  });
});
