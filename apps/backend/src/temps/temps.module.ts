import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SmokeModule } from 'src/smoke/smoke.module';
import { StateModule } from 'src/State/state.module';
import { TempsController } from './temps.controller';
import { TempSchema } from './temps.schema';
import { TempsService } from './temps.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Temp', schema: TempSchema }]),
    StateModule,
    SmokeModule,
  ],
  controllers: [TempsController],
  providers: [TempsService],
  exports: [TempsService],
})
export class TempModule {}
