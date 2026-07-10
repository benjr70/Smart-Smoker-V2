import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SmokeProFileDto } from './smokeProfileDto';

describe('SmokeProFileDto', () => {
  it('passes for a well-formed payload', async () => {
    const dto = plainToInstance(SmokeProFileDto, {
      chamberName: 'Chamber',
      probe1Name: 'Probe1',
      probe2Name: 'Probe2',
      probe3Name: 'Probe3',
      notes: '',
      woodType: 'Hickory',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a non-string chamberName', async () => {
    const dto = plainToInstance(SmokeProFileDto, {
      chamberName: 42,
      probe1Name: 'Probe1',
      probe2Name: 'Probe2',
      probe3Name: 'Probe3',
      notes: '',
      woodType: 'Hickory',
    });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'chamberName')).toBe(true);
  });
});
