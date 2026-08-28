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
 * The contact a push service uses to reach whoever operates this deployment
 * about a misbehaving sender. Deployment-specific, so it is read from the
 * environment (`VAPID_CONTACT`); the fallback is a neutral placeholder rather
 * than any individual's address, so a self-hosted install never advertises the
 * upstream maintainer.
 */
const FALLBACK_VAPID_CONTACT = 'mailto:smart-smoker@example.com';

const readVapidContact = (): string =>
  process.env.VAPID_CONTACT || FALLBACK_VAPID_CONTACT;

/**
 * Hand the VAPID pair to web-push and report whether the deployment ended up
 * able to sign a push.
 *
 * web-push validates the subject and the keys itself and *throws* on anything
 * it does not like (an operator writing `VAPID_CONTACT=ops@example.org` without
 * the `mailto:` scheme, a truncated key). This runs during Nest's DI, so an
 * unguarded throw takes the whole backend down in a boot crash-loop. Push is an
 * optional feature here — the unset-key path already degrades quietly — so bad
 * operator input degrades the same way: a malformed contact falls back to the
 * neutral one (the keys are still usable, so push keeps working), and details
 * web-push rejects outright leave push switched off with the reason logged.
 */
const initialiseWebPush = (): boolean => {
  const vapid = readVapidKeys();
  if (!vapid) {
    return false;
  }
  const contact = readVapidContact();
  const candidates =
    contact === FALLBACK_VAPID_CONTACT
      ? [contact]
      : [contact, FALLBACK_VAPID_CONTACT];
  for (const candidate of candidates) {
    try {
      webpush.setVapidDetails(candidate, vapid.publicKey, vapid.privateKey);
      return true;
    } catch (error) {
      Logger.error(
        `web-push rejected the VAPID details for contact "${candidate}": ${
          (error as Error)?.message ?? error
        }`,
        'PushDispatcherService',
      );
    }
  }
  return false;
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
  /**
   * Whether web-push accepted this deployment's VAPID details at boot. Gates
   * {@link PushDispatcherService.getPublicKey} so a deployment whose details
   * web-push rejected reports "no key" instead of handing browsers a key the
   * server can never sign with.
   */
  private readonly vapidInitialised: boolean;

  constructor(
    @InjectModel(NotificationSubscription.name)
    private subscriptionModel: Model<NotificationSubscriptionDocument>,
  ) {
    this.vapidInitialised = initialiseWebPush();
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
    if (!this.vapidInitialised) {
      return null;
    }
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
