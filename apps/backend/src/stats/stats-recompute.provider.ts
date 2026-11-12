import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { StatsRecomputePort } from './stats-recompute';
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
