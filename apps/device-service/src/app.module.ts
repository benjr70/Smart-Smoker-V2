import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SerialModule } from './serial/serial.module';
import { EventsModule } from './websocket/events.module';
import { WifiManagerModule } from './wifiManager/wifiManager.module';
import { LoggerMiddleware } from './logger.middleware';

@Module({
  imports: [
    SerialModule,
    EventsModule,
    WifiManagerModule],
  controllers: [AppController],
  providers: [AppService],
})

export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .exclude(
        { path: 'api/wifiManager/connection', method: RequestMethod.ALL },
      )
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
