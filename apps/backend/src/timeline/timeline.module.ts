import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ApplicationSettings,
  ApplicationSettingsSchema,
} from '../appSettings/app-settings.schema';
import { CookEventSchema } from '../cookEvents/cook-events.schema';
import { PreSmoke, PreSmokeSchema } from '../presmoke/presmoke.schema';
import { ActiveCookModule } from '../activeCook/active-cook.module';
import { SmokeSchema } from '../smoke/smoke.schema';
import { TempSchema } from '../temps/temps.schema';
import { TimelineController } from './timeline.controller';
import { TimelineService } from './timeline.service';

/**
 * The timing of a cook. Imports no other feature module on purpose: it is
 * depended on by the session state, the smoke lifecycle and the history read,
 * and every one of those already sits somewhere in the others' dependency
 * chains. Owning its collections directly is what lets all three depend on it
 * without closing a cycle — and the one module it does import, the Active
 * Cook, imports nothing itself.
 */
@Module({
  imports: [
    // Which cook the smoker is attached to, for the current-timeline and
    // per-probe estimate reads. Was this module's own read of the `state`
    // collection; it is one module's question now.
    ActiveCookModule,
    MongooseModule.forFeature([
      { name: 'Smoke', schema: SmokeSchema },
      { name: 'Temp', schema: TempSchema },
      // What the cook is of, read directly here for the same reason as the two
      // above.
      { name: PreSmoke.name, schema: PreSmokeSchema },
      // The cook's log, for the one question the Serve Plan asks of it: has a
      // wrap been stamped. Owned here like the rest, since `CookEventsModule`
      // sits downstream of this one.
      { name: 'CookEvent', schema: CookEventSchema },
      {
        name: ApplicationSettings.name,
        schema: ApplicationSettingsSchema,
        // The collection kept its original name when the document outgrew
        // notifications; see `AppSettingsModule`.
        collection: 'notificationsettings',
      },
    ]),
  ],
  controllers: [TimelineController],
  providers: [TimelineService],
  exports: [TimelineService],
})
export class TimelineModule {}
