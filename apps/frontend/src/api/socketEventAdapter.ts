/**
 * Socket-backed event port — the production implementation of {@link SmokeEventPort}.
 *
 * This is the ONLY frontend API module allowed to import `socket.io-client`.
 * Isolating the socket here keeps the REST client transport-pure and removes
 * the last stray socket-creation site that used to live in the legacy smoker
 * service. It preserves that service's exact behavior: a fresh connection to
 * `WS_URL` (empty string when unset) on which a `clear` event carrying `true`
 * is emitted, read at emit time so the environment is honored per call.
 */
import { io } from 'socket.io-client';
import { WireCookEvent } from './cookEventFrames';
import { SmokeEventPort } from './events';
import { CookEventsSubscriptionPort } from './useCookEvents';

export const createSocketEventPort = (): SmokeEventPort => ({
  emitClear: () => {
    const url = process.env.WS_URL ?? '';
    const socket = io(url);
    socket.emit('clear', true);
  },
});

/**
 * The event the backend announces a changed cook log on. Restated here rather
 * than imported: the backend ships as its own bundle beside no copy of itself,
 * exactly as every other event this app exchanges with that gateway is
 * restated.
 */
const COOK_EVENTS_EVENT = 'cookEventsUpdate';

/**
 * The production {@link CookEventsSubscriptionPort}: the websocket the app
 * already speaks, carrying the whole log as its own event.
 *
 * The connection is opened on subscription rather than on construction, so
 * assembling a screen costs no socket, and it is this port's own rather than
 * the smoke step's — the step closes its connection when it is left, and the
 * log is listened for as long as whatever mounted this is on screen.
 */
export const createSocketCookEventsSubscription = (): CookEventsSubscriptionPort => ({
  subscribe: listener => {
    const socket = io(process.env.WS_URL ?? '');
    const handler = (payload: unknown): void => {
      // Handed on as it arrived — the hook normalizes it with the same
      // function the REST read uses. Anything that is not a list is dropped
      // rather than passed along: a client that applied a malformed frame
      // would show a log no reload agrees with.
      if (Array.isArray(payload)) {
        listener(payload as WireCookEvent[]);
      }
    };
    socket.on(COOK_EVENTS_EVENT, handler);

    return () => {
      socket.off(COOK_EVENTS_EVENT, handler);
      socket.close();
    };
  },
});
