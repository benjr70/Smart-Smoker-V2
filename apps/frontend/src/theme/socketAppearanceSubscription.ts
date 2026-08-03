/**
 * How this browser hears that another client changed the appearance.
 *
 * The production {@link AppearanceSubscriptionPort}: the websocket the
 * application already speaks, carrying the preference as its own event. No
 * polling and no second transport — the store is told the moment the backend
 * writes, and a browser that was not connected reads the stored preference on
 * its next load exactly as before.
 */
import { io } from 'socket.io-client';
import { AppearancePreference } from 'theme/src';
import { AppearanceSubscriptionPort } from './appearanceStore';

/**
 * The event name the backend announces on. Restated here rather than shared:
 * the backend ships as its own bundle, and the four events this application
 * already exchanges with that gateway are restated the same way.
 */
const APPEARANCE_EVENT = 'appearance';

/**
 * Whether a frame off the wire is a preference this client can paint.
 *
 * Anything else is dropped rather than handed on: the appearance decides what
 * every screen looks like, and a client that repainted from a malformed frame
 * would show a scheme no reload agrees with.
 */
const isPreference = (payload: unknown): payload is AppearancePreference => {
  const candidate = payload as Partial<AppearancePreference> | null;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    (candidate.mode === 'light' || candidate.mode === 'dark' || candidate.mode === 'system') &&
    (candidate.resolvedMode === 'light' || candidate.resolvedMode === 'dark')
  );
};

export const createSocketAppearanceSubscription = (): AppearanceSubscriptionPort => ({
  subscribe: listener => {
    // Opened on subscription rather than on construction, so assembling the
    // application costs no connection and the store owns the socket's lifetime.
    //
    // Its own connection rather than the smoke step's: the appearance is
    // listened for as long as the app is open, while that one belongs to a
    // screen and is closed when the operator leaves it.
    const socket = io(process.env.WS_URL ?? '');
    const handler = (payload: unknown): void => {
      if (isPreference(payload)) {
        listener(payload);
      }
    };
    socket.on(APPEARANCE_EVENT, handler);

    return () => {
      socket.off(APPEARANCE_EVENT, handler);
      socket.close();
    };
  },
});
