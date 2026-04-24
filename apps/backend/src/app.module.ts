import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PostSmokeModule } from './postSmoke/postSmoke.module';
import { PreSmokeModule } from './presmoke/presmoke.module';
import { SettingsModule } from './settings/settings.module';
import { SmokeModule } from './smoke/smoke.module';
import { SmokeProfileModule } from './smokeProfile/smokeProfile.module';
import { StateModule } from './State/state.module';
import { TempModule } from './temps/temps.module';
import { EventsModule } from './websocket/events.module';
import { ConfigModule } from '@nestjs/config';
import { RatingsModel } from './ratings/ratings.module';
import { HistoryModule } from './history/history.module';
import { LoggerMiddleware } from './logger.middleware';
import { NotificationsModule } from './notifications/notifications.module';
import { HealthModule } from './health/health.module';
import { LoggerModule } from 'nestjs-pino';

const ENV = process.env.NODE_ENV;
console.log(process.env.NODE_ENV);
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
    SettingsModule,
    PreSmokeModule,
    StateModule,
    SmokeModule,
    EventsModule,
    TempModule,
    SmokeProfileModule,
    PostSmokeModule,
    RatingsModel,
    HistoryModule,
    NotificationsModule,
    HealthModule,
    ConfigModule.forRoot({
      envFilePath: !ENV ? '.env' : `.env.${ENV}`,
    }),
    MongooseModule.forRoot(process.env.DB_URL),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
