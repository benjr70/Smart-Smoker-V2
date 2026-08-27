/**
 * The cook log of the session on screen, as the touchscreen holds it.
 *
 * One read when the screen comes up, then the websocket — and the read again
 * every time that channel reconnects, because the panel is switched on before
 * the tailnet is and drops off it routinely with nobody in the garage to
 * reload it. The log changes because somebody taps a button — here, on a phone,
 * or in a browser — and the backend announces the whole list on every write, so
 * this hook replaces what it holds rather than merging. Merging would resurrect
 * an event another client had just deleted.
 *
 * A tap is applied from the backend's own answer rather than optimistically:
 * the moment and the four temperatures are the server's, so an entry invented
 * here would show a time and a pit that no reload agrees with — and a tap the
 * backend refused must leave nothing at all behind, which is what lets the
 * button that was pressed say "Not logged" and mean it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getDefaultApiClient } from './client';
import { CookEventsSubscriptionPort } from './cookLogPorts';
import { cookEventsFromWire } from './cookEventFrames';
import { createSocketCookEventsSubscription } from './socketEventAdapter';
import { CookEvent } from './types';

/**
 * What this hook needs of the API: the running cook's log, and one tap of a
 * button. Deliberately narrower than the client's resource is allowed to grow.
 */
export interface CookEventsReadPort {
  listCurrent(): Promise<CookEvent[]>;
  record(stampKey: string): Promise<CookEvent>;
}

export interface UseCookEventsOptions {
  /** Where the log is read and written. Defaults to this appliance's backend. */
  client?: CookEventsReadPort;
  /** The announcement channel; production uses the websocket. */
  subscription?: CookEventsSubscriptionPort;
}

export interface UseCookEventsResult {
  /** The log, oldest first — the order the cook happened in. */
  events: CookEvent[];
  /**
   * Log one tap. Resolves `true` when the backend stored it, `false` when it
   * refused or could not be reached — which is what lets a button flash
   * "Logged" or "Not logged" rather than claim a phantom entry.
   */
  record: (stampKey: string) => Promise<boolean>;
}

export function useCookEvents(options: UseCookEventsOptions = {}): UseCookEventsResult {
  const [events, setEvents] = useState<CookEvent[]>([]);

  // The appliance's own backend unless the screen was handed a port. The client
  // behind it is built once, on first use, and hands back the same resource
  // every time — so this is a stable value to hang the read below off.
  const client = options.client ?? getDefaultApiClient().cookEvents;

  // Built once and held, so a re-render never reopens the socket.
  const subscriptionRef = useRef<CookEventsSubscriptionPort | null>(null);
  if (subscriptionRef.current === null) {
    subscriptionRef.current = options.subscription ?? createSocketCookEventsSubscription();
  }

  /**
   * How many logs newer than a read in flight have already been applied — an
   * announcement or a tap. The read is the slower of the two channels, and a
   * log from before the newer news must not land on top of it: the entry
   * somebody just tapped would drop off the screen until the next write.
   */
  const superseded = useRef(0);
  /** Whether the screen is still up; an answer to a screen that is gone is worth nothing. */
  const onScreen = useRef(true);

  const read = useCallback((): void => {
    const asked = superseded.current;
    void client
      .listCurrent()
      .then(log => {
        if (onScreen.current && superseded.current === asked) setEvents(log);
      })
      // A read the panel could not make changes nothing on the screen: the
      // kiosk has no reload button and a cook running, and a log that emptied
      // itself because the wifi dipped is a set of buttons claiming they were
      // never tapped. The next announcement — or the next reconnect — fills it
      // in.
      .catch(() => undefined);
  }, [client]);

  useEffect(() => {
    onScreen.current = true;
    read();
    return () => {
      onScreen.current = false;
    };
  }, [read]);

  useEffect(() => {
    const port = subscriptionRef.current as CookEventsSubscriptionPort;
    return port.subscribe(
      announced => {
        superseded.current += 1;
        setEvents(cookEventsFromWire(announced));
      },
      // Reconnected: what was announced while the wifi was down was announced
      // to nobody, so the log is asked for again rather than assumed.
      () => read()
    );
  }, [read]);

  const record = useCallback(
    (stampKey: string): Promise<boolean> =>
      client
        .record(stampKey)
        .then(recorded => {
          superseded.current += 1;
          // Appended from the backend's answer. The announcement that follows
          // replaces the whole list anyway; this is what makes the entry appear
          // on the screen that tapped it even if the socket is down.
          setEvents(log =>
            log.some(event => event._id === recorded._id) ? log : [...log, recorded]
          );
          return true;
        })
        .catch(() => false),
    [client]
  );

  return { events, record };
}
