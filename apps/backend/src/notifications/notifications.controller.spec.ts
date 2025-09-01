import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationSubscription } from './notificationSubscription.schema';
import { NotificationSettings } from './notificationSettings.schema';

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
    ],
  };

  const mockNotificationsService = {
    setSubscription: jest.fn(),
    setSettings: jest.fn(),
    getSettings: jest.fn(),
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

      const result = await controller.setSettings(mockNotificationSettings);

      expect(service.setSettings).toHaveBeenCalledWith(
        mockNotificationSettings,
      );
      expect(result).toEqual(mockNotificationSettings);
    });

    it('should handle service errors', async () => {
      const error = new Error('Database error');
      mockNotificationsService.setSettings.mockRejectedValue(error);

      await expect(
        controller.setSettings(mockNotificationSettings),
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

    it('should return null when no settings exist', async () => {
      mockNotificationsService.getSettings.mockResolvedValue(null);

      const result = await controller.getSettings();

      expect(service.getSettings).toHaveBeenCalled();
      expect(result).toBeNull();
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
