import { NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';

/**
 * Deep persistence base. Owns CRUD once so the feature services stop
 * reimplementing `create`/`getById`/`update`/`delete` with divergent casing
 * and the recurring "update returns the stale pre-image" bug.
 *
 * Abstract — not a NestJS provider. Feature services `extends BaseService`
 * and call `super(model, 'Label')`, adding zero new DI edges.
 *
 * Null policy: `getById` is nullable (a composition primitive);
 * `getByIdOrThrow` / `update` raise `NotFoundException` (→ 404) on a miss.
 */
export abstract class BaseService<TDoc> {
  protected constructor(
    protected readonly model: Model<TDoc>,
    protected readonly label: string,
  ) {}

  async create(dto: Partial<TDoc>): Promise<TDoc> {
    const created = new this.model(dto as TDoc);
    return created.save();
  }

  async getAll(): Promise<TDoc[]> {
    return this.model.find().exec();
  }

  async getById(id: string): Promise<TDoc | null> {
    return this.model.findById(id).exec();
  }

  async getByIdOrThrow(id: string): Promise<TDoc> {
    const doc = await this.getById(id);
    if (!doc) {
      throw new NotFoundException(`${this.label} ${id} not found`);
    }
    return doc;
  }

  async update(id: string, dto: Partial<TDoc>): Promise<TDoc> {
    const updated = await this.model
      .findByIdAndUpdate(id, { $set: dto }, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException(`${this.label} ${id} not found`);
    }
    return updated;
  }

  async delete(id: string) {
    return this.model.deleteOne({ _id: id }).exec();
  }
}
