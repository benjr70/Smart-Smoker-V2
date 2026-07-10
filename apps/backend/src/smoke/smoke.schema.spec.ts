import { model } from 'mongoose';
import { Smoke, SmokeSchema, SmokeStatus } from './smoke.schema';

const SmokeModel = model<Smoke>('SmokeSchemaSpec', SmokeSchema);

describe('SmokeSchema constraints', () => {
  it('accepts a valid SmokeStatus enum value', () => {
    const doc = new SmokeModel({ status: SmokeStatus.InProgress });

    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects a missing required status with a ValidationError', () => {
    const doc = new SmokeModel({});

    const error = doc.validateSync();

    expect(error?.name).toBe('ValidationError');
    expect(error?.errors.status).toBeDefined();
  });

  it('rejects a status outside the SmokeStatus enum', () => {
    const doc = new SmokeModel({ status: 99 });

    const error = doc.validateSync();

    expect(error?.name).toBe('ValidationError');
    expect(error?.errors.status).toBeDefined();
  });
});
