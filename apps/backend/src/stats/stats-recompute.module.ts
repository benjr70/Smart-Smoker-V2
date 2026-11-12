import { Global, Injectable, Module } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { STATS_RECOMPUTE, StatsRecomputePort } from './stats-recompute';
import { StatsModule } from './stats.module';
import { StatsService } from './stats.service';

/**
 * The real stats-recompute port: `StatsService`, reached at the moment a
 * transition asks for it rather than at the moment its caller is built.
 *
 * Looked up through `ModuleRef` because the dependency is a genuine loop of
 * services — the statistics derive each cook's duration through the timeline,
 * the timeline resolves the Active Cook, and the Active Cook's finish makes the
 * statistics stale. Nest cannot *construct* that loop, and a `forwardRef`
 * around the Active Cook is exactly what ADR 0001 removed. A call-time lookup
 * has no construction edge at all: the loop only ever exists while a finish is
 * running, which is when every one of the three is already built.
 */
@Injectable()
export class StatsRecompute implements StatsRecomputePort {
  constructor(private readonly moduleRef: ModuleRef) {}

  async recompute(): Promise<void> {
    // Not strict: the statistics live in their own module, and this provider is
    // reached from modules that deliberately do not import it.
    await this.moduleRef.get(StatsService, { strict: false }).recalculate();
  }
}

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
