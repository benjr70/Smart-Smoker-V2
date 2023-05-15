import { Module } from '@nestjs/common';
import { SerialService } from './serial.serivce';
import { EventsModule } from 'src/websocket/events.module';


@Module({
    imports: [EventsModule],
    providers: [SerialService],
})
export class SerialModule {}