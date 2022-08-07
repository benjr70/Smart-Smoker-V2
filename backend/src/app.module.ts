import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PreSmokeModule } from './presmoke/presmoke.module';
import { SettingsModule } from './settings/settings.module';
import { SmokeModule } from './smoke/smoke.module';
import { StateModule } from './State/state.module';
import { EventsModule } from './websocket/events.module';


// just comment the other line when running local

@Module({
  imports: [SettingsModule,
    PreSmokeModule,
    StateModule,
    SmokeModule,
    EventsModule,
  MongooseModule.forRoot('mongodb://mongo:27017')],
  //MongooseModule.forRoot('mongodb://127.0.0.1:27017/SmokerDB')],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
