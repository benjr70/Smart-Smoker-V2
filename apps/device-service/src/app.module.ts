import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SerialModule } from './serial/serial.module';
import { EventsModule } from './websocket/events.module';

@Module({
  imports: [
    SerialModule,
    EventsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
