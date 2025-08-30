import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  NotificationSubscription,
  NotificationSubscriptionDocument,
} from './notificationSubscription.schema';
import { Model } from 'mongoose';
import { NotificationSettings } from './notificationSettings.schema';
import { TempDto } from 'src/temps/tempDto';
import * as webpush from 'web-push';

const TEN_MINUTES = 10 * 60 * 1000;

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(NotificationSubscription.name)
    private notificationsModel: Model<NotificationSubscriptionDocument>,
    @InjectModel(NotificationSettings.name)
    private notificationSettingsModel: Model<NotificationSettings>,
  ) {
    webpush.setVapidDetails(
      'mailto:benrolf70@gmail.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
  }

  async setSubscription(
    subscription: NotificationSubscription,
  ): Promise<NotificationSubscription> {
    const existingSubscription = await this.notificationsModel
      .findOne({ endpoint: subscription.endpoint })
      .exec();
    if (!existingSubscription) {
      const createdSubscription = new this.notificationsModel(subscription);
      return createdSubscription.save();
    } else {
      throw new Error('Subscription already exists');
    }
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
    const payload = JSON.stringify({
      title: 'Smoker',
      body: data,
      icon: '/path/to/icon.png',
    });
    this.getSubscriptions().then((subscriptions) => {
      subscriptions.forEach((subscription) => {
        webpush
          .sendNotification(subscription, payload)
          .catch((error) => {
            Logger.error(
              `Status code: ${error.statusCode}`,
              'NotificationsService',
            );
            Logger.error(`Body: ${error.body}`, 'NotificationsService');
            Logger.error(error.stack, 'NotificationsService');
          })
          .then(() => {
            Logger.log(`Notification Sent: ${data}`, 'NotificationsService');
          });
      });
    });
  }
}
