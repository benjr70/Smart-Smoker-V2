import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { NotificationSubscription, NotificationSubscriptionDocument } from "./notificationSubscription.schema";
import { Model } from "mongoose";
import { NotificationSettings } from "./notificationSettings.schema";


@Injectable()
export class NotificationsService {
    constructor(
        @InjectModel(NotificationSubscription.name) private notificationsModel: Model<NotificationSubscriptionDocument>,
        @InjectModel(NotificationSettings.name) private notificationSettingsModel: Model<NotificationSettings>
      ) {}


    async setSubscription(subscription: NotificationSubscription): Promise<NotificationSubscription>{
        const existingSubscription = await this.notificationsModel.findOne({ endpoint: subscription.endpoint }).exec();
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

    async setSettings(settings: NotificationSettings): Promise<any>{
      const existingSettings = await this.notificationSettingsModel.findOne().exec();
      if (existingSettings) {
        Object.assign(existingSettings, settings);
        return existingSettings.save();
      } else {
        const createdSettings = await new this.notificationSettingsModel(settings);
        return createdSettings.save();
      }
    }
    
    async getSettings(): Promise<NotificationSettings>{
      return this.notificationSettingsModel.findOne().exec();
    }
}