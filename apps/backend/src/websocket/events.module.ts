import { Module } from '@nestjs/common';
import { StateModule } from 'src/State/state.module';
import { TempModule } from 'src/temps/temps.module';
import { EventsGateway } from './events.gateway';

@Module({
  imports: [StateModule, TempModule],
  providers: [EventsGateway],
  // Exported so a write that changes something every client is looking at — the
  // installation-wide appearance — can announce itself on the gateway the
  // application already has, rather than over a second transport.
  exports: [EventsGateway],
})
export class EventsModule {}
