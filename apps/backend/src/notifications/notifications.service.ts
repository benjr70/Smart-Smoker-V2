import { Injectable } from "@nestjs/common";
import { PushSubscription } from "./notifications.controller"
import { InjectModel } from "@nestjs/mongoose";
import { Notifications, NotificationsDocument } from "./notifications.schema";
import { Model } from "mongoose";


@Injectable()
export class NotificationsService {
    constructor(
        @InjectModel(Notifications.name) private notificationsModel: Model<NotificationsDocument>,
      ) {}


    async setSubscription(subscription: PushSubscription): Promise<Notifications>{
        const existingSubscription = await this.notificationsModel.findOne({ endpoint: subscription.endpoint }).exec();
        if (!existingSubscription) {
          const createdSubscription = new this.notificationsModel(subscription);
          return createdSubscription.save();
        } else {
          throw new Error('Subscription already exists');
        }
    }

    async getSubscriptions(): Promise<Notifications[]> {
        return this.notificationsModel.find();
    }
    
}