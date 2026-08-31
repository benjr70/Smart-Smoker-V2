import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DEFAULT_POINTS, MAX_POINTS, MIN_POINTS } from './temp-series';
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

  it('reads a request that asks for no particular size as the default size', async () => {
    const dto = plainToInstance(TempSeriesQueryDto, {});

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.points).toBe(DEFAULT_POINTS);
  });

  /**
   * The caller asked for a chart. The nearest chart this endpoint draws is a
   * better answer than an error, so every unservable size is read as a
   * servable one rather than refused — and the range and default the OpenAPI
   * schema publishes are then true of what a caller is actually served.
   */
  it.each`
    asked       | served            | when
    ${'lots'}   | ${DEFAULT_POINTS} | ${'a size that is not a number'}
    ${''}       | ${DEFAULT_POINTS} | ${'a size named but not chosen'}
    ${'0'}      | ${MIN_POINTS}     | ${'a size below the floor'}
    ${'100000'} | ${MAX_POINTS}     | ${'a size above the ceiling'}
    ${'50.7'}   | ${50}             | ${'a fractional size'}
  `('reads $when as $served points', async ({ asked, served }) => {
    const dto = plainToInstance(TempSeriesQueryDto, { points: asked });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.points).toBe(served);
  });
});
