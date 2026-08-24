import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ApplicationSettings,
  ApplicationSettingsSchema,
} from '../appSettings/app-settings.schema';
import { SmokeSchema } from '../smoke/smoke.schema';
import { SmokeProFileSchema } from '../smokeProfile/smokeProfile.schema';
import { StateModule } from '../State/state.module';
import { StatsModule } from '../stats/stats.module';
import { TimelineModule } from '../timeline/timeline.module';
import { EventsModule } from '../websocket/events.module';
import { StaleCookMiddleware } from './stale-cook.middleware';
import { StaleCookService } from './stale-cook.service';

/**
 * Ending a cook nobody ended.
 *
 * Sits above the three modules the policy is written in terms of — the session
 * state it switches off, the timeline it stamps through, and the statistics it
 * makes recount — and is depended on by the triggers rather than depending on
 * them. That direction is deliberate: it is what lets a single service own the
 * decision without any of those modules learning about auto-stop.
 *
 * The cook and the settings are read through their own models here for the
 * same reason `TimelineModule` reads its three directly: both reads are a
 * single document by id, and importing the services that wrap them would drag
 * their dependency chains — and a cycle or two — in behind them.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Smoke', schema: SmokeSchema },
      { name: 'SmokeProfile', schema: SmokeProFileSchema },
      {
        name: ApplicationSettings.name,
        schema: ApplicationSettingsSchema,
        // The collection kept its original name when the document outgrew
        // notifications; see `AppSettingsModule`.
        collection: 'notificationsettings',
      },
    ]),
    StateModule,
    TimelineModule,
    StatsModule,
    // A stop the apps are never told about is toggled straight back on by the
    // next Stop press on a screen that still thinks the cook is running.
    // Forward-referenced since the gateway became a trigger: the reading path
    // there asks this module whether the cook it arrived into is over.
    forwardRef(() => EventsModule),
  ],
  providers: [StaleCookService, StaleCookMiddleware],
  exports: [StaleCookService, StaleCookMiddleware],
})
export class StaleCookModule {}
