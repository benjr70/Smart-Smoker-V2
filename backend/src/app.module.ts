import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PreSmokeModule } from './presmoke/presmoke.module';
import { SettingsModule } from './settings/settings.module';
import { SmokeModule } from './smoke/smoke.module';
import { StateModule } from './State/state.module';


@Module({
  imports: [SettingsModule,
    PreSmokeModule,
    StateModule,
    SmokeModule,
  MongooseModule.forRoot('mongodb://127.0.0.1:27017/SmokerDB')],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
