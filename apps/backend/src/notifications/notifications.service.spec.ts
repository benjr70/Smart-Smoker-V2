import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { StateService } from '../State/state.service';
import { DEFAULT_APPLICATION_SETTINGS } from '../appSettings/app-settings.defaults';
import { ApplicationSettings } from '../appSettings/app-settings.schema';
import { AppSettingsService } from '../appSettings/app-settings.service';
import { withSeededTargets } from '../appSettings/meat-presets';
import { PreSmokeService } from '../presmoke/presmoke.service';
import { PushDispatcherService } from '../pushDispatcher/push-dispatcher.service';
import { SmokeProfileService } from '../smokeProfile/smokeProfile.service';
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
    // Seeding applies the same rule the real service applies — the rule itself
    // is a pure function both of them call — so what a cook is told here
    // depends on the targets a session start would really have written.
    seedProbeTargets: jest.fn((meatType: string | null | undefined) => {
      const seeded = withSeededTargets(
        document.probeTarget.probes,
        document.targetPresets,
        meatType,
      );
      if (seeded) {
        document = {
          ...document,
          probeTarget: { ...document.probeTarget, probes: seeded },
        };
      }
      return Promise.resolve(document);
    }),
    seed: (value: Partial<ApplicationSettings>) => {
      document = { ...DEFAULT_APPLICATION_SETTINGS, ...value };
    },
    /** The settings as they stand, for a test asking what seeding wrote. */
    stored: () => document,
  };
};

describe('NotificationsService', () => {
  let service: NotificationsService;
  let subscriptions: ReturnType<typeof createSubscriptionStore>;
  let settings: ReturnType<typeof createAppSettings>;
  let alertState: ReturnType<typeof createSingletonStore<AlertState>>;
  let pushDispatcher: { notify: jest.Mock; getPublicKey: jest.Mock };
  let smokeSession: { GetState: jest.Mock };
  let smokeProfile: { getCurrentSmokeProfile: jest.Mock };
  let preSmoke: { GetByCurrent: jest.Mock };
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
    smokeProfile = {
      getCurrentSmokeProfile: jest.fn().mockResolvedValue({
        chamberName: 'Chamber',
        probe1Name: '',
        probe2Name: '',
        probe3Name: '',
      }),
    };
    preSmoke = {
      GetByCurrent: jest.fn().mockResolvedValue({ meatType: 'Packer brisket' }),
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
        { provide: SmokeProfileService, useValue: smokeProfile },
        { provide: PreSmokeService, useValue: preSmoke },
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

    /**
     * A cook watching one probe, at the target the user set for it — marked as
     * theirs, so the session start leaves it exactly where they put it.
     */
    const watchingProbe = (slot: string, target: number) => ({
      chamber: { enabled: true, low: 225, high: 275 },
      probeTarget: {
        enabled: true,
        probes: [
          { slot, enabled: true, target, targetSource: 'user' as const },
        ],
      },
    });

    /** The body the Smoke Complete alert is announced with. */
    const SMOKE_COMPLETE =
      'Smoke complete — every probe you are watching has reached its target.';

    beforeEach(() => {
      settings.seed({ chamber: { enabled: true, low: 225, high: 275 } });
    });

    it('tells the cook once when a watched probe reaches its target, naming it as this cook named it', async () => {
      settings.seed(watchingProbe('probe2', 195));
      smokeProfile.getCurrentSmokeProfile.mockResolvedValue({
        probe1Name: 'Brisket Flat',
        probe2Name: 'Pork Butt',
        probe3Name: '',
      });
      temps.getLatestCurrentTemp.mockResolvedValue({
        ChamberTemp: '240',
        MeatTemp: '150',
        Meat2Temp: '196',
        Meat3Temp: '120',
      });

      await service.checkAlerts();
      await service.checkAlerts();

      expect(pushDispatcher.notify).toHaveBeenCalledTimes(1);
      expect(pushDispatcher.notify).toHaveBeenCalledWith(
        'Smoker',
        'Pork Butt reached 196°F.',
      );
    });

    // "Once per probe per session" has to mean per session: the same probe, in
    // the same slot, at the same target, is a different piece of meat next
    // weekend and has to be announced again.
    it('announces a probe again on the next cook, though it already finished on the last one', async () => {
      settings.seed(watchingProbe('probe1', 203));
      alertState.seed({
        smokeId: 'last-weekend',
        chamberArmed: true,
        chamberOutOfRangeSince: null,
        chamberAlertSent: false,
        probeTargetsReached: ['probe1'],
        smokeCompleteProbesDone: ['probe1'],
        smokeCompleteFired: false,
      });
      smokeSession.GetState.mockResolvedValue({
        smokeId: 'this-weekend',
        smoking: true,
      });
      smokeProfile.getCurrentSmokeProfile.mockResolvedValue({
        probe1Name: 'Brisket Flat',
      });
      temps.getLatestCurrentTemp.mockResolvedValue({
        ChamberTemp: '240',
        MeatTemp: '205',
      });

      await service.checkAlerts();

      expect(pushDispatcher.notify).toHaveBeenCalledWith(
        'Smoker',
        'Brisket Flat reached 205°F.',
      );
      expect(alertState.stored()).toMatchObject({
        smokeId: 'this-weekend',
        probeTargetsReached: ['probe1'],
      });
    });

    // A cook started from pre-smoke has a smoke before it has a smoke profile,
    // and the profile service fills that window with placeholders of its own. A
    // probe can finish in that window, and the alert must not name it `Probe3`.
    it('names a finished probe generically while the cook has no smoke profile saved yet', async () => {
      settings.seed(watchingProbe('probe3', 165));
      smokeProfile.getCurrentSmokeProfile.mockResolvedValue({
        chamberName: 'Chamber',
        probe1Name: 'Probe1',
        probe2Name: 'Probe2',
        probe3Name: 'Probe3',
      });
      temps.getLatestCurrentTemp.mockResolvedValue({
        ChamberTemp: '240',
        Meat3Temp: '170',
      });

      await service.checkAlerts();

      expect(pushDispatcher.notify).toHaveBeenCalledWith(
        'Smoker',
        'Probe 3 reached 170°F.',
      );
    });

    // A probe whose slot the cook never named still has to say something a
    // person can act on, rather than the slot identifier or nothing at all.
    it('falls back to the slot label for a probe this cook did not name', async () => {
      settings.seed(watchingProbe('probe3', 165));
      smokeProfile.getCurrentSmokeProfile.mockResolvedValue({
        probe1Name: 'Brisket Flat',
        probe3Name: '',
      });
      temps.getLatestCurrentTemp.mockResolvedValue({
        ChamberTemp: '240',
        Meat3Temp: '170',
      });

      await service.checkAlerts();

      expect(pushDispatcher.notify).toHaveBeenCalledWith(
        'Smoker',
        'Probe 3 reached 170°F.',
      );
    });

    // The completion marker is session-scoped like every other one, so the meat
    // that finished last weekend cannot silence this weekend's cook.
    it('completes the next cook too, though the last one already completed', async () => {
      settings.seed({
        ...watchingProbe('probe1', 203),
        smokeComplete: { enabled: true },
      });
      alertState.seed({
        smokeId: 'last-weekend',
        chamberArmed: true,
        chamberOutOfRangeSince: null,
        chamberAlertSent: false,
        probeTargetsReached: ['probe1'],
        smokeCompleteProbesDone: ['probe1'],
        smokeCompleteFired: true,
      });
      smokeSession.GetState.mockResolvedValue({
        smokeId: 'this-weekend',
        smoking: true,
      });
      temps.getLatestCurrentTemp.mockResolvedValue({
        ChamberTemp: '240',
        MeatTemp: '205',
      });

      await service.checkAlerts();
      // The rest of the cook adds nothing: it is one completion per session.
      await service.checkAlerts();

      expect(pushDispatcher.notify).toHaveBeenCalledWith(
        'Smoker',
        SMOKE_COMPLETE,
      );
      expect(
        pushDispatcher.notify.mock.calls.filter(
          ([, body]) => body === SMOKE_COMPLETE,
        ),
      ).toHaveLength(1);
      expect(alertState.stored()).toMatchObject({
        smokeId: 'this-weekend',
        smokeCompleteFired: true,
      });
    });

    // The completion is what the cook cannot see coming; the finish action is
    // something they just did. Wiring one to the other would announce a smoke
    // complete to the person who pressed Finish, which is why nothing here
    // listens to it — a finished session is simply not evaluated.
    it('announces nothing when the cook finishes the smoke themselves', async () => {
      settings.seed({
        ...watchingProbe('probe1', 203),
        smokeComplete: { enabled: true },
      });
      smokeSession.GetState.mockResolvedValue({
        smokeId: 'smoke-1',
        smoking: false,
      });
      temps.getLatestCurrentTemp.mockResolvedValue({
        ChamberTemp: '240',
        MeatTemp: '205',
      });

      await service.checkAlerts();

      expect(pushDispatcher.notify).not.toHaveBeenCalled();
    });

    /**
     * The cook typed what they are smoking into pre-smoke. Nobody should have
     * to go and copy the matching done temperature onto the probes by hand, so
     * the session start does it for them.
     */
    describe('the targets a session starts with', () => {
      /** A cook watching one probe, on the target nobody has changed. */
      const watchingUntouched = (slot: string) => ({
        chamber: { enabled: true, low: 225, high: 275 },
        probeTarget: {
          enabled: true,
          probes: [
            {
              slot,
              enabled: true,
              target: 203,
              targetSource: 'default' as const,
            },
          ],
        },
      });

      it('gives a watched probe the default target for the meat in pre-smoke', async () => {
        settings.seed(watchingUntouched('probe1'));
        preSmoke.GetByCurrent.mockResolvedValue({
          meatType: 'Whole chicken',
        });
        temps.getLatestCurrentTemp.mockResolvedValue({
          ChamberTemp: '240',
          MeatTemp: '170',
        });

        await service.checkAlerts();

        // 170°F is short of the 203°F it was carrying and past the 165°F
        // poultry is done at, so the alert is the seeding being visible.
        expect(pushDispatcher.notify).toHaveBeenCalledWith(
          'Smoker',
          'Probe 1 reached 170°F.',
        );
      });

      /**
       * Seeding is something a session does once, at its start. Editing the
       * defaults afterwards is a decision about the next cook — the one already
       * on the smoker keeps the targets it started with, rather than being
       * retargeted under the cook thirty seconds later.
       */
      it('does not seed again on the next reading of the same session', async () => {
        settings.seed(watchingUntouched('probe1'));
        preSmoke.GetByCurrent.mockResolvedValue({ meatType: 'Whole chicken' });
        temps.getLatestCurrentTemp.mockResolvedValue({
          ChamberTemp: '240',
          MeatTemp: '120',
        });
        await service.checkAlerts();

        await settings.saveSettings({
          targetPresets: { beef: 203, pork: 200, poultry: 175 },
        });
        await service.checkAlerts();

        expect(settings.stored().probeTarget.probes).toEqual([
          {
            slot: 'probe1',
            enabled: true,
            target: 165,
            targetSource: 'preset',
          },
        ]);
      });

      it('seeds nothing when pre-smoke names a meat it does not recognise', async () => {
        settings.seed(watchingUntouched('probe1'));
        preSmoke.GetByCurrent.mockResolvedValue({ meatType: 'Salmon fillet' });
        temps.getLatestCurrentTemp.mockResolvedValue({
          ChamberTemp: '240',
          MeatTemp: '170',
        });

        await service.checkAlerts();

        expect(settings.stored().probeTarget.probes).toEqual([
          {
            slot: 'probe1',
            enabled: true,
            target: 203,
            targetSource: 'default',
          },
        ]);
        expect(pushDispatcher.notify).not.toHaveBeenCalled();
      });

      // A cook that reached the smoke step without filling pre-smoke in has no
      // meat type at all, which is the same silence as an unrecognised one.
      it('seeds nothing when there is no pre-smoke document', async () => {
        settings.seed(watchingUntouched('probe1'));
        preSmoke.GetByCurrent.mockResolvedValue(null);
        temps.getLatestCurrentTemp.mockResolvedValue({
          ChamberTemp: '240',
          MeatTemp: '170',
        });

        await service.checkAlerts();

        expect(settings.stored().probeTarget.probes).toEqual([
          {
            slot: 'probe1',
            enabled: true,
            target: 203,
            targetSource: 'default',
          },
        ]);
      });
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
        probeTargetsReached: ['probe1'],
        smokeCompleteProbesDone: ['probe1'],
        smokeCompleteFired: true,
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
        // The fired-once markers go with it: the same probe has to be able to
        // announce itself again on this cook, and this cook has to be able to
        // complete on its own account.
        probeTargetsReached: [],
        smokeCompleteProbesDone: [],
        smokeCompleteFired: false,
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
