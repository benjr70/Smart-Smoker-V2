import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { SerialModule } from '../serial/serial.module';

@Module({
  imports: [SerialModule],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}