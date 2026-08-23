import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { StaleCookService } from './stale-cook.service';

/**
 * The lazy trigger: every read of the current cook's timeline first asks
 * whether that cook is still a cook.
 *
 * A zombie session heals when somebody looks at it, even while the smoker is
 * switched off and no reading will ever arrive to notice the silence — opening
 * the app is enough. The check runs before the handler, so the timeline the
 * client is served is the healed one rather than the fortnight-long cook it
 * came for.
 *
 * Middleware rather than a call inside the timeline service, because of which
 * way the dependencies run: the stale-cook policy is written in terms of the
 * timeline (it stamps a backdated finish through it), the session state and the
 * statistics — all three of which already depend on `TimelineModule`. Calling
 * the policy from inside that module would close the cycle those modules were
 * arranged to avoid. Bound to the route from the application root instead,
 * where both sides are visible and neither has to know about the other.
 *
 * A check that fails never fails the read: this route is polled to draw a
 * running cook on every client, and the worst a missed stop costs is that the
 * next poll — or an arriving reading — notices instead.
 */
@Injectable()
export class StaleCookMiddleware implements NestMiddleware {
  private readonly logger = new Logger(StaleCookMiddleware.name);

  constructor(private readonly staleCook: StaleCookService) {}

  async use(_req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      await this.staleCook.autoStopIfStale(new Date());
    } catch (error) {
      this.logger.warn(
        `Could not check the current cook for staleness; the next read will try again. ${error}`,
      );
    }
    next();
  }
}
