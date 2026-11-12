import { Global, Module } from '@nestjs/common';
import { STATS_RECOMPUTE } from './stats-recompute';
import { StatsRecompute } from './stats-recompute.provider';
import { StatsModule } from './stats.module';

/**
 * Where the stats-recompute port is bound, globally.
 *
 * Global rather than imported by its consumer, so that the Active Cook — which
 * everything else depends on — goes on importing no feature module of its own.
 * A module edge from there to the statistics would put the Active Cook back
 * inside the loop it was built to stand outside of.
 */
@Global()
@Module({
  imports: [StatsModule],
  providers: [{ provide: STATS_RECOMPUTE, useClass: StatsRecompute }],
  exports: [STATS_RECOMPUTE],
})
export class StatsRecomputeModule {}
