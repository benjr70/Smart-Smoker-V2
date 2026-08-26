import { Module, forwardRef } from '@nestjs/common';
import { StateModule } from 'src/State/state.module';
import { StaleCookModule } from 'src/staleCook/stale-cook.module';
import { TempModule } from 'src/temps/temps.module';
import { COOK_LOG_ANNOUNCER } from './cook-log-announcer';
import { EventsGateway } from './events.gateway';

@Module({
  // The stale-cook module is forward-referenced because the two need each
  // other: a reading arriving here after a long gap asks it whether the cook is
  // over, and the stop it makes is announced back over this gateway. Both ends
  // declare the reference, which is what lets Nest build the pair.
  imports: [
    forwardRef(() => StateModule),
    TempModule,
    forwardRef(() => StaleCookModule),
  ],
  providers: [
    EventsGateway,
    // The gateway under the announcement port, so a module that must not import
    // it — the session, which it imports — can still say the cook log emptied.
    { provide: COOK_LOG_ANNOUNCER, useExisting: EventsGateway },
  ],
  // Exported so a write that changes something every client is looking at — the
  // installation-wide appearance — can announce itself on the gateway the
  // application already has, rather than over a second transport.
  exports: [EventsGateway, COOK_LOG_ANNOUNCER],
})
export class EventsModule {}
