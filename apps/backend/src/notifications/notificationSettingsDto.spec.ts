import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NotificationSettingsDto } from './notificationSettingsDto';

/**
 * The notifications settings endpoint runs under the app's global
 * ValidationPipe (whitelist + forbidNonWhitelisted + transform). Before this
 * DTO existed the @Body was the decorator-less schema class, so class-validator
 * rejected every payload with "an unknown value was passed to the validate
 * function" and the frontend's save-on-unmount silently failed. These tests
 * pin the DTO to the exact shapes the frontend sends.
 */
describe('NotificationSettingsDto validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const metadata = { type: 'body' as const, metatype: NotificationSettingsDto };

  it('accepts the payload a first-time save sends', async () => {
    const body = {
      settings: [
        {
          type: false,
          message: 'Chamber hot',
          probe1: 'Chamber',
          op: '>',
          probe2: 'Probe 1',
        },
      ],
    };

    const result = await pipe.transform(body, metadata);

    expect(result.settings[0].message).toBe('Chamber hot');
  });

  it('accepts the re-save shape carrying persisted _id/lastNotificationSent', async () => {
    const body = {
      settings: [
        {
          _id: '507f1f77bcf86cd799439011',
          type: true,
          message: 'Meat done',
          probe1: 'Probe 1',
          op: '>',
          probe2: 'Probe 2',
          offset: 2,
          temperature: 203,
          lastNotificationSent: new Date(0).toISOString(),
        },
      ],
    };

    const result = await pipe.transform(body, metadata);

    expect(result.settings[0].temperature).toBe(203);
  });

  it('rejects an unknown top-level property', async () => {
    const body = { settings: [], bogus: true };

    await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
