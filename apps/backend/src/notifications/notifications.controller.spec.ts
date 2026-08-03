import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationSubscription } from './notificationSubscription.schema';

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

  const mockNotificationsService = {
    setSubscription: jest.fn(),
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

  /**
   * The alert settings moved to the application settings route when the
   * document they live on grew a block that has nothing to do with
   * notifications. This controller is push plumbing only.
   */
  it('does not serve settings', () => {
    expect(controller as unknown as Record<string, unknown>).not.toHaveProperty(
      'getSettings',
    );
    expect(controller as unknown as Record<string, unknown>).not.toHaveProperty(
      'setSettings',
    );
  });
});
