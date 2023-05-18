import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SerialModule } from './serial/serial.module';
import { EventsModule } from './websocket/events.module';
import { WifiManagerModule } from './wifiManager/wifiManager.module';

@Module({
  imports: [
    SerialModule,
    EventsModule,
    WifiManagerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
