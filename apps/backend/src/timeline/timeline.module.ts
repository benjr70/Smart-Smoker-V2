import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ApplicationSettings,
  ApplicationSettingsSchema,
} from '../appSettings/app-settings.schema';
import { SmokeSchema } from '../smoke/smoke.schema';
import { TempSchema } from '../temps/temps.schema';
import { TimelineController } from './timeline.controller';
import { TimelineService } from './timeline.service';

/**
 * The timing of a cook. Imports no other feature module on purpose: it is
 * depended on by the session state, the smoke lifecycle and the history read,
 * and every one of those already sits somewhere in the others' dependency
 * chains. Owning its three collections directly is what lets all three depend
 * on it without closing a cycle.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Smoke', schema: SmokeSchema },
      { name: 'Temp', schema: TempSchema },
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
