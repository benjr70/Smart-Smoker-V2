import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationSubscription } from './notificationSubscription.schema';
import { NotificationSettings } from './notificationSettings.schema';
import { NotificationSettingsDto } from './notificationSettingsDto';
import { DEFAULT_NOTIFICATION_SETTINGS } from './notification-settings.defaults';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: NotificationsService;

  const mockSubscription: NotificationSubscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
    expirationTime: null,
    keys: {
      p256dh: 'test-p256dh-key',
      auth: 'test-auth-key',
    },
  };

  const mockNotificationSettings: NotificationSettings = {
    chamber: { enabled: true, low: 225, high: 275 },
  };

  const mockNotificationsService = {
    setSubscription: jest.fn(),
    setSettings: jest.fn(),
    getSettings: jest.fn(),
    getPublicKey: jest.fn(),
    sendTestNotification: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
    service = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPublicKey', () => {
    it('serves the configured VAPID public key', async () => {
      mockNotificationsService.getPublicKey.mockResolvedValue({
        publicKey: 'BConfiguredKey',
      });

      expect(await controller.getPublicKey()).toEqual({
        publicKey: 'BConfiguredKey',
      });
    });

    it('reports a null key rather than failing when none is configured', async () => {
      mockNotificationsService.getPublicKey.mockResolvedValue({
        publicKey: null,
      });

      expect(await controller.getPublicKey()).toEqual({ publicKey: null });
    });
  });

  describe('sendTestNotification', () => {
    it('dispatches a test notification and reports how many were sent', async () => {
      mockNotificationsService.sendTestNotification.mockResolvedValue({
        sent: 2,
      });

      const result = await controller.sendTestNotification();

      expect(service.sendTestNotification).toHaveBeenCalled();
      expect(result).toEqual({ sent: 2 });
    });
  });

  describe('setSubscription', () => {
    it('should call service setSubscription method', async () => {
      mockNotificationsService.setSubscription.mockResolvedValue(
        mockSubscription,
      );

      const result = await controller.setSubscription(mockSubscription);

      expect(service.setSubscription).toHaveBeenCalledWith(mockSubscription);
      expect(result).toEqual(mockSubscription);
    });

    it('should handle service errors', async () => {
      const error = new Error('Subscription already exists');
      mockNotificationsService.setSubscription.mockRejectedValue(error);

      await expect(
        controller.setSubscription(mockSubscription),
      ).rejects.toThrow('Subscription already exists');
    });
  });

  describe('setSettings', () => {
    it('should call service setSettings method', async () => {
      mockNotificationsService.setSettings.mockResolvedValue(
        mockNotificationSettings,
      );

      const result = await controller.setSettings(
        mockNotificationSettings as unknown as NotificationSettingsDto,
      );

      expect(service.setSettings).toHaveBeenCalledWith(
        mockNotificationSettings,
      );
      expect(result).toEqual(mockNotificationSettings);
    });

    it('should handle service errors', async () => {
      const error = new Error('Database error');
      mockNotificationsService.setSettings.mockRejectedValue(error);

      await expect(
        controller.setSettings(
          mockNotificationSettings as unknown as NotificationSettingsDto,
        ),
      ).rejects.toThrow('Database error');
    });
  });

  describe('getSettings', () => {
    it('should call service getSettings method', async () => {
      mockNotificationsService.getSettings.mockResolvedValue(
        mockNotificationSettings,
      );

      const result = await controller.getSettings();

      expect(service.getSettings).toHaveBeenCalled();
      expect(result).toEqual(mockNotificationSettings);
    });

    // Nothing saved yet (or a document of the deleted rule shape, which is not
    // migrated) must still render the settings page, so the endpoint answers
    // with defaults rather than with an empty body the client has to guess at.
    it('serves defaults when nothing has ever been saved', async () => {
      mockNotificationsService.getSettings.mockResolvedValue(
        DEFAULT_NOTIFICATION_SETTINGS,
      );

      expect(await controller.getSettings()).toEqual(
        DEFAULT_NOTIFICATION_SETTINGS,
      );
    });

    it('should handle service errors', async () => {
      const error = new Error('Database connection failed');
      mockNotificationsService.getSettings.mockRejectedValue(error);

      await expect(controller.getSettings()).rejects.toThrow(
        'Database connection failed',
      );
    });
  });
});
