import { Module } from '@nestjs/common';
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
import { ConfigModule } from '@nestjs/config'
import { RatingsModel } from './ratings/ratings.module';
import { HistoryModule } from './history/history.module';

const ENV = process.env.NODE_ENV.trim();
@Module({
  imports: [SettingsModule,
    PreSmokeModule,
    StateModule,
    SmokeModule,
    EventsModule,
    TempModule,
    SmokeProfileModule,
    PostSmokeModule,
    RatingsModel,
    HistoryModule,
    ConfigModule.forRoot({
      envFilePath: !ENV ? '.env' : `.env.${ENV}`,
    }),
    MongooseModule.forRoot(process.env.DB_URL)],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
