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
    // The validated body is exactly the settings document — it carries only
    // user-owned fields, so it goes to the schema-typed service unchanged.
    return this.notificationsService.setSettings(
      settings as unknown as NotificationSettings,
    );
  }

  /**
   * The current settings, always a complete document: a deployment that has
   * never saved (or that still holds the deleted rule shape, which is not
   * migrated) reads as defaults rather than as an error.
   */
  @Get('/settings')
  getSettings(): Promise<NotificationSettings> {
    return this.notificationsService.getSettings();
  }
}
