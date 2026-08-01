import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  NotificationSubscription,
  NotificationSubscriptionDocument,
} from './notificationSubscription.schema';
import { Model } from 'mongoose';
import { NotificationSettings } from './notificationSettings.schema';
import { TempDto } from 'src/temps/tempDto';
import { PushDispatcherService } from '../pushDispatcher/push-dispatcher.service';

const TEN_MINUTES = 10 * 60 * 1000;

const TEST_NOTIFICATION_BODY =
  'This is a test notification from your smoker. If you can read this, push is working.';

/**
 * The one place a rule's probe selector is turned into a reading.
 *
 * A rule stores the selector as a string, and two vocabularies are in the wild:
 * the settings page writes the probe labels ('Probe 1'…'Probe 3'), while rules
 * saved by older builds use the legacy 'Meat1'…'Meat3' form. Both name the same
 * physical probe, so both map to the same field here — a rule built in the UI
 * used to match nothing and never fire.
 */
const PROBE_READINGS: Record<string, (temps: TempDto) => string> = {
  Chamber: (temps) => temps.ChamberTemp,
  'Probe 1': (temps) => temps.MeatTemp,
  Meat1: (temps) => temps.MeatTemp,
  'Probe 2': (temps) => temps.Meat2Temp,
  Meat2: (temps) => temps.Meat2Temp,
  'Probe 3': (temps) => temps.Meat3Temp,
  Meat3: (temps) => temps.Meat3Temp,
};

/**
 * Resolve a probe selector to its current numeric reading, or `null` when the
 * selector names nothing this smoker reports (or the probe has no reading yet).
 * `null` means "skip this rule": treating an unresolvable probe as 0 — which is
 * what the old inline switch did by leaving the watched temperature at its
 * initial value — makes every '<' rule true and pushes a false alert every ten
 * minutes for the whole cook.
 */
const resolveProbeTemp = (
  probe: string | undefined,
  temps: TempDto,
): number | null => {
  const read = probe ? PROBE_READINGS[probe] : undefined;
  if (!read) {
    return null;
  }
  const reading = parseFloat(read(temps));
  return Number.isNaN(reading) ? null : reading;
};

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(NotificationSubscription.name)
    private notificationsModel: Model<NotificationSubscriptionDocument>,
    @InjectModel(NotificationSettings.name)
    private notificationSettingsModel: Model<NotificationSettings>,
    private pushDispatcher: PushDispatcherService,
  ) {}

  /**
   * Register a browser push subscription. Keyed on the endpoint and upserted:
   * a browser that re-subscribes (or whose subscription is rotated by the push
   * service) replaces its stored record instead of receiving a conflict the
   * client can only swallow.
   */
  async setSubscription(
    subscription: NotificationSubscription,
  ): Promise<NotificationSubscription> {
    return this.notificationsModel
      .findOneAndUpdate({ endpoint: subscription.endpoint }, subscription, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      })
      .exec();
  }

  /** The VAPID public key browsers need to subscribe, served at runtime. */
  async getPublicKey(): Promise<{ publicKey: string | null }> {
    return { publicKey: this.pushDispatcher.getPublicKey() };
  }

  /** Send a test notification to every registered browser. */
  async sendTestNotification(): Promise<{ sent: number }> {
    const sent = await this.pushDispatcher.notify(
      'Smoker',
      TEST_NOTIFICATION_BODY,
    );
    return { sent };
  }

  async getSubscriptions(): Promise<NotificationSubscription[]> {
    return this.notificationsModel.find();
  }

  async setSettings(settings: NotificationSettings): Promise<any> {
    const existingSettings = await this.notificationSettingsModel
      .findOne()
      .exec();
    if (existingSettings) {
      Object.assign(existingSettings, settings);
      return existingSettings.save();
    } else {
      const createdSettings = await new this.notificationSettingsModel(
        settings,
      );
      return createdSettings.save();
    }
  }

  async getSettings(): Promise<NotificationSettings> {
    return this.notificationSettingsModel.findOne().exec();
  }

  async checkForNotification(temps: TempDto) {
    const notificationsSettings = await this.notificationSettingsModel
      .findOne()
      .exec();
    if (notificationsSettings) {
      const test = notificationsSettings.settings.map((setting) => {
        const watchTemp = resolveProbeTemp(setting.probe1, temps);
        if (watchTemp === null) {
          // Nothing to compare: leave the rule untouched rather than alerting
          // on a reading this smoker never produced.
          return setting;
        }
        let compareTemp = setting.temperature;
        if (setting.type) {
          const otherTemp = resolveProbeTemp(setting.probe2, temps);
          if (otherTemp === null) {
            return setting;
          }
          compareTemp = otherTemp + setting.offset;
        }
        switch (setting.op) {
          case '>': {
            if (watchTemp > compareTemp) {
              const tenMinutesAgo = new Date(Date.now() - TEN_MINUTES);
              if (setting.lastNotificationSent < tenMinutesAgo) {
                this.sendPushNotification(setting.message);
                setting.lastNotificationSent = new Date();
              }
            }
            break;
          }
          case '<': {
            if (watchTemp < compareTemp) {
              const tenMinutesAgo = new Date(Date.now() - TEN_MINUTES);
              if (setting.lastNotificationSent < tenMinutesAgo) {
                this.sendPushNotification(setting.message);
                setting.lastNotificationSent = new Date();
              }
            }
            break;
          }
        }
        return setting;
      });
      this.setSettings({ settings: test });
    }
  }

  async sendPushNotification(data: string) {
    await this.pushDispatcher.notify('Smoker', data);
  }
}
