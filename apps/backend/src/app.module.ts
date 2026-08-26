import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { AppSettingsModule } from './appSettings/app-settings.module';
import { PostSmokeModule } from './postSmoke/postSmoke.module';
import { PreSmokeModule } from './presmoke/presmoke.module';
import { SettingsModule } from './settings/settings.module';
import { SmokeModule } from './smoke/smoke.module';
import { SmokeProfileModule } from './smokeProfile/smokeProfile.module';
import { StaleCookModule } from './staleCook/stale-cook.module';
import { StaleCookMiddleware } from './staleCook/stale-cook.middleware';
import { StateModule } from './State/state.module';
import { CookEventsModule } from './cookEvents/cook-events.module';
import { TempModule } from './temps/temps.module';
import { TimelineModule } from './timeline/timeline.module';
import { EventsModule } from './websocket/events.module';
import { ConfigModule } from '@nestjs/config';
import { RatingsModel } from './ratings/ratings.module';
import { HistoryModule } from './history/history.module';
import { StatsModule } from './stats/stats.module';
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
    AppSettingsModule,
    PreSmokeModule,
    StateModule,
    SmokeModule,
    EventsModule,
    TempModule,
    CookEventsModule,
    SmokeProfileModule,
    PostSmokeModule,
    RatingsModel,
    HistoryModule,
    StatsModule,
    TimelineModule,
    StaleCookModule,
    NotificationsModule,
    HealthModule,
    ConfigModule.forRoot({
      envFilePath: !ENV ? '.env' : `.env.${ENV}`,
    }),
    MongooseModule.forRoot(process.env.DB_URL),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global error → HTTP mapping (HttpException passthrough,
    // CastError/ValidationError → 400, E11000 → 409, else 500).
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
    // The lazy auto-stop trigger: a cook nobody ended is ended before the
    // timeline that would still call it running is derived. Bound here rather
    // than called from the timeline itself — see `StaleCookMiddleware`.
    consumer
      .apply(StaleCookMiddleware)
      .forRoutes({ path: 'api/timeline/current', method: RequestMethod.GET });
  }
}
