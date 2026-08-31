import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TempSeriesQueryDto } from './temp-series.dto';

describe('TempSeriesQueryDto', () => {
  /**
   * A query string carries strings, so a size arrives as `'50'` and reaches
   * the service as a number or not at all.
   */
  it('reads the size out of the query string as a number', async () => {
    const dto = plainToInstance(TempSeriesQueryDto, { points: '50' });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.points).toBe(50);
  });

  it('accepts a request that asks for no particular size', async () => {
    const dto = plainToInstance(TempSeriesQueryDto, {});

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.points).toBeUndefined();
  });

  it('refuses a size that is not a number at all', async () => {
    const dto = plainToInstance(TempSeriesQueryDto, { points: 'lots' });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'points')).toBe(true);
  });
});
