import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ApplicationSettings,
  ApplicationSettingsSchema,
} from '../appSettings/app-settings.schema';
import { CookEventSchema } from '../cookEvents/cook-events.schema';
import { SmokeSchema } from '../smoke/smoke.schema';
import { SmokeProFileSchema } from '../smokeProfile/smokeProfile.schema';
import { stateSchema } from '../State/state.schema';
import { TempSchema } from '../temps/temps.schema';
import { ActiveCookService } from './active-cook.service';

/**
 * Which cook the smoker is attached to — the one module that answers it.
 *
 * Imports no feature module at all, by design. Everything that reads the
 * current cook (the timeline, the alert check, the relay gateway, the settings
 * read, pre-smoke, the cook archive itself) depends on this one, so any service
 * edge out of here would close a DI cycle — the reason the old current-smoke
 * helper, built on `StateService` and `SmokeService`, could not be used by
 * `SmokeModule`. Owning the two collections it reads is what makes it
 * depend-on-able from anywhere.
 *
 * The state singleton is still seeded by `StateModule`; the reads and every
 * transition of the cook are here. Registering the same collections in both
 * modules is how the rest of this codebase already shares them (see
 * `TimelineModule`); a Mongoose feature registration is a model, not an owner.
 *
 * The stats-recompute, broadcast and push ports its transitions call are bound
 * globally rather than imported, for the same reason: see
 * `StatsRecomputeModule`, `CookBroadcastModule` and `PushNoticeModule`.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'state', schema: stateSchema },
      { name: 'Smoke', schema: SmokeSchema },
      // What a stamp is computed from: the cook's own readings bound its start
      // and hold its peak, and the settings say what the meat was being taken
      // to. Their models, like the two above.
      { name: 'Temp', schema: TempSchema },
      // The cook log a discarded cook's clear throws out, and what the
      // stopped cook's probes are called for the frame its stop announces.
      // Their models, like the two above.
      { name: 'CookEvent', schema: CookEventSchema },
      { name: 'SmokeProfile', schema: SmokeProFileSchema },
      {
        name: ApplicationSettings.name,
        schema: ApplicationSettingsSchema,
        // The collection kept its original name when the document outgrew
        // notifications; see `AppSettingsModule`.
        collection: 'notificationsettings',
      },
    ]),
  ],
  providers: [ActiveCookService],
  exports: [ActiveCookService],
})
export class ActiveCookModule {}
