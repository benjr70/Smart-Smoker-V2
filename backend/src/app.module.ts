import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PreSmokeModule } from './presmoke/presmoke.module';
import { SettingsModule } from './settings/settings.module';
import { StateModule } from './State/state.module';


@Module({
  imports: [SettingsModule,
    PreSmokeModule,
    StateModule,
  MongooseModule.forRoot('mongodb://127.0.0.1:27017/SmokerDB')],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
