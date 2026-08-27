/**
 * Socket-backed event port — the production implementation of {@link
 * SmokeEventPort}.
 *
 * The panel's third and last socket, alongside the session's feed and the
 * appearance subscription: a connection opened to say one thing — that the cook
 * the state pointed at is gone — and nothing else. It is opened at emit time,
 * so an appliance that never recovers a session never opens it, and the cloud
 * URL is read then too, the way the rest of this app reads it.
 *
 * This and the appearance subscription are the only modules in the smoker app
 * allowed to import `socket.io-client`; the API client itself stays
 * transport-pure and reaches the wire only through this port.
 */
import { io } from 'socket.io-client';
import { WireCookEvent } from './cookEventFrames';
import { CookEventsSubscriptionPort, StampCatalogueSubscriptionPort } from './cookLogPorts';
import { SmokeEventPort } from './events';

export const createSocketEventPort = (): SmokeEventPort => ({
  emitClear: () => {
    const socket = io(process.env.REACT_APP_CLOUD_URL ?? '');
    socket.emit('clear', true);
  },
});

/**
 * The events the backend announces the cook log and the stamp catalogue on, and
 * the one the socket library raises when it reaches the backend. Restated here
 * rather than shared, exactly as every other event this appliance exchanges
 * with that gateway is: the backend ships as its own bundle beside no copy of
 * itself.
 */
const COOK_EVENTS_EVENT = 'cookEventsUpdate';
const COOK_LOG_STAMPS_EVENT = 'cookLogStamps';
const CONNECT_EVENT = 'connect';

/**
 * Subscribing to one of the gateway's whole-list announcements.
 *
 * The connection is opened on subscription rather than on construction, so
 * assembling a screen costs no socket, and it is this subscription's own rather
 * than the smoke session's — that one belongs to a cook and speaks a fixed set
 * of four events, while a cook log is listened for as long as the screen
 * holding it is up.
 *
 * `accept` says what an announced frame is worth: the frame to hand on, or
 * nothing at all for one this panel cannot use.
 */
const createAnnouncementSubscription = <TFrame>(
  event: string,
  accept: (payload: unknown) => TFrame | undefined
) => ({
  subscribe: (listener: (frame: TFrame) => void, onConnected?: () => void): (() => void) => {
    const socket = io(process.env.REACT_APP_CLOUD_URL ?? '');
    const handler = (payload: unknown): void => {
      const frame = accept(payload);
      if (frame !== undefined) {
        listener(frame);
      }
    };
    const connected = (): void => onConnected?.();
    socket.on(event, handler);
    socket.on(CONNECT_EVENT, connected);

    return () => {
      socket.off(event, handler);
      socket.off(CONNECT_EVENT, connected);
      socket.close();
    };
  },
});

/**
 * The production {@link CookEventsSubscriptionPort}: the websocket this
 * appliance already speaks, carrying the whole log as its own event.
 *
 * Anything that is not a list is dropped rather than passed along — a panel
 * that applied a malformed frame would show a log no reload agrees with, and
 * there is nobody in the garage to reload it.
 */
export const createSocketCookEventsSubscription = (): CookEventsSubscriptionPort =>
  createAnnouncementSubscription<WireCookEvent[]>(COOK_EVENTS_EVENT, payload =>
    Array.isArray(payload) ? (payload as WireCookEvent[]) : undefined
  );

/**
 * The production {@link StampCatalogueSubscriptionPort}: the same websocket,
 * carrying the whole catalogue as its own event. The frame is handed on as it
 * arrived; the hook decides whether it is a catalogue, with the same check
 * whatever channel it came from — so a frame is only dropped here when the
 * gateway announced nothing at all.
 */
export const createSocketStampCatalogueSubscription = (): StampCatalogueSubscriptionPort =>
  createAnnouncementSubscription<unknown>(COOK_LOG_STAMPS_EVENT, payload => payload ?? null);
