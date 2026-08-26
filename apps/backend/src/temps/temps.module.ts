import { Module, forwardRef } from '@nestjs/common';
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
    // Forward-referenced because this module now sits inside a loop of module
    // files: the session imports the gateway (to announce an emptied cook log),
    // the gateway imports this module (to store a relayed reading), and the
    // current-cook walk this module needs imports the session back. Whichever
    // file of that loop happens to evaluate first, one of the others is
    // still half-evaluated when its `imports` array is captured, and the class
    // reads as `undefined`. A thunk is not read until Nest scans, by which time
    // every file has finished. The other edges of the same loop are marked the
    // same way; see `CommonModule` and `EventsModule`.
    forwardRef(() => CommonModule),
  ],
  controllers: [TempsController],
  providers: [TempsService],
  exports: [TempsService],
})
export class TempModule {}
