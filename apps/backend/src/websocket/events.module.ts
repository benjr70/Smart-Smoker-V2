import { Module } from '@nestjs/common';
import { ActiveCookModule } from 'src/activeCook/active-cook.module';
import { StaleCookModule } from 'src/staleCook/stale-cook.module';
import { TempModule } from 'src/temps/temps.module';
import { EventsGateway } from './events.gateway';

@Module({
  imports: [
    // Which cook a relayed reading belongs to. A plain reference: the Active
    // Cook imports no feature module, this gateway included — what it needs to
    // announce over one it reaches through the broadcast port instead, so the
    // two are not in a loop. See `CookBroadcastModule`.
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
