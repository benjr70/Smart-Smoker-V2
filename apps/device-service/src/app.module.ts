import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { SerialModule } from './serial/serial.module';
import { EventsModule } from './websocket/events.module';
import { WifiManagerModule } from './wifiManager/wifiManager.module';
import { LoggerMiddleware } from './logger.middleware';
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        autoLogging: true,
        ...(process.env.NODE_ENV === 'local' && {
          transport: { target: 'pino-pretty', options: { colorize: true } },
        }),
      },
    }),
    SerialModule,
    EventsModule,
    WifiManagerModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .exclude({
        path: 'api/wifiManager/connection',
        method: RequestMethod.ALL,
      })
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
