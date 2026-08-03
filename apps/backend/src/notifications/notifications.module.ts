import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SmokeProfileModule } from '../smokeProfile/smokeProfile.module';
import { StateModule } from '../State/state.module';
import { AppSettingsModule } from '../appSettings/app-settings.module';
import { PreSmokeModule } from '../presmoke/presmoke.module';
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
    // Alerts name probes as the active cook named them, which is the smoke
    // profile's to answer. No cycle: nothing in the profile's own dependency
    // chain (smoke, ratings, common, state) knows about notifications.
    SmokeProfileModule,
    // A session start seeds the probe targets from the meat type the cook typed
    // into pre-smoke, which is the only place the application is told what is on
    // the smoker. No cycle here either: pre-smoke depends on state and smoke.
    PreSmokeModule,
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
