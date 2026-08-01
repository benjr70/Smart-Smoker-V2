import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as webpush from 'web-push';
import {
  NotificationSubscription,
  NotificationSubscriptionDocument,
} from '../notifications/notificationSubscription.schema';

/**
 * The frontend's real icon asset, served from the frontend's `public/` folder.
 * The previous payload pointed at `/path/to/icon.png`, which does not exist, so
 * every delivered notification fell back to a browser default glyph.
 */
const APP_ICON = '/logo192.png';

/**
 * The single definition of "push is configured": both halves of the VAPID pair
 * present. Read from the environment at call time and shared by the constructor
 * (which initialises web-push) and {@link PushDispatcherService.getPublicKey}
 * (which hands the key to browsers), so the two can never disagree.
 */
const readVapidKeys = (): { publicKey: string; privateKey: string } | null => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  return publicKey && privateKey ? { publicKey, privateKey } : null;
};

/**
 * The one place in the backend that talks to the web-push library.
 *
 * Owns the send fan-out over the stored subscriptions and the prune of
 * endpoints the push service reports as permanently gone (404/410), so the
 * notifications service can produce alert text without knowing how a push is
 * delivered.
 */
@Injectable()
export class PushDispatcherService {
  constructor(
    @InjectModel(NotificationSubscription.name)
    private subscriptionModel: Model<NotificationSubscriptionDocument>,
  ) {
    const vapid = readVapidKeys();
    if (vapid) {
      webpush.setVapidDetails(
        'mailto:benrolf70@gmail.com',
        vapid.publicKey,
        vapid.privateKey,
      );
    }
  }

  /**
   * The VAPID public key browsers must subscribe with, read from the backend
   * environment at call time. `null` means the deployment has no *usable* key
   * configured — callers surface that rather than handing `undefined` to
   * `PushManager`.
   *
   * "Configured" is deliberately the same condition the constructor uses (see
   * {@link readVapidKeys}): a deployment with only the public key wired can
   * never sign a push, so handing the key out would let a browser subscribe
   * against a key the server cannot use and turn every later send into a
   * server-log-only failure.
   */
  getPublicKey(): string | null {
    return readVapidKeys()?.publicKey ?? null;
  }

  /**
   * Deliver a notification to every registered browser and resolve how many
   * were delivered. Every subscription is attempted even if an earlier one
   * fails, and a subscription the push service reports as permanently gone is
   * removed rather than retried forever.
   */
  async notify(title: string, body: string): Promise<number> {
    const payload = JSON.stringify({ title, body, icon: APP_ICON });
    const subscriptions = await this.subscriptionModel.find();
    const results = await Promise.all(
      subscriptions.map((subscription) =>
        webpush
          .sendNotification(subscription, payload)
          .then(() => true)
          .catch(async (error) => {
            await this.handleSendFailure(subscription, error);
            return false;
          }),
      ),
    );
    const delivered = results.filter(Boolean).length;
    Logger.log(
      `Notification dispatched to ${delivered}/${subscriptions.length} subscriptions: ${body}`,
      'PushDispatcherService',
    );
    return delivered;
  }

  private async handleSendFailure(
    subscription: NotificationSubscription,
    error: { statusCode?: number },
  ): Promise<void> {
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      await this.subscriptionModel
        .deleteOne({ endpoint: subscription.endpoint })
        .exec();
      return;
    }
    Logger.error(
      `Push send failed (status ${error?.statusCode}) for ${subscription.endpoint}`,
      'PushDispatcherService',
    );
  }
}
