import { Global, Module } from '@nestjs/common';
import { COOK_BROADCAST } from './cook-broadcast';
import { CookBroadcast } from './cook-broadcast.provider';

/**
 * Where the broadcast port is bound, globally.
 *
 * Global rather than imported by its consumer, so that the Active Cook — which
 * everything else depends on — goes on importing no feature module of its own.
 * A module edge from there to the gateway would put the Active Cook back inside
 * the loop it was built to stand outside of, which is what the `forwardRef`s
 * ADR 0001 removed were for. Modelled on `StatsRecomputeModule`, for the same
 * reason.
 *
 * No `imports`, where that one imports `StatsModule`: the gateway this binds is
 * provided by `EventsModule`, which `AppModule` imports outright, and the
 * provider looks it up non-strictly at call time rather than injecting it. An
 * `imports: [EventsModule]` here would be the module edge the global binding
 * exists to avoid.
 */
@Global()
@Module({
  providers: [{ provide: COOK_BROADCAST, useClass: CookBroadcast }],
  exports: [COOK_BROADCAST],
})
export class CookBroadcastModule {}
