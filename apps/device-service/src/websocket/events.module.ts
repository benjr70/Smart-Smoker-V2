import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { SerialModule } from 'src/serial/serial.module';

@Module({
  imports: [SerialModule],
  providers: [EventsGateway],
})
export class EventsModule {}