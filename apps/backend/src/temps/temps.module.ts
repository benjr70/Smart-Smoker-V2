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
    // The walk from the Active Cook to one of its child records, which is how
    // a relayed reading finds the series it belongs to. A plain reference: this
    // module used to sit inside a loop of module files — the session imported
    // the gateway, the gateway this module, and the current-cook walk the
    // session back — and the edge had to be a thunk so Nest read it after every
    // file had finished evaluating. The walk starts from the Active Cook now,
    // which imports nothing, so the loop is gone.
    CommonModule,
  ],
  controllers: [TempsController],
  providers: [TempsService],
  exports: [TempsService],
})
export class TempModule {}
