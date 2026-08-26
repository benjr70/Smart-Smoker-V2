/**
 * The cook log of the session on screen: what has been stamped, and the two
 * things a screen does to it.
 *
 * One read on mount and then the websocket. The log changes because somebody
 * taps a button — here, on the smoker touchscreen, or in another browser — and
 * the backend announces the whole list on every write, so this hook replaces
 * what it holds rather than merging. Merging would resurrect an event another
 * client had just deleted.
 *
 * A tap is applied from the backend's own answer rather than optimistically:
 * the moment and the four temperatures are the server's, so an entry invented
 * here would show a time and a pit that no reload agrees with.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApiClient } from './ApiClientProvider';
import { useApiSnackbar } from './SnackbarProvider';
import { WireCookEvent, cookEventsFromWire } from './cookEventFrames';
import { CookEvent } from './types';
import { createSocketCookEventsSubscription } from './socketEventAdapter';

/**
 * How this browser hears that the cook log changed.
 *
 * The frames arrive as the wire carries them and are normalized here, by the
 * same function the REST read is normalized with — so the adapter under this
 * port stays a transport detail and a screen cannot tell which of the two
 * channels a log arrived on.
 */
export interface CookEventsSubscriptionPort {
  /** Listen for announced logs; returns the unsubscribe. */
  subscribe(listener: (events: WireCookEvent[]) => void): () => void;
}

export interface UseCookEventsOptions {
  /** The announcement channel; production uses the websocket. */
  subscription?: CookEventsSubscriptionPort;
}

export interface UseCookEventsResult {
  /** The log, oldest first — the order the cook happened in. */
  events: CookEvent[];
  /**
   * Log one tap. Resolves `true` when the backend stored it, `false` when it
   * refused or could not be reached — which is what lets a button flash
   * "Logged" or "Not logged" rather than claiming a phantom entry.
   */
  record: (stampKey: string) => Promise<boolean>;
  /** Remove one mis-tapped event. Resolves whether it was removed. */
  remove: (id: string) => Promise<boolean>;
}

export function useCookEvents(options: UseCookEventsOptions = {}): UseCookEventsResult {
  const client = useApiClient();
  const notify = useApiSnackbar();
  const [events, setEvents] = useState<CookEvent[]>([]);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  // Built once and held, so a re-render never reopens the socket.
  const subscriptionRef = useRef<CookEventsSubscriptionPort | null>(null);
  // Whether anything newer than the mount read has already been applied — an
  // announcement, a tap, or a removal. The read is the slower of the two
  // channels, and a log from before the newer news must not land on top of it.
  const supersededRef = useRef(false);
  if (subscriptionRef.current === null) {
    subscriptionRef.current = options.subscription ?? createSocketCookEventsSubscription();
  }

  useEffect(() => {
    let reading = true;
    void client.cookEvents
      .listCurrent()
      .then(log => {
        // Nothing is applied after the screen has been left, and nothing is
        // applied over news that arrived while this read was in flight: an
        // announcement or a tap is by definition the later word on the log,
        // and letting the read win would take the new entry off the screen
        // until the next write.
        if (reading && !supersededRef.current) setEvents(log);
      })
      .catch(() => {
        // An empty log rather than a broken screen: the cook itself is drawn
        // from the live session, and the next announcement fills this in.
        if (reading && !supersededRef.current) setEvents([]);
      });
    return () => {
      reading = false;
    };
  }, [client]);

  useEffect(() => {
    const port = subscriptionRef.current as CookEventsSubscriptionPort;
    return port.subscribe(announced => {
      supersededRef.current = true;
      setEvents(cookEventsFromWire(announced));
    });
  }, []);

  const record = useCallback(
    (stampKey: string): Promise<boolean> =>
      client.cookEvents
        .record(stampKey)
        .then(recorded => {
          supersededRef.current = true;
          // Appended from the backend's answer. The announcement that follows
          // replaces the whole list anyway; this is what makes the entry
          // appear on the screen that tapped it even if the socket is down.
          setEvents(log =>
            log.some(event => event._id === recorded._id) ? log : [...log, recorded]
          );
          return true;
        })
        .catch(() => {
          notifyRef.current('Could not log that.');
          return false;
        }),
    [client]
  );

  const remove = useCallback(
    (id: string): Promise<boolean> =>
      client.cookEvents
        .deleteById(id)
        .then(() => {
          supersededRef.current = true;
          setEvents(log => log.filter(event => event._id !== id));
          return true;
        })
        .catch(() => {
          notifyRef.current('Could not remove that entry.');
          return false;
        }),
    [client]
  );

  return { events, record, remove };
}
