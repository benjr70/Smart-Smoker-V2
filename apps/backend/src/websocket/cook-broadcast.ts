import type { CookEvent } from '../cookEvents/cook-events.schema';

/**
 * How a write that changes what every open screen is showing tells them about
 * it, without knowing what carries the news.
 *
 * A port rather than the gateway class because the dependency runs both ways:
 * the gateway reads the Active Cook to relay a reading, and a transition of
 * that cook announces itself over the gateway. Importing the class at both ends
 * puts the two files in a cycle, and the constructor metadata Nest reads is
 * captured while one of them is still half-evaluated — which resolves as
 * `undefined` and takes out every module that builds the pair. A token carries
 * no such reference, and the interface is erased.
 *
 * Was the cook-log announcer, with the one method. It carries the backend's own
 * smoking flip too now that the auto-stop that makes it belongs to the Active
 * Cook: both are the same gateway, reached the same way, by a module that must
 * not import it.
 */
export const COOK_BROADCAST = 'COOK_BROADCAST';

/**
 * The `smokeUpdate` frame: whether the cook is running, and what its four
 * probes are called.
 *
 * Declared with the port rather than with the gateway so that a module sending
 * one does not import the gateway's file for its shape. It is exactly the five
 * fields, in the order, that every client already sends and applies — the names
 * travel with the flag because the apps apply the whole frame, and a frame
 * missing them would relabel the screen it arrived at.
 */
export interface SmokeUpdateFrame {
  smoking: boolean;
  chamberName: string;
  probe1Name: string;
  probe2Name: string;
  probe3Name: string;
}

export interface CookBroadcastPort {
  /** Tell every connected client what the cook log now says. */
  broadcastCookEvents(events: CookEvent[]): void;
  /** Tell every connected client that the backend changed the smoking flag. */
  broadcastSmokeUpdate(update: SmokeUpdateFrame): void;
}
