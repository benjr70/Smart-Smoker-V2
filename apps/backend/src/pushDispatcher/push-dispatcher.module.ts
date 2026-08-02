import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationSubscriptionSchema } from '../notifications/notificationSubscription.schema';
import { PushDispatcherService } from './push-dispatcher.service';

/**
 * Push delivery boundary. Registers the subscription collection because the
 * dispatcher must be able to prune endpoints the push service reports as gone;
 * the notifications module registers the same collection for its own
 * registration/read operations.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: 'NotificationSubscription',
        schema: NotificationSubscriptionSchema,
      },
    ]),
  ],
  providers: [PushDispatcherService],
  exports: [PushDispatcherService],
})
export class PushDispatcherModule {}
