import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NotificationSettingsDto } from './notificationSettingsDto';

/**
 * The notifications settings endpoint runs under the app's global
 * ValidationPipe (whitelist + forbidNonWhitelisted + transform), so the DTO is
 * the contract: anything it does not declare is a 400, and the settings page's
 * save-on-unmount fails silently when the two disagree. These tests pin it to
 * the exact shapes the settings page sends.
 */
describe('NotificationSettingsDto validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const metadata = { type: 'body' as const, metatype: NotificationSettingsDto };

  it('accepts the chamber Temperature Alert the settings page saves', async () => {
    const body = { chamber: { enabled: true, low: 225, high: 275 } };

    const result = await pipe.transform(body, metadata);

    expect(result.chamber).toEqual({ enabled: true, low: 225, high: 275 });
  });

  it('rejects the deleted freeform rule list rather than storing it', async () => {
    const body = {
      settings: [
        { type: false, message: 'Chamber hot', probe1: 'Chamber', op: '>' },
      ],
    };

    await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a range whose bounds are not numbers', async () => {
    const body = { chamber: { enabled: true, low: 'cold', high: 275 } };

    await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an unknown top-level property', async () => {
    const body = {
      chamber: { enabled: false, low: 225, high: 275 },
      bogus: true,
    };

    await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
