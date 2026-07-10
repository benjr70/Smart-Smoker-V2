import { model } from 'mongoose';
import { HttpStatus } from '@nestjs/common';
import { Ratings, RatingsSchema } from './ratings.schema';
import { AllExceptionsFilter } from '../common/all-exceptions.filter';

const RatingsModel = model<Ratings>('RatingsSchemaSpec', RatingsSchema);

describe('RatingsSchema constraints', () => {
  it('accepts scores within the 0-5 range', () => {
    const doc = new RatingsModel({
      smokeFlavor: 4,
      seasoning: 5,
      tenderness: 0,
      overallTaste: 3,
    });

    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects a score above 5 with a ValidationError', () => {
    const doc = new RatingsModel({ smokeFlavor: 10 });

    const error = doc.validateSync();

    expect(error?.name).toBe('ValidationError');
    expect(error?.errors.smokeFlavor).toBeDefined();
  });

  it('rejects a score below 0 with a ValidationError', () => {
    const doc = new RatingsModel({ tenderness: -1 });

    const error = doc.validateSync();

    expect(error?.name).toBe('ValidationError');
    expect(error?.errors.tenderness).toBeDefined();
  });

  it('surfaces an out-of-range write as HTTP 400 through the filter', () => {
    const error = new RatingsModel({ overallTaste: 42 }).validateSync();

    let status = 0;
    const host: any = {
      switchToHttp: () => ({
        getResponse: () => ({
          status: (code: number) => ({
            json: () => {
              status = code;
            },
          }),
        }),
        getRequest: () => ({ url: '/api/ratings' }),
      }),
    };

    new AllExceptionsFilter().catch(error, host);

    expect(status).toBe(HttpStatus.BAD_REQUEST);
  });
});
