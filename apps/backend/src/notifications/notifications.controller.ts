import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { NotificationSubscription } from './notificationSubscription.schema';
import { NotificationSettings } from './notificationSettings.schema';
import { NotificationSubscriptionDto } from './notificationSubscriptionDto';
import { NotificationSettingsDto } from './notificationSettingsDto';

@ApiTags('Notifications')
@Controller('api/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * The VAPID public key, served at runtime so one frontend image works in dev,
   * production and the hermetic e2e stack (each of which has its own key pair).
   * `publicKey` is null when the deployment has no key configured.
   */
  @Get('/publicKey')
  getPublicKey(): Promise<{ publicKey: string | null }> {
    return this.notificationsService.getPublicKey();
  }

  @Post('/subscribe')
  setSubscription(
    @Body() subscription: NotificationSubscriptionDto,
  ): Promise<NotificationSubscription> {
    return this.notificationsService.setSubscription(subscription);
  }

  /** Send a test notification to every registered browser. */
  @Post('/test')
  sendTestNotification(): Promise<{ sent: number }> {
    return this.notificationsService.sendTestNotification();
  }

  @Post('/settings')
  setSettings(
    @Body() settings: NotificationSettingsDto,
  ): Promise<NotificationSettings> {
    // The DTO carries client-typed fields (e.g. lastNotificationSent as an ISO
    // string); Mongoose coerces them on save, so hand the validated body to the
    // schema-typed service unchanged.
    return this.notificationsService.setSettings(
      settings as unknown as NotificationSettings,
    );
  }

  @Get('/settings')
  getSettings(): Promise<NotificationSettings> {
    return this.notificationsService.getSettings();
  }
}
