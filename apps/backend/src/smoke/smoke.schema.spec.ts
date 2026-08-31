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

  it('keeps the serve plan the cook was planned around', () => {
    const serveAt = new Date('2026-08-30T18:00:00.000Z');

    const doc = new SmokeModel({
      status: SmokeStatus.InProgress,
      serveAt,
      restMinutes: 45,
    });

    expect(doc.validateSync()).toBeUndefined();
    // A field the schema does not declare is dropped on the way to storage, so
    // a plan set on one device would never reach the next one.
    expect(doc.toObject().serveAt).toEqual(serveAt);
    expect(doc.toObject().restMinutes).toBe(45);
  });

  /**
   * Reading a stored temperature series asks which cook owns it, by its
   * `tempsId`, on every chart draw — so that lookup has to be an index seek
   * rather than a scan of every cook there has ever been.
   */
  it('indexes cooks by the temperature series they own', () => {
    const indexed = SmokeSchema.indexes().map((index) => index[0]);

    expect(indexed).toContainEqual({ tempsId: 1 });
  });

  it('rejects a status outside the SmokeStatus enum', () => {
    const doc = new SmokeModel({ status: 99 });

    const error = doc.validateSync();

    expect(error?.name).toBe('ValidationError');
    expect(error?.errors.status).toBeDefined();
  });
});
