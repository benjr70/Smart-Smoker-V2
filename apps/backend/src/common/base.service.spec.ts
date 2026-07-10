import { NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';
import { BaseService } from './base.service';

interface Widget {
  _id?: string;
  name: string;
}

class WidgetService extends BaseService<Widget> {
  constructor(model: Model<Widget>) {
    super(model, 'Widget');
  }
}

const query = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

describe('BaseService', () => {
  let service: WidgetService;
  let model: any;

  const doc: Widget = { _id: 'w1', name: 'hammer' };

  beforeEach(() => {
    model = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ ...dto, _id: 'new-id' }),
    }));
    model.find = jest.fn().mockReturnValue(query([doc]));
    model.findById = jest.fn().mockReturnValue(query(doc));
    model.findByIdAndUpdate = jest.fn().mockReturnValue(query(doc));
    model.deleteOne = jest.fn().mockReturnValue(query({ deletedCount: 1 }));

    service = new WidgetService(model as Model<Widget>);
  });

  describe('create', () => {
    it('persists a new document', async () => {
      const result = await service.create({ name: 'saw' });

      expect(model).toHaveBeenCalledWith({ name: 'saw' });
      expect(result).toMatchObject({ name: 'saw', _id: 'new-id' });
    });
  });

  describe('getById', () => {
    it('returns the document when found', async () => {
      expect(await service.getById('w1')).toEqual(doc);
    });

    it('returns null when not found (nullable primitive)', async () => {
      model.findById.mockReturnValue(query(null));

      expect(await service.getById('missing')).toBeNull();
    });
  });

  describe('getByIdOrThrow', () => {
    it('returns the document when found', async () => {
      expect(await service.getByIdOrThrow('w1')).toEqual(doc);
    });

    it('throws NotFoundException when the id is missing', async () => {
      model.findById.mockReturnValue(query(null));

      await expect(service.getByIdOrThrow('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('returns the fresh document (new: true) not the stale pre-image', async () => {
      const fresh: Widget = { _id: 'w1', name: 'renamed' };
      model.findByIdAndUpdate.mockReturnValue(query(fresh));

      const result = await service.update('w1', { name: 'renamed' });

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        'w1',
        { $set: { name: 'renamed' } },
        { new: true },
      );
      expect(result).toEqual(fresh);
    });

    it('throws NotFoundException when updating a missing id', async () => {
      model.findByIdAndUpdate.mockReturnValue(query(null));

      await expect(
        service.update('missing', { name: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getAll', () => {
    it('returns all documents', async () => {
      expect(await service.getAll()).toEqual([doc]);
    });
  });

  describe('delete', () => {
    it('removes the document by id', async () => {
      expect(await service.delete('w1')).toEqual({ deletedCount: 1 });
      expect(model.deleteOne).toHaveBeenCalledWith({ _id: 'w1' });
    });
  });
});
