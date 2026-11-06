import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommonModule } from '../common/common.module';
import { SmokeSchema } from '../smoke/smoke.schema';
import { StatsModule } from '../stats/stats.module';
import { TempSeriesBackfillService } from './temp-series-backfill.service';
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
    // Repairing a cook's series changes what the statistics were derived from,
    // so the boot repair declares them stale. Imported plainly rather than
    // forward-referenced: this module is not in its dependency chain — the
    // statistics own their collections directly and reach no feature module
    // but the timeline's, which owns its own.
    StatsModule,
  ],
  controllers: [TempsController],
  // The backfill is a provider nobody injects: it runs once at boot, repairing
  // the first readings this module's own write used to orphan, and is reached
  // only through the module lifecycle. See `TempSeriesBackfillService`.
  providers: [TempsService, TempSeriesBackfillService],
  exports: [TempsService],
})
export class TempModule {}
