import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActiveCookModule } from '../activeCook/active-cook.module';
import {
  ApplicationSettings,
  ApplicationSettingsSchema,
} from '../appSettings/app-settings.schema';
import { TimelineModule } from '../timeline/timeline.module';
import { StaleCookMiddleware } from './stale-cook.middleware';
import { StaleCookService } from './stale-cook.service';

/**
 * Deciding that a cook nobody ended is over.
 *
 * Sits above the two modules the decision is written in terms of — the cook
 * itself, whose auto-stop it calls, and the timeline it reads the ends of a
 * series through — and is depended on by the triggers rather than depending on
 * them. That direction is what lets a single service own the decision without
 * any of those modules learning about auto-stop.
 *
 * Both of those edges are plain references. The state, the statistics, the
 * gateway and the push dispatcher are gone from here along with the stop
 * procedure that used them, and with them the two `forwardRef`s that only ever
 * existed because this module announced its own stop over a gateway that reads
 * the cook back.
 *
 * The settings are read through their own model for the same reason
 * `TimelineModule` reads its three directly: it is a single document read, and
 * importing the service that wraps it would drag its dependency chain in behind
 * it.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: ApplicationSettings.name,
        schema: ApplicationSettingsSchema,
        // The collection kept its original name when the document outgrew
        // notifications; see `AppSettingsModule`.
        collection: 'notificationsettings',
      },
    ]),
    ActiveCookModule,
    TimelineModule,
  ],
  providers: [StaleCookService, StaleCookMiddleware],
  exports: [StaleCookService, StaleCookMiddleware],
})
export class StaleCookModule {}
