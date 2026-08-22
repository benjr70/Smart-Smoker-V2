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

  it('keeps the peak chamber a finished cook was stamped with', () => {
    const doc = new SmokeModel({
      status: SmokeStatus.Complete,
      peakChamber: 268,
    });

    expect(doc.validateSync()).toBeUndefined();
    // A field the schema does not declare is dropped on the way to storage, so
    // the stamp has to be part of the schema rather than merely written.
    expect(doc.toObject().peakChamber).toBe(268);
  });

  it('keeps the mark that a cook’s readings were searched for a peak', () => {
    const doc = new SmokeModel({
      status: SmokeStatus.Complete,
      peakChamberScanned: true,
    });

    expect(doc.validateSync()).toBeUndefined();
    // A cook whose series held nothing readable carries the mark and no peak,
    // which is how "asked, and there was nothing" is told from "never asked".
    expect(doc.toObject().peakChamberScanned).toBe(true);
    expect(doc.toObject().peakChamber).toBeUndefined();
  });

  it('rejects a status outside the SmokeStatus enum', () => {
    const doc = new SmokeModel({ status: 99 });

    const error = doc.validateSync();

    expect(error?.name).toBe('ValidationError');
    expect(error?.errors.status).toBeDefined();
  });
});
