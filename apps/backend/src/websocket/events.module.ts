import { Module } from '@nestjs/common';
import { ActiveCookModule } from 'src/activeCook/active-cook.module';
import { StaleCookModule } from 'src/staleCook/stale-cook.module';
import { TempModule } from 'src/temps/temps.module';
import { EventsGateway } from './events.gateway';

@Module({
  imports: [
    // Which cook the smoker is attached to. Was `StateModule`, which had to be
    // forward-referenced because the session imports this gateway back; the
    // Active Cook imports nothing, so this edge is a plain one.
    ActiveCookModule,
    TempModule,
    // A reading arriving here after a long gap asks whether the cook it would
    // join is over. A plain reference since the stop moved to the Active Cook:
    // that module no longer announces anything back over this gateway, so the
    // two are no longer in a loop.
    StaleCookModule,
  ],
  providers: [EventsGateway],
  // Exported so a write that changes something every client is looking at — the
  // installation-wide appearance — can announce itself on the gateway the
  // application already has, rather than over a second transport. A module that
  // must not import this one announces through the broadcast port instead; see
  // `CookBroadcastModule`.
  exports: [EventsGateway],
})
export class EventsModule {}
