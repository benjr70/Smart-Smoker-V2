import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { StateService } from '../State/state.service';
import { DEFAULT_APPLICATION_SETTINGS } from '../appSettings/app-settings.defaults';
import { ApplicationSettings } from '../appSettings/app-settings.schema';
import { AppSettingsService } from '../appSettings/app-settings.service';
import { PushDispatcherService } from '../pushDispatcher/push-dispatcher.service';
import { TempsService } from '../temps/temps.service';
import { AlertState } from './alert-state.schema';
import { NotificationSubscription } from './notificationSubscription.schema';
import {
  ALERT_EVALUATION_INTERVAL_MS,
  NotificationsService,
} from './notifications.service';

/**
 * Drain the promise chain an interval tick starts. Awaits are microtasks, which
 * fake timers leave alone, so a handful of turns settles the whole chain.
 */
const flushPromises = async (): Promise<void> => {
  for (let turn = 0; turn < 20; turn++) {
    await Promise.resolve();
  }
};

const createSubscriptionStore = () => {
  let records: NotificationSubscription[] = [];
  return {
    findOneAndUpdate: jest.fn(
      (filter: { endpoint: string }, update: NotificationSubscription) => ({
        exec: () => {
          const next = { ...update };
          const index = records.findIndex(
            (record) => record.endpoint === filter.endpoint,
          );
          if (index === -1) {
            records.push(next);
          } else {
            records[index] = next;
          }
          return Promise.resolve(next);
        },
      }),
    ),
    find: jest.fn(() =>
      Promise.resolve(records.map((record) => ({ ...record }))),
    ),
    reset: () => {
      records = [];
    },
  };
};

/**
 * Stand-in for a Mongoose model holding exactly one document. Backed by a real
 * value behind `findOne`/`findOneAndUpdate`, so the tests below observe "what is
 * stored afterwards" rather than "which query was issued" — they survive a
 * change of persistence strategy.
 */
const createSingletonStore = <T>(seed: T | null = null) => {
  let document: T | null = seed === null ? null : { ...seed };
  return {
    findOne: jest.fn(() => ({
      exec: () =>
        Promise.resolve(document === null ? null : { ...(document as object) }),
    })),
    findOneAndReplace: jest.fn((_filter: unknown, replacement: T) => ({
      exec: () => {
        document = { ...(replacement as object) } as T;
        return Promise.resolve({ ...(document as object) });
      },
    })),
    /** What is persisted right now. */
    stored: () => (document === null ? null : ({ ...document } as T)),
    seed: (value: T | null) => {
      document = value === null ? null : ({ ...value } as T);
    },
  };
};

/**
 * Stand-in for the application settings the alert rules are configured by. The
 * real service is exercised by its own tests; here it only has to hold a
 * document, so that "what the cook saved is what evaluation reads" is a fact
 * about stored values rather than about a mock's call log.
 */
const createAppSettings = () => {
  let document: ApplicationSettings = DEFAULT_APPLICATION_SETTINGS;
  return {
    getSettings: jest.fn(() => Promise.resolve(document)),
    saveSettings: jest.fn((incoming: Partial<ApplicationSettings>) => {
      document = { ...document, ...incoming };
      return Promise.resolve(document);
    }),
    seed: (value: Partial<ApplicationSettings>) => {
      document = { ...DEFAULT_APPLICATION_SETTINGS, ...value };
    },
  };
};

describe('NotificationsService', () => {
  let service: NotificationsService;
  let subscriptions: ReturnType<typeof createSubscriptionStore>;
  let settings: ReturnType<typeof createAppSettings>;
  let alertState: ReturnType<typeof createSingletonStore<AlertState>>;
  let pushDispatcher: { notify: jest.Mock; getPublicKey: jest.Mock };
  let smokeSession: { GetState: jest.Mock };
  let temps: { getLatestCurrentTemp: jest.Mock };

  const mockSubscription: NotificationSubscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
    expirationTime: null,
    keys: {
      p256dh: 'test-p256dh-key',
      auth: 'test-auth-key',
    },
  };

  beforeEach(async () => {
    subscriptions = createSubscriptionStore();
    settings = createAppSettings();
    alertState = createSingletonStore<AlertState>();

    pushDispatcher = {
      notify: jest.fn().mockResolvedValue(1),
      getPublicKey: jest.fn().mockReturnValue('test-public-key'),
    };
    smokeSession = {
      GetState: jest
        .fn()
        .mockResolvedValue({ smokeId: 'smoke-1', smoking: true }),
    };
    temps = { getLatestCurrentTemp: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getModelToken(NotificationSubscription.name),
          useValue: subscriptions,
        },
        { provide: AppSettingsService, useValue: settings },
        { provide: getModelToken(AlertState.name), useValue: alertState },
        { provide: PushDispatcherService, useValue: pushDispatcher },
        { provide: StateService, useValue: smokeSession },
        { provide: TempsService, useValue: temps },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('setSubscription', () => {
    it('stores a subscription whose endpoint is not yet known', async () => {
      const result = await service.setSubscription(mockSubscription);

      expect(await service.getSubscriptions()).toEqual([mockSubscription]);
      expect(result).toEqual(expect.objectContaining(mockSubscription));
    });

    it('replaces the stored record when the endpoint is already registered, rather than failing', async () => {
      await service.setSubscription(mockSubscription);
      const rotated = {
        ...mockSubscription,
        keys: { p256dh: 'rotated-p256dh', auth: 'rotated-auth' },
      };

      const result = await service.setSubscription(rotated);

      expect(result).toEqual(expect.objectContaining(rotated));
      expect(await service.getSubscriptions()).toEqual([rotated]);
    });

    it('stores a subscription with a new endpoint alongside the existing ones', async () => {
      await service.setSubscription(mockSubscription);
      const second = {
        ...mockSubscription,
        endpoint: 'https://fcm.googleapis.com/fcm/send/second-endpoint',
      };

      await service.setSubscription(second);

      expect(await service.getSubscriptions()).toEqual([
        mockSubscription,
        second,
      ]);
    });
  });

  describe('getSubscriptions', () => {
    it('should return all subscriptions', async () => {
      await service.setSubscription(mockSubscription);

      const result = await service.getSubscriptions();

      expect(result).toEqual([mockSubscription]);
    });

    it('returns an empty list before anything has registered', async () => {
      expect(await service.getSubscriptions()).toEqual([]);
    });
  });

  describe('checkAlerts', () => {
    const chamberAt = (temp: string) => ({ ChamberTemp: temp });

    beforeEach(() => {
      settings.seed({ chamber: { enabled: true, low: 225, high: 275 } });
    });

    it('says nothing about an idle smoker, whatever its chamber reads', async () => {
      smokeSession.GetState.mockResolvedValue({
        smokeId: 'smoke-1',
        smoking: false,
      });
      temps.getLatestCurrentTemp.mockResolvedValue(chamberAt('40'));

      await service.checkAlerts();

      expect(pushDispatcher.notify).not.toHaveBeenCalled();
      expect(alertState.stored()).toBeNull();
    });

    it('pushes one alert when the chamber, having reached its range, stays out of it', async () => {
      jest.useFakeTimers({ doNotFake: ['performance'] } as any);
      try {
        jest.setSystemTime(new Date('2026-08-02T10:00:00Z'));
        temps.getLatestCurrentTemp.mockResolvedValue(chamberAt('240'));
        await service.checkAlerts();

        jest.setSystemTime(new Date('2026-08-02T10:30:00Z'));
        temps.getLatestCurrentTemp.mockResolvedValue(chamberAt('180'));
        await service.checkAlerts();
        expect(pushDispatcher.notify).not.toHaveBeenCalled();

        jest.setSystemTime(new Date('2026-08-02T10:33:00Z'));
        await service.checkAlerts();
        await service.checkAlerts();

        expect(pushDispatcher.notify).toHaveBeenCalledTimes(1);
        expect(pushDispatcher.notify).toHaveBeenCalledWith(
          'Smoker',
          'Chamber dropped to 180°F, below your 225°F low.',
        );
      } finally {
        jest.useRealTimers();
      }
    });

    // The previous implementation rewrote the whole settings document on every
    // evaluation just to record a timestamp, so an edit typed during a cook was
    // silently overwritten a few seconds later.
    it('leaves a settings edit made during a cook exactly as the user saved it', async () => {
      const edited = { chamber: { enabled: true, low: 200, high: 300 } };
      temps.getLatestCurrentTemp.mockResolvedValue(chamberAt('240'));

      await Promise.all([service.checkAlerts(), settings.saveSettings(edited)]);
      await service.checkAlerts();

      expect(await settings.getSettings()).toMatchObject(edited);
      expect(alertState.stored()).toMatchObject({ chamberArmed: true });
    });

    // Clearing a session starts a new smoke. Whatever the last cook had armed
    // must not carry over, or the next cook would alert while still preheating.
    it('preheats the next cook in silence after the session was cleared', async () => {
      alertState.seed({
        smokeId: 'finished-smoke',
        chamberArmed: true,
        chamberOutOfRangeSince: new Date('2020-01-01T00:00:00Z'),
        chamberAlertSent: false,
      });
      smokeSession.GetState.mockResolvedValue({
        smokeId: 'fresh-smoke',
        smoking: true,
      });
      temps.getLatestCurrentTemp.mockResolvedValue(chamberAt('90'));

      await service.checkAlerts();

      expect(pushDispatcher.notify).not.toHaveBeenCalled();
      expect(alertState.stored()).toMatchObject({
        smokeId: 'fresh-smoke',
        chamberArmed: false,
        chamberOutOfRangeSince: null,
      });
    });

    // Evaluation used to ride on websocket traffic (every eleventh message), so
    // a "sustained for two minutes" rule meant whatever two minutes of device
    // chatter happened to be. The schedule is owned here now.
    it('evaluates on its own schedule once the service starts, without anything calling it', async () => {
      jest.useFakeTimers({ doNotFake: ['performance'] } as any);
      try {
        temps.getLatestCurrentTemp.mockResolvedValue(chamberAt('240'));

        service.onModuleInit();
        expect(alertState.stored()).toBeNull();

        jest.advanceTimersByTime(ALERT_EVALUATION_INTERVAL_MS);
        await flushPromises();

        expect(alertState.stored()).toMatchObject({ chamberArmed: true });
      } finally {
        service.onModuleDestroy();
        jest.useRealTimers();
      }
    });

    it('stops evaluating once the service shuts down', async () => {
      jest.useFakeTimers({ doNotFake: ['performance'] } as any);
      try {
        temps.getLatestCurrentTemp.mockResolvedValue(chamberAt('240'));

        service.onModuleInit();
        service.onModuleDestroy();
        jest.advanceTimersByTime(ALERT_EVALUATION_INTERVAL_MS * 5);
        await flushPromises();

        expect(alertState.stored()).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('sendPushNotification', () => {
    it('hands the message to the push dispatcher', async () => {
      await service.sendPushNotification('Test notification');

      expect(pushDispatcher.notify).toHaveBeenCalledWith(
        'Smoker',
        'Test notification',
      );
    });
  });

  describe('sendTestNotification', () => {
    it('dispatches a test notification to every stored subscription', async () => {
      pushDispatcher.notify.mockResolvedValue(3);

      const result = await service.sendTestNotification();

      expect(pushDispatcher.notify).toHaveBeenCalledWith(
        'Smoker',
        expect.stringContaining('test'),
      );
      expect(result).toEqual({ sent: 3 });
    });
  });

  describe('getPublicKey', () => {
    it('returns the configured VAPID public key', async () => {
      pushDispatcher.getPublicKey.mockReturnValue('configured-key');

      expect(await service.getPublicKey()).toEqual({
        publicKey: 'configured-key',
      });
    });

    it('reports a null key when the deployment has none configured', async () => {
      pushDispatcher.getPublicKey.mockReturnValue(null);

      expect(await service.getPublicKey()).toEqual({ publicKey: null });
    });
  });
});
