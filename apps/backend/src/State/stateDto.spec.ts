import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StateDto } from './stateDto';

describe('StateDto', () => {
  const validPayload = {
    smokeId: '507f1f77bcf86cd799439011',
    smoking: true,
  };

  it('passes for a well-formed payload', async () => {
    const dto = plainToInstance(StateDto, validPayload);

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a non-string smokeId', async () => {
    const dto = plainToInstance(StateDto, { ...validPayload, smokeId: 5 });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'smokeId')).toBe(true);
  });

  it('rejects a non-boolean smoking flag', async () => {
    const dto = plainToInstance(StateDto, {
      ...validPayload,
      smoking: 'yes',
    });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'smoking')).toBe(true);
  });

  it('rejects a stray non-whitelisted field under the strict edge', async () => {
    const dto = plainToInstance(StateDto, {
      ...validPayload,
      _id: 'abc',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.some((e) => e.property === '_id')).toBe(true);
  });
});
