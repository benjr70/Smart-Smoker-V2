import { Module } from '@nestjs/common';
import { StateModule } from 'src/State/state.module';
import { TempModule } from 'src/temps/temps.module';
import { EventsGateway } from './events.gateway';

@Module({
  imports: [ StateModule, TempModule],
  providers: [EventsGateway],
})
export class EventsModule {}