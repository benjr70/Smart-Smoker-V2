import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import * as webpush from 'web-push';
import { PushDispatcherService } from './push-dispatcher.service';
import { NotificationSubscription } from '../notifications/notificationSubscription.schema';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

const subscriptionAt = (endpoint: string): NotificationSubscription => ({
  endpoint,
  expirationTime: null,
  keys: { p256dh: `${endpoint}-p256dh`, auth: `${endpoint}-auth` },
});

/**
 * Stand-in for the Mongoose subscription collection: a real array the service
 * can read from and delete out of, so a prune is observable as "the next send
 * no longer attempts that endpoint" rather than as "deleteOne was called".
 */
const createSubscriptionStore = (initial: NotificationSubscription[]) => {
  let records = initial.map((record) => ({ ...record }));
  return {
    model: {
      find: jest.fn(() =>
        Promise.resolve(records.map((record) => ({ ...record }))),
      ),
      deleteOne: jest.fn((filter: { endpoint: string }) => ({
        exec: () => {
          records = records.filter(
            (record) => record.endpoint !== filter.endpoint,
          );
          return Promise.resolve({ deletedCount: 1 });
        },
      })),
    },
    endpoints: () => records.map((record) => record.endpoint),
  };
};

const buildService = async (
  store: ReturnType<typeof createSubscriptionStore>,
): Promise<PushDispatcherService> => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PushDispatcherService,
      {
        provide: getModelToken(NotificationSubscription.name),
        useValue: store.model,
      },
    ],
  }).compile();
  return module.get<PushDispatcherService>(PushDispatcherService);
};

const sentEndpoints = (): string[] =>
  (webpush.sendNotification as jest.Mock).mock.calls.map(
    ([subscription]) => subscription.endpoint,
  );

describe('PushDispatcherService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.VAPID_PUBLIC_KEY = 'test-public-key';
    process.env.VAPID_PRIVATE_KEY = 'test-private-key';
    (webpush.sendNotification as jest.Mock).mockResolvedValue({
      statusCode: 201,
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('notify', () => {
    it('delivers the title and body to every stored subscription', async () => {
      const store = createSubscriptionStore([
        subscriptionAt('https://push.example/a'),
        subscriptionAt('https://push.example/b'),
      ]);
      const service = await buildService(store);

      const delivered = await service.notify('Smoker', 'Chamber is cold');

      expect(sentEndpoints()).toEqual([
        'https://push.example/a',
        'https://push.example/b',
      ]);
      const [, payload] = (webpush.sendNotification as jest.Mock).mock.calls[0];
      expect(JSON.parse(payload)).toEqual(
        expect.objectContaining({ title: 'Smoker', body: 'Chamber is cold' }),
      );
      expect(delivered).toBe(2);
    });

    it('removes a subscription the push service reports as 410 Gone, so a later send skips it', async () => {
      const store = createSubscriptionStore([
        subscriptionAt('https://push.example/gone'),
        subscriptionAt('https://push.example/live'),
      ]);
      const service = await buildService(store);
      (webpush.sendNotification as jest.Mock).mockImplementation(
        (subscription: NotificationSubscription) =>
          subscription.endpoint === 'https://push.example/gone'
            ? Promise.reject({ statusCode: 410, body: 'Gone' })
            : Promise.resolve({ statusCode: 201 }),
      );

      const delivered = await service.notify('Smoker', 'first');

      expect(delivered).toBe(1);
      expect(store.endpoints()).toEqual(['https://push.example/live']);

      (webpush.sendNotification as jest.Mock).mockClear();
      (webpush.sendNotification as jest.Mock).mockResolvedValue({
        statusCode: 201,
      });

      await service.notify('Smoker', 'second');

      expect(sentEndpoints()).toEqual(['https://push.example/live']);
    });

    it('removes a subscription the push service reports as 404 Not Found', async () => {
      const store = createSubscriptionStore([
        subscriptionAt('https://push.example/missing'),
      ]);
      const service = await buildService(store);
      (webpush.sendNotification as jest.Mock).mockRejectedValue({
        statusCode: 404,
        body: 'Not Found',
      });

      await service.notify('Smoker', 'first');

      expect(store.endpoints()).toEqual([]);
    });

    it('keeps a subscription whose send failed for any other reason', async () => {
      const store = createSubscriptionStore([
        subscriptionAt('https://push.example/flaky'),
      ]);
      const service = await buildService(store);
      (webpush.sendNotification as jest.Mock).mockRejectedValue({
        statusCode: 500,
        body: 'Internal Server Error',
      });

      const delivered = await service.notify('Smoker', 'first');

      expect(delivered).toBe(0);
      expect(store.endpoints()).toEqual(['https://push.example/flaky']);
    });

    it('attempts every subscription even when one of them fails', async () => {
      const store = createSubscriptionStore([
        subscriptionAt('https://push.example/a'),
        subscriptionAt('https://push.example/broken'),
        subscriptionAt('https://push.example/c'),
      ]);
      const service = await buildService(store);
      (webpush.sendNotification as jest.Mock).mockImplementation(
        (subscription: NotificationSubscription) =>
          subscription.endpoint === 'https://push.example/broken'
            ? Promise.reject({ statusCode: 500 })
            : Promise.resolve({ statusCode: 201 }),
      );

      const delivered = await service.notify('Smoker', 'first');

      expect(sentEndpoints()).toEqual([
        'https://push.example/a',
        'https://push.example/broken',
        'https://push.example/c',
      ]);
      expect(delivered).toBe(2);
    });

    it('sends the app icon asset in the payload', async () => {
      const store = createSubscriptionStore([
        subscriptionAt('https://push.example/a'),
      ]);
      const service = await buildService(store);

      await service.notify('Smoker', 'Chamber is cold');

      const [, payload] = (webpush.sendNotification as jest.Mock).mock.calls[0];
      expect(JSON.parse(payload).icon).toBe('/logo192.png');
    });
  });

  // The VAPID contact is the address a push service uses to reach the
  // operator about a misbehaving sender. It is deployment-specific, so it has
  // to come from the environment rather than being baked into the source.
  describe('VAPID contact', () => {
    it('initialises web-push with the contact configured in the environment', async () => {
      process.env.VAPID_CONTACT = 'mailto:ops@example.org';

      await buildService(createSubscriptionStore([]));

      expect(webpush.setVapidDetails as jest.Mock).toHaveBeenCalledWith(
        'mailto:ops@example.org',
        'test-public-key',
        'test-private-key',
      );
    });

    // web-push validates the subject itself and throws on anything that is
    // not a mailto:/https: URL. That happens inside the constructor, so an
    // operator typo used to take Nest's DI down with it and crash-loop the
    // whole backend rather than degrading the way an unset key pair does.
    it('starts with the fallback contact when web-push rejects the configured one', async () => {
      process.env.VAPID_CONTACT = 'ops@example.org';
      (webpush.setVapidDetails as jest.Mock).mockImplementation(
        (contact: string) => {
          if (!contact.startsWith('mailto:')) {
            throw new Error('Vapid subject is not a url or mailto url');
          }
        },
      );

      const service = await buildService(createSubscriptionStore([]));

      expect(
        (webpush.setVapidDetails as jest.Mock).mock.calls.map(
          ([contact]) => contact,
        ),
      ).toEqual(['ops@example.org', 'mailto:smart-smoker@example.com']);
      expect(service.getPublicKey()).toBe('test-public-key');
    });

    it('still boots, reporting no usable key, when web-push rejects the VAPID details outright', async () => {
      (webpush.setVapidDetails as jest.Mock).mockImplementation(() => {
        throw new Error('Vapid public key should be 65 bytes long');
      });

      const service = await buildService(createSubscriptionStore([]));

      expect(service.getPublicKey()).toBeNull();
    });

    it('falls back to a non-personal contact when the environment sets none', async () => {
      delete process.env.VAPID_CONTACT;

      await buildService(createSubscriptionStore([]));

      const [contact] = (webpush.setVapidDetails as jest.Mock).mock.calls[0];
      expect(contact).toBe('mailto:smart-smoker@example.com');
    });
  });

  describe('getPublicKey', () => {
    it('returns the key configured in the environment', async () => {
      process.env.VAPID_PUBLIC_KEY = 'configured-public-key';
      const service = await buildService(createSubscriptionStore([]));

      expect(service.getPublicKey()).toBe('configured-public-key');
    });

    it('returns null when no key is configured', async () => {
      delete process.env.VAPID_PUBLIC_KEY;
      const service = await buildService(createSubscriptionStore([]));

      expect(service.getPublicKey()).toBeNull();
    });

    // A half-configured deployment (only one of the two secrets wired) cannot
    // sign a push: web-push is never initialised, so every send would be
    // rejected unsigned. Handing the public key out anyway would let a browser
    // subscribe against a key the server can never use, and the failure would
    // only ever show up in the server log.
    it('reports no key when the private key is missing, so a browser cannot subscribe against an unusable key', async () => {
      process.env.VAPID_PUBLIC_KEY = 'configured-public-key';
      delete process.env.VAPID_PRIVATE_KEY;
      const service = await buildService(createSubscriptionStore([]));

      expect(webpush.setVapidDetails as jest.Mock).not.toHaveBeenCalled();
      expect(service.getPublicKey()).toBeNull();
    });

    it('reports no key when the public key is missing even though the private one is set', async () => {
      delete process.env.VAPID_PUBLIC_KEY;
      process.env.VAPID_PRIVATE_KEY = 'configured-private-key';
      const service = await buildService(createSubscriptionStore([]));

      expect(service.getPublicKey()).toBeNull();
    });
  });
});
