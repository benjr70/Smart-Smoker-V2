import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ApplicationSettings,
  ApplicationSettingsSchema,
} from '../appSettings/app-settings.schema';
import { PreSmoke, PreSmokeSchema } from '../presmoke/presmoke.schema';
import { SmokeSchema } from '../smoke/smoke.schema';
import { stateSchema } from '../State/state.schema';
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
      // The session's own collections: which cook is running and whether it is
      // smoking, and what that cook is of — read directly here for the same
      // reason as the three above. Depending on `StateModule` would close a
      // cycle, since the state stamps its start through this service.
      { name: 'state', schema: stateSchema },
      { name: PreSmoke.name, schema: PreSmokeSchema },
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
