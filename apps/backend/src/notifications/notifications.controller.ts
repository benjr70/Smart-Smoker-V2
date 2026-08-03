import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { NotificationSubscription } from './notificationSubscription.schema';
import { NotificationSubscriptionDto } from './notificationSubscriptionDto';

/**
 * Push plumbing: the key browsers subscribe with, the subscriptions themselves
 * and a test send.
 *
 * The alert settings are not here. They are one block of the installation's
 * settings document, served by the application settings route alongside the
 * appearance every client renders in.
 */
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
}
