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
        let watchTemp = 0;
        let compareTemp = setting.temperature;
        switch (setting.probe1) {
          case 'Chamber': {
            watchTemp = parseFloat(temps.ChamberTemp);
            break;
          }
          case 'Meat1': {
            watchTemp = parseFloat(temps.MeatTemp);
            break;
          }
          case 'Meat2': {
            watchTemp = parseFloat(temps.Meat2Temp);
            break;
          }
          case 'Meat3': {
            watchTemp = parseFloat(temps.Meat3Temp);
            break;
          }
        }
        if (setting.type) {
          switch (setting.probe2) {
            case 'Chamber': {
              compareTemp = parseFloat(temps.ChamberTemp) + setting.offset;
              break;
            }
            case 'Meat1': {
              compareTemp = parseFloat(temps.MeatTemp) + setting.offset;
              break;
            }
            case 'Meat2': {
              compareTemp = parseFloat(temps.Meat2Temp) + setting.offset;
              break;
            }
            case 'Meat3': {
              compareTemp = parseFloat(temps.Meat3Temp) + setting.offset;
              break;
            }
          }
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
