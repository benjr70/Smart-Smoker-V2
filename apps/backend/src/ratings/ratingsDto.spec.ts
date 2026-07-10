import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RatingsDto } from './ratingsDto';

describe('RatingsDto', () => {
  const validPayload = {
    smokeFlavor: 5,
    seasoning: 4,
    tenderness: 5,
    overallTaste: 4,
    notes: 'Great',
  };

  it('passes for a well-formed payload', async () => {
    const dto = plainToInstance(RatingsDto, validPayload);

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a non-numeric score', async () => {
    const dto = plainToInstance(RatingsDto, {
      ...validPayload,
      smokeFlavor: 'high',
    });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'smokeFlavor')).toBe(true);
  });
});
