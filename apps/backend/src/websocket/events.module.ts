import { Module } from '@nestjs/common';
import { StateModule } from 'src/State/state.module';
import { TempModule } from 'src/temps/temps.module';
import { EventsGateway } from './events.gateway';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [ StateModule, TempModule, NotificationsModule],
  providers: [EventsGateway],
})
export class EventsModule {}