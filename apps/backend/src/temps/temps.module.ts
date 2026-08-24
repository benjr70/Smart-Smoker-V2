import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommonModule } from '../common/common.module';
import { SmokeSchema } from '../smoke/smoke.schema';
import { TempsController } from './temps.controller';
import { TempSchema } from './temps.schema';
import { TempsService } from './temps.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Temp', schema: TempSchema },
      // The cook that owns a stored series, so reading the series back can
      // clip it to the window the cook ran in. Its model rather than
      // `SmokeService`: that service depends on this module, so importing it
      // back would close a DI cycle — the same reason `StaleCookModule` reads
      // the cook through its model.
      { name: 'Smoke', schema: SmokeSchema },
    ]),
    CommonModule,
  ],
  controllers: [TempsController],
  providers: [TempsService],
  exports: [TempsService],
})
export class TempModule {}
