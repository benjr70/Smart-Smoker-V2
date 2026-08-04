/**
 * How the touchscreen hears that a browser changed the installation's
 * appearance.
 *
 * The production {@link DeviceAppearanceSubscriptionPort}: the websocket the
 * backend already announces on, carrying the preference as its own event. The
 * device is bolted to a smoker in a garage with nobody near it to reload the
 * page, so being told is the only way it can find out before its next boot.
 *
 * Its own connection rather than the smoke session's: the appearance is listened
 * for as long as the appliance is switched on, while that one belongs to a cook
 * and speaks a fixed set of four events.
 */
import { io } from 'socket.io-client';
import { AppearancePreference } from 'theme/src';
import { DeviceAppearanceSubscriptionPort } from './deviceAppearance';

/**
 * The event name the backend announces on. Restated here rather than shared:
 * the backend ships as its own bundle, and the events this application already
 * exchanges with that gateway are restated the same way.
 */
const APPEARANCE_EVENT = 'appearance';

/**
 * Whether a frame off the wire is a preference this device can paint.
 *
 * Anything else is dropped rather than handed on: the appearance decides what
 * the whole panel looks like, and there is no operator in the garage to notice
 * it went the wrong colour and no reload coming to put it back.
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

export const createSocketAppearanceSubscription = (): DeviceAppearanceSubscriptionPort => ({
  subscribe: listener => {
    // Opened on subscription rather than on construction, so assembling the
    // application costs no connection and the adapter owns the socket's
    // lifetime.
    const socket = io(process.env.REACT_APP_CLOUD_URL ?? '');
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
