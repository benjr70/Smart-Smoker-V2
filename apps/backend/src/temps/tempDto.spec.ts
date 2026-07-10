import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TempDto } from './tempDto';

describe('TempDto', () => {
  it('passes for a well-formed payload', async () => {
    const dto = plainToInstance(TempDto, {
      MeatTemp: '160',
      Meat2Temp: '140',
      Meat3Temp: '130',
      ChamberTemp: '250',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a non-string temperature field', async () => {
    const dto = plainToInstance(TempDto, {
      MeatTemp: 160,
      Meat2Temp: '140',
      Meat3Temp: '130',
      ChamberTemp: '250',
    });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'MeatTemp')).toBe(true);
  });
});
