import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PreSmokeDto } from './presmokeDto';

describe('PreSmokeDto', () => {
  const validPayload = {
    name: 'Brisket',
    meatType: 'beef',
    weight: { unit: 'lb', weight: 12 },
    steps: ['Trim', 'Season'],
    notes: 'Low and slow',
  };

  it('passes for a well-formed payload', async () => {
    const dto = plainToInstance(PreSmokeDto, validPayload);

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a non-string name', async () => {
    const dto = plainToInstance(PreSmokeDto, { ...validPayload, name: 5 });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejects a malformed nested weight', async () => {
    const dto = plainToInstance(PreSmokeDto, {
      ...validPayload,
      weight: { unit: 'lb', weight: 'heavy' },
    });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'weight')).toBe(true);
  });
});
