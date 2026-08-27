/**
 * How the touchscreen hears that the cook log or the catalogue behind its
 * buttons changed.
 *
 * Two announcement channels, declared as what a screen needs of them rather
 * than as what carries them: production hands over the backend's websocket, a
 * test hands over a function it calls itself, and neither the hooks above nor
 * the screens above those can tell which. They are declared together, and apart
 * from both the adapter and the hooks, because the adapter implements them and
 * the hooks consume them — one module either side would have to import the
 * other.
 *
 * `onConnected` is offered on both for the reason the appearance channel offers
 * it (see `theme/deviceAppearance.ts`): an announcement reaches only the
 * clients connected when it was made, and this appliance is switched on before
 * the tailnet is, drops off it routinely, and has nobody in the garage to
 * reload it. The moment the channel comes up is the moment it is worth asking
 * what was missed.
 */
import { WireCookEvent } from './cookEventFrames';

export interface CookEventsSubscriptionPort {
  /**
   * Listen for announced logs; returns the unsubscribe.
   *
   * The frames arrive as the wire carries them and are normalized by the hook,
   * with the same function its REST read is normalized with, so a screen cannot
   * tell which of the two channels a log arrived on.
   */
  subscribe(listener: (events: WireCookEvent[]) => void, onConnected?: () => void): () => void;
}

export interface StampCatalogueSubscriptionPort {
  /**
   * Listen for announced catalogues; returns the unsubscribe.
   *
   * The frame is handed on exactly as it arrived, unchecked: whether it is a
   * catalogue this panel can draw buttons from is the hook's question, asked
   * the same way whichever channel it came in on.
   */
  subscribe(listener: (stamps: unknown) => void, onConnected?: () => void): () => void;
}
