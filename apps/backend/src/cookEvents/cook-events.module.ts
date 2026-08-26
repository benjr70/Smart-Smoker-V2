import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StateModule } from '../State/state.module';
import { TempModule } from '../temps/temps.module';
import { EventsModule } from '../websocket/events.module';
import { CookEventsController } from './cook-events.controller';
import { CookEventSchema } from './cook-events.schema';
import { CookEventsService } from './cook-events.service';

/**
 * The cook log.
 *
 * Sits above the three modules a tap is written in terms of — the session that
 * says which cook is running, the readings that say what the pit was doing, and
 * the gateway every open screen hears the result on — and is depended on by
 * nothing. That direction is what keeps it out of the dependency cycles the
 * cascades would otherwise close: the two places that delete a cook's events
 * with the cook address the collection through its own model instead (see
 * `cookEventsOfSmoke`).
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'CookEvent', schema: CookEventSchema }]),
    StateModule,
    TempModule,
    EventsModule,
  ],
  controllers: [CookEventsController],
  providers: [CookEventsService],
  exports: [CookEventsService],
})
export class CookEventsModule {}
