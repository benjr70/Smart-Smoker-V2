import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationSubscriptionSchema } from './notificationSubscription.schema';
import { NotificationSettingsSchema } from './notificationSettings.schema';

@Module({
  imports: [MongooseModule.forFeature([
    {name: 'NotificationSubscription', schema: NotificationSubscriptionSchema},
    {name: 'NotificationSettings', schema: NotificationSettingsSchema}
  ])],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}