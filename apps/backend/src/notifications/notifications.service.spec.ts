import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotificationsService } from './notifications.service';
import { NotificationSubscription } from './notificationSubscription.schema';
import { NotificationSettings } from './notificationSettings.schema';
import { TempDto } from '../temps/tempDto';
import { PushDispatcherService } from '../pushDispatcher/push-dispatcher.service';

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

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockNotificationSubscriptionModel: any;
  let mockNotificationSettingsModel: any;
  let mockPushDispatcher: { notify: jest.Mock; getPublicKey: jest.Mock };

  const mockSubscription: NotificationSubscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
    expirationTime: null,
    keys: {
      p256dh: 'test-p256dh-key',
      auth: 'test-auth-key',
    },
  };

  const mockNotificationSettings: NotificationSettings = {
    settings: [
      {
        type: false,
        message: 'Chamber temp too high',
        probe1: 'Chamber',
        op: '>',
        temperature: 300,
        lastNotificationSent: new Date('2023-01-01'),
        probe2: undefined,
        offset: undefined,
      },
      {
        type: true,
        message: 'Meat temp reached target',
        probe1: 'Meat1',
        op: '>',
        probe2: 'Chamber',
        offset: 50,
        lastNotificationSent: new Date('2023-01-01'),
        temperature: undefined,
      },
    ],
  };

  const mockTempDto: TempDto = {
    ChamberTemp: '250',
    MeatTemp: '160',
    Meat2Temp: '140',
    Meat3Temp: '130',
    tempsId: 'temp-id',
    date: new Date(),
  };

  beforeEach(async () => {
    // Stand-in for the Mongoose subscription collection: a real array behind
    // the upsert and read operations, so registration behaviour is observable
    // as "what is stored afterwards" rather than as "which query was issued".
    mockNotificationSubscriptionModel = createSubscriptionStore();

    // Mock NotificationSettings model
    mockNotificationSettingsModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ ...dto, _id: 'new-settings-id' }),
    }));

    mockNotificationSettingsModel.findOne = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    mockPushDispatcher = {
      notify: jest.fn().mockResolvedValue(1),
      getPublicKey: jest.fn().mockReturnValue('test-public-key'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getModelToken(NotificationSubscription.name),
          useValue: mockNotificationSubscriptionModel,
        },
        {
          provide: getModelToken(NotificationSettings.name),
          useValue: mockNotificationSettingsModel,
        },
        {
          provide: PushDispatcherService,
          useValue: mockPushDispatcher,
        },
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

  describe('setSettings', () => {
    it('should create new settings when none exist', async () => {
      const result = await service.setSettings(mockNotificationSettings);

      expect(mockNotificationSettingsModel.findOne).toHaveBeenCalled();
      expect(mockNotificationSettingsModel).toHaveBeenCalledWith(
        mockNotificationSettings,
      );
      expect(result).toEqual(expect.objectContaining(mockNotificationSettings));
    });

    it('should update existing settings', async () => {
      const existingSettings = {
        ...mockNotificationSettings,
        save: jest.fn().mockResolvedValue(mockNotificationSettings),
      };

      mockNotificationSettingsModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(existingSettings),
      });

      const result = await service.setSettings(mockNotificationSettings);

      expect(existingSettings.save).toHaveBeenCalled();
      expect(result).toEqual(mockNotificationSettings);
    });
  });

  describe('getSettings', () => {
    it('should return notification settings', async () => {
      mockNotificationSettingsModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockNotificationSettings),
      });

      const result = await service.getSettings();

      expect(mockNotificationSettingsModel.findOne).toHaveBeenCalled();
      expect(result).toEqual(mockNotificationSettings);
    });
  });

  describe('checkForNotification', () => {
    beforeEach(() => {
      mockNotificationSettingsModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockNotificationSettings),
      });
      jest.spyOn(service, 'sendPushNotification').mockResolvedValue(undefined);
      jest
        .spyOn(service, 'setSettings')
        .mockResolvedValue(mockNotificationSettings);
    });

    it('should trigger notification when chamber temp exceeds threshold', async () => {
      const highTempDto = { ...mockTempDto, ChamberTemp: '350' };

      await service.checkForNotification(highTempDto);

      expect(service.sendPushNotification).toHaveBeenCalledWith(
        'Chamber temp too high',
      );
      expect(service.setSettings).toHaveBeenCalled();
    });

    it('should trigger notification when meat temp exceeds chamber temp + offset', async () => {
      const highMeatTempDto = {
        ...mockTempDto,
        MeatTemp: '320',
        ChamberTemp: '250',
      };

      await service.checkForNotification(highMeatTempDto);

      expect(service.sendPushNotification).toHaveBeenCalledWith(
        'Meat temp reached target',
      );
    });

    it('should handle different probe types', async () => {
      const settings = {
        settings: [
          {
            type: false,
            message: 'Meat2 temp too low',
            probe1: 'Meat2',
            op: '<',
            temperature: 150,
            lastNotificationSent: new Date('2023-01-01'),
            probe2: undefined,
            offset: undefined,
          },
        ],
      };

      mockNotificationSettingsModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(settings),
      });

      await service.checkForNotification(mockTempDto);

      expect(service.sendPushNotification).toHaveBeenCalledWith(
        'Meat2 temp too low',
      );
    });

    it('should handle Meat3 probe type', async () => {
      const settings = {
        settings: [
          {
            type: false,
            message: 'Meat3 temp too low',
            probe1: 'Meat3',
            op: '<',
            temperature: 150,
            lastNotificationSent: new Date('2023-01-01'),
            probe2: undefined,
            offset: undefined,
          },
        ],
      };

      mockNotificationSettingsModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(settings),
      });

      await service.checkForNotification(mockTempDto);

      expect(service.sendPushNotification).toHaveBeenCalledWith(
        'Meat3 temp too low',
      );
    });

    it('should handle probe2 comparison with different probes', async () => {
      const settings = {
        settings: [
          {
            type: true,
            message: 'Meat1 exceeds Meat2',
            probe1: 'Meat1',
            op: '>',
            probe2: 'Meat2',
            offset: 10,
            lastNotificationSent: new Date('2023-01-01'),
            temperature: undefined,
          },
        ],
      };

      mockNotificationSettingsModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(settings),
      });

      await service.checkForNotification(mockTempDto);

      expect(service.sendPushNotification).toHaveBeenCalledWith(
        'Meat1 exceeds Meat2',
      );
    });

    // The settings page stores the probe selector as the label the user picked
    // ('Probe 1'), while the oldest stored rules use the legacy 'Meat1' form.
    // Both name the same physical reading, so both must resolve to it —
    // otherwise the rule a user builds in the UI silently never fires.
    it('fires a rule written with the settings-page probe name "Probe 1"', async () => {
      mockNotificationSettingsModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          settings: [
            {
              type: false,
              message: 'Probe 1 is done',
              probe1: 'Probe 1',
              op: '>',
              temperature: 150,
              lastNotificationSent: new Date('2023-01-01'),
            },
          ],
        }),
      });

      await service.checkForNotification(mockTempDto);

      expect(service.sendPushNotification).toHaveBeenCalledWith(
        'Probe 1 is done',
      );
    });

    it('resolves "Probe 2" and "Probe 3" to their own readings', async () => {
      mockNotificationSettingsModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          settings: [
            {
              type: false,
              message: 'Probe 2 is done',
              probe1: 'Probe 2',
              op: '>',
              temperature: 135,
              lastNotificationSent: new Date('2023-01-01'),
            },
            {
              type: false,
              message: 'Probe 3 is done',
              probe1: 'Probe 3',
              op: '>',
              temperature: 135,
              lastNotificationSent: new Date('2023-01-01'),
            },
          ],
        }),
      });

      // Meat2Temp is 140 (above 135) and Meat3Temp is 130 (below), so only the
      // probe-2 rule may fire: each selector must read its own probe.
      await service.checkForNotification(mockTempDto);

      expect(service.sendPushNotification).toHaveBeenCalledWith(
        'Probe 2 is done',
      );
      expect(service.sendPushNotification).not.toHaveBeenCalledWith(
        'Probe 3 is done',
      );
    });

    it('compares against a probe-2 selector written in the settings-page form', async () => {
      mockNotificationSettingsModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          settings: [
            {
              type: true,
              message: 'Probe 1 is near the chamber',
              probe1: 'Probe 1',
              op: '>',
              probe2: 'Chamber',
              // Meat 160 vs chamber 250 - 100 = 150, so the rule fires only if
              // both selectors resolve to their real readings.
              offset: -100,
              lastNotificationSent: new Date('2023-01-01'),
            },
          ],
        }),
      });

      await service.checkForNotification(mockTempDto);

      expect(service.sendPushNotification).toHaveBeenCalledWith(
        'Probe 1 is near the chamber',
      );
    });

    // A selector nothing maps to used to leave the watched temperature at 0,
    // so a '<' rule compared 0 against its threshold and pushed a false alert
    // every ten minutes for the whole cook. An unresolvable probe skips.
    it('skips a rule whose probe cannot be resolved instead of alerting on a 0 reading', async () => {
      mockNotificationSettingsModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          settings: [
            {
              type: false,
              message: 'ghost probe is cold',
              probe1: 'Probe 9',
              op: '<',
              temperature: 250,
              lastNotificationSent: new Date('2023-01-01'),
            },
          ],
        }),
      });

      await service.checkForNotification(mockTempDto);

      expect(service.sendPushNotification).not.toHaveBeenCalled();
    });

    it('skips a comparison rule whose second probe cannot be resolved', async () => {
      mockNotificationSettingsModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          settings: [
            {
              type: true,
              message: 'compares against nothing',
              probe1: 'Chamber',
              op: '<',
              probe2: 'Probe 9',
              offset: 0,
              lastNotificationSent: new Date('2023-01-01'),
            },
          ],
        }),
      });

      await service.checkForNotification(mockTempDto);

      expect(service.sendPushNotification).not.toHaveBeenCalled();
    });

    it('skips a comparison rule that never got a second probe', async () => {
      mockNotificationSettingsModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          settings: [
            {
              type: true,
              message: 'half-built rule',
              probe1: 'Chamber',
              op: '<',
              probe2: undefined,
              offset: 0,
              lastNotificationSent: new Date('2023-01-01'),
            },
          ],
        }),
      });

      await service.checkForNotification(mockTempDto);

      expect(service.sendPushNotification).not.toHaveBeenCalled();
    });

    it('skips a rule whose probe has no reading yet rather than treating it as 0', async () => {
      mockNotificationSettingsModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          settings: [
            {
              type: false,
              message: 'probe 1 is cold',
              probe1: 'Probe 1',
              op: '<',
              temperature: 250,
              lastNotificationSent: new Date('2023-01-01'),
            },
          ],
        }),
      });

      await service.checkForNotification({ ...mockTempDto, MeatTemp: '' });

      expect(service.sendPushNotification).not.toHaveBeenCalled();
    });

    it('should not trigger notification if recently sent', async () => {
      const recentSettings = {
        settings: [
          {
            ...mockNotificationSettings.settings[0],
            lastNotificationSent: new Date(),
          },
        ],
      };

      mockNotificationSettingsModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(recentSettings),
      });

      const highTempDto = { ...mockTempDto, ChamberTemp: '350' };
      await service.checkForNotification(highTempDto);

      expect(service.sendPushNotification).not.toHaveBeenCalled();
    });

    it('should do nothing when no settings exist', async () => {
      mockNotificationSettingsModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await service.checkForNotification(mockTempDto);

      expect(service.sendPushNotification).not.toHaveBeenCalled();
      expect(service.setSettings).not.toHaveBeenCalled();
    });
  });

  describe('sendPushNotification', () => {
    it('hands the message to the push dispatcher', async () => {
      await service.sendPushNotification('Test notification');

      expect(mockPushDispatcher.notify).toHaveBeenCalledWith(
        'Smoker',
        'Test notification',
      );
    });
  });

  describe('sendTestNotification', () => {
    it('dispatches a test notification to every stored subscription', async () => {
      mockPushDispatcher.notify.mockResolvedValue(3);

      const result = await service.sendTestNotification();

      expect(mockPushDispatcher.notify).toHaveBeenCalledWith(
        'Smoker',
        expect.stringContaining('test'),
      );
      expect(result).toEqual({ sent: 3 });
    });
  });

  describe('getPublicKey', () => {
    it('returns the configured VAPID public key', async () => {
      mockPushDispatcher.getPublicKey.mockReturnValue('configured-key');

      expect(await service.getPublicKey()).toEqual({
        publicKey: 'configured-key',
      });
    });

    it('reports a null key when the deployment has none configured', async () => {
      mockPushDispatcher.getPublicKey.mockReturnValue(null);

      expect(await service.getPublicKey()).toEqual({ publicKey: null });
    });
  });
});
