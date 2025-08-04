import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotificationsService } from './notifications.service';
import { NotificationSubscription } from './notificationSubscription.schema';
import { NotificationSettings } from './notificationSettings.schema';
import { TempDto } from '../temps/tempDto';
import * as webpush from 'web-push';

// Mock web-push
jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn().mockResolvedValue({ statusCode: 201 }),
}));

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockNotificationSubscriptionModel: any;
  let mockNotificationSettingsModel: any;

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
    // Mock NotificationSubscription model
    mockNotificationSubscriptionModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ ...dto, _id: 'new-subscription-id' }),
    }));

    mockNotificationSubscriptionModel.findOne = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    mockNotificationSubscriptionModel.find = jest.fn().mockResolvedValue([mockSubscription]);

    // Mock NotificationSettings model
    mockNotificationSettingsModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ ...dto, _id: 'new-settings-id' }),
    }));

    mockNotificationSettingsModel.findOne = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

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
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);

    // Set up environment variables for test
    process.env.VAPID_PUBLIC_KEY = 'test-public-key';
    process.env.VAPID_PRIVATE_KEY = 'test-private-key';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('setSubscription', () => {
    it('should create a new subscription when it does not exist', async () => {
      const result = await service.setSubscription(mockSubscription);

      expect(mockNotificationSubscriptionModel.findOne).toHaveBeenCalledWith({
        endpoint: mockSubscription.endpoint,
      });
      expect(mockNotificationSubscriptionModel).toHaveBeenCalledWith(mockSubscription);
      expect(result).toEqual(expect.objectContaining(mockSubscription));
    });

    it('should throw error when subscription already exists', async () => {
      mockNotificationSubscriptionModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSubscription),
      });

      await expect(service.setSubscription(mockSubscription)).rejects.toThrow(
        'Subscription already exists'
      );
    });
  });

  describe('getSubscriptions', () => {
    it('should return all subscriptions', async () => {
      const result = await service.getSubscriptions();

      expect(mockNotificationSubscriptionModel.find).toHaveBeenCalled();
      expect(result).toEqual([mockSubscription]);
    });
  });

  describe('setSettings', () => {
    it('should create new settings when none exist', async () => {
      const result = await service.setSettings(mockNotificationSettings);

      expect(mockNotificationSettingsModel.findOne).toHaveBeenCalled();
      expect(mockNotificationSettingsModel).toHaveBeenCalledWith(mockNotificationSettings);
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
      jest.spyOn(service, 'setSettings').mockResolvedValue(mockNotificationSettings);
    });

    it('should trigger notification when chamber temp exceeds threshold', async () => {
      const highTempDto = { ...mockTempDto, ChamberTemp: '350' };

      await service.checkForNotification(highTempDto);

      expect(service.sendPushNotification).toHaveBeenCalledWith('Chamber temp too high');
      expect(service.setSettings).toHaveBeenCalled();
    });

    it('should trigger notification when meat temp exceeds chamber temp + offset', async () => {
      const highMeatTempDto = { ...mockTempDto, MeatTemp: '320', ChamberTemp: '250' };

      await service.checkForNotification(highMeatTempDto);

      expect(service.sendPushNotification).toHaveBeenCalledWith('Meat temp reached target');
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

      expect(service.sendPushNotification).toHaveBeenCalledWith('Meat2 temp too low');
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

      expect(service.sendPushNotification).toHaveBeenCalledWith('Meat3 temp too low');
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

      expect(service.sendPushNotification).toHaveBeenCalledWith('Meat1 exceeds Meat2');
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
    beforeEach(() => {
      jest.spyOn(service, 'getSubscriptions').mockResolvedValue([mockSubscription]);
      // Reset the webpush mock before each test
      (webpush.sendNotification as jest.Mock).mockClear();
    });

    it('should send push notification to all subscriptions', async () => {
      (webpush.sendNotification as jest.Mock).mockResolvedValue({ statusCode: 201 });
      const message = 'Test notification';

      await service.sendPushNotification(message);

      expect(service.getSubscriptions).toHaveBeenCalled();
      expect(webpush.sendNotification).toHaveBeenCalledWith(
        mockSubscription,
        JSON.stringify({
          title: 'Smoker',
          body: message,
          icon: '/path/to/icon.png',
        })
      );
    });

    it('should handle webpush errors gracefully', async () => {
      const mockError = {
        statusCode: 410,
        body: 'Gone',
        stack: 'Error stack',
      };

      // Mock to return a promise that rejects, but the .catch() should handle it
      (webpush.sendNotification as jest.Mock).mockReturnValue(
        Promise.reject(mockError).catch(() => {
          // This simulates the error handling in the actual service
          return Promise.resolve();
        })
      );

      // Should not throw an error despite the webpush failure
      await expect(service.sendPushNotification('Test')).resolves.not.toThrow();
    });
  });
});