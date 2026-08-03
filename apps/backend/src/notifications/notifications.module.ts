import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StateModule } from '../State/state.module';
import { AppSettingsModule } from '../appSettings/app-settings.module';
import { PushDispatcherModule } from '../pushDispatcher/push-dispatcher.module';
import { TempModule } from '../temps/temps.module';
import { AlertStateSchema } from './alert-state.schema';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationSubscriptionSchema } from './notificationSubscription.schema';

@Module({
  imports: [
    AppSettingsModule,
    PushDispatcherModule,
    StateModule,
    TempModule,
    MongooseModule.forFeature([
      {
        name: 'NotificationSubscription',
        schema: NotificationSubscriptionSchema,
      },
      { name: 'AlertState', schema: AlertStateSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
