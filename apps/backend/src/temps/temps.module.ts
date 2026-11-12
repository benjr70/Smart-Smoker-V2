import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActiveCookModule } from '../activeCook/active-cook.module';
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
      // `SmokeService`: all this needs is two dates off one cook, and that
      // service brings the whole deep-delete cascade — every child collection,
      // the statistics, the cook log — in behind it for them.
      { name: 'Smoke', schema: SmokeSchema },
    ]),
    // Which cook a reading belongs to, and the attach that links the series it
    // records into. A plain reference, and the only service edge out of here
    // that reaches the cook at all: the Active Cook imports no feature module,
    // so nothing it is asked from can be in a loop with it.
    ActiveCookModule,
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
