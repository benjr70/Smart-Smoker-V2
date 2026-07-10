import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommonModule } from '../common/common.module';
import { TempsController } from './temps.controller';
import { TempSchema } from './temps.schema';
import { TempsService } from './temps.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Temp', schema: TempSchema }]),
    CommonModule,
  ],
  controllers: [TempsController],
  providers: [TempsService],
  exports: [TempsService],
})
export class TempModule {}
