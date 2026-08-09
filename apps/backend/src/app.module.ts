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

/**
 * The connection string is required, not optional. Passing an unset `DB_URL`
 * straight through reached Mongoose as `undefined` and failed deep inside
 * `openUri()`; failing here names the missing variable instead.
 *
 * Read on call, never at module load: `ConfigModule.forRoot()` is what copies
 * `.env` into `process.env`, and it only runs once evaluation reaches its
 * entry in the `imports` array just below this one.
 */
const requireDbUrl = (): string => {
  const dbUrl = process.env.DB_URL;
  if (!dbUrl) {
    throw new Error(
      'DB_URL is not set: the backend needs a MongoDB connection string to start',
    );
  }
  return dbUrl;
};
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
    SmokeProfileModule,
    PostSmokeModule,
    RatingsModel,
    HistoryModule,
    NotificationsModule,
    HealthModule,
    ConfigModule.forRoot({
      envFilePath: !ENV ? '.env' : `.env.${ENV}`,
    }),
    MongooseModule.forRoot(requireDbUrl()),
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
  }
}
