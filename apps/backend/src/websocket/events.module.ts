import { Module, forwardRef } from '@nestjs/common';
import { StateModule } from 'src/State/state.module';
import { StaleCookModule } from 'src/staleCook/stale-cook.module';
import { TempModule } from 'src/temps/temps.module';
import { EventsGateway } from './events.gateway';

@Module({
  // The stale-cook module is forward-referenced because the two need each
  // other: a reading arriving here after a long gap asks it whether the cook is
  // over, and the stop it makes is announced back over this gateway. Both ends
  // declare the reference, which is what lets Nest build the pair.
  imports: [StateModule, TempModule, forwardRef(() => StaleCookModule)],
  providers: [EventsGateway],
  // Exported so a write that changes something every client is looking at — the
  // installation-wide appearance — can announce itself on the gateway the
  // application already has, rather than over a second transport.
  exports: [EventsGateway],
})
export class EventsModule {}
