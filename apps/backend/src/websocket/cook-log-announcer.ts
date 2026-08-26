import type { CookEvent } from '../cookEvents/cook-events.schema';

/**
 * How a write that empties the cook log tells every open screen about it,
 * without knowing what carries the news.
 *
 * A port rather than the gateway class because the dependency runs both ways:
 * the gateway reads the session to relay a reading, and clearing the session
 * announces over the gateway. Importing the class at both ends puts the two
 * files in a cycle, and the constructor metadata Nest reads is captured while
 * one of them is still half-evaluated — which resolves as `undefined` and takes
 * out every module that builds the pair. A token carries no such reference, and
 * the interface is erased.
 */
export const COOK_LOG_ANNOUNCER = 'COOK_LOG_ANNOUNCER';

export interface CookLogAnnouncerPort {
  /** Tell every connected client what the cook log now says. */
  broadcastCookEvents(events: CookEvent[]): void;
}
