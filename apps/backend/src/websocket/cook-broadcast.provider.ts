import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { CookEvent } from '../cookEvents/cook-events.schema';
import { CookBroadcastPort, SmokeUpdateFrame } from './cook-broadcast';
import { EventsGateway } from './events.gateway';

/**
 * The real broadcast port: the gateway, reached at the moment a transition
 * announces itself rather than at the moment its caller is built.
 *
 * Looked up through `ModuleRef` for the same reason the stats-recompute port is
 * (see `StatsRecompute`): the dependency is a genuine loop of services — the
 * gateway resolves the Active Cook to relay a reading, and the Active Cook's
 * stop announces itself over the gateway. Nest cannot *construct* that loop,
 * and a `forwardRef` around the Active Cook is exactly what ADR 0001 removed. A
 * call-time lookup has no construction edge at all: the loop only ever exists
 * while a transition is running, which is when both ends are already built.
 */
@Injectable()
export class CookBroadcast implements CookBroadcastPort {
  constructor(private readonly moduleRef: ModuleRef) {}

  broadcastCookEvents(events: CookEvent[]): void {
    this.gateway().broadcastCookEvents(events);
  }

  broadcastSmokeUpdate(update: SmokeUpdateFrame): void {
    this.gateway().broadcastSmokeUpdate(update);
  }

  /**
   * The gateway as the application currently holds it. Not strict: the gateway
   * lives in its own module, and this provider is bound globally so that the
   * modules announcing over it deliberately do not import it.
   */
  private gateway(): EventsGateway {
    return this.moduleRef.get(EventsGateway, { strict: false });
  }
}
