import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSettingsDto } from './settingsDto';

describe('CreateSettingsDto', () => {
  const validPayload = {
    id: 'settings-1',
    dataExportEmail: 'user@example.com',
    notifications: {
      MinMeatTemp: 100,
      MaxMeatTemp: 200,
      MinChamberTemp: 150,
      MaxChamberTemp: 300,
    },
  };

  it('passes for a well-formed payload', async () => {
    const dto = plainToInstance(CreateSettingsDto, validPayload);

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a non-string dataExportEmail', async () => {
    const dto = plainToInstance(CreateSettingsDto, {
      ...validPayload,
      dataExportEmail: 123,
    });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'dataExportEmail')).toBe(true);
  });

  it('rejects a malformed nested notifications block', async () => {
    const dto = plainToInstance(CreateSettingsDto, {
      ...validPayload,
      notifications: {
        MinMeatTemp: 'cold',
        MaxMeatTemp: 200,
        MinChamberTemp: 150,
        MaxChamberTemp: 300,
      },
    });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'notifications')).toBe(true);
  });
});
