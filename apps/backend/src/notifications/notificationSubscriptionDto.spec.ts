import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { NotificationSubscriptionDto } from './notificationSubscriptionDto';

describe('NotificationSubscriptionDto', () => {
  const validPayload = {
    endpoint: 'https://push.example.com/abc',
    expirationTime: null,
    keys: {
      p256dh: 'public-key',
      auth: 'auth-secret',
    },
  };

  it('passes for a browser PushSubscription shape (null expirationTime)', async () => {
    const dto = plainToInstance(NotificationSubscriptionDto, validPayload);

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a missing endpoint', async () => {
    const dto = plainToInstance(NotificationSubscriptionDto, {
      ...validPayload,
      endpoint: 42,
    });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'endpoint')).toBe(true);
  });

  it('rejects malformed keys', async () => {
    const dto = plainToInstance(NotificationSubscriptionDto, {
      ...validPayload,
      keys: { p256dh: 1, auth: 2 },
    });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'keys')).toBe(true);
  });

  it('rejects a stray non-whitelisted field under the strict edge', async () => {
    const dto = plainToInstance(NotificationSubscriptionDto, {
      ...validPayload,
      unexpected: 'nope',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.some((e) => e.property === 'unexpected')).toBe(true);
  });
});
