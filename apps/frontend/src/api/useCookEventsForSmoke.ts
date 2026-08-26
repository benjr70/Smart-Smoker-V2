/**
 * The cook log of a smoke that is over: what was done to it, and the one thing
 * a reader may still do to that record.
 *
 * A finished cook's log does not change under anybody: nothing is being stamped
 * on it any more, so this reads once by smoke id and listens to no socket —
 * which is the whole difference between it and {@link useCookEvents}. Removing
 * a mis-tapped entry is still offered, because a bad tap should not pollute the
 * record forever; it is applied here once the backend has actually dropped it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApiClient } from './ApiClientProvider';
import { useApiSnackbar } from './SnackbarProvider';
import { CookEvent } from './types';

export interface UseCookEventsForSmokeResult {
  /** The log, oldest first — the order the cook happened in. */
  events: CookEvent[];
  /** Removes one entry, resolving whether the backend dropped it. */
  remove: (id: string) => Promise<boolean>;
}

export function useCookEventsForSmoke(smokeId: string): UseCookEventsForSmokeResult {
  const client = useApiClient();
  const notify = useApiSnackbar();
  const [events, setEvents] = useState<CookEvent[]>([]);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useEffect(() => {
    let reading = true;
    // A cook nobody has opened yet is asked nothing: the review renders its
    // sections before it knows which smoke it is showing.
    if (!smokeId) {
      setEvents([]);
      return () => {
        reading = false;
      };
    }
    void client.cookEvents
      .listForSmoke(smokeId)
      .then(log => {
        if (reading) setEvents(log);
      })
      .catch(() => {
        // An empty log rather than a broken review: the rest of the record is
        // worth reading even when this part could not be fetched.
        if (reading) setEvents([]);
      });
    return () => {
      reading = false;
    };
  }, [client, smokeId]);

  const remove = useCallback(
    (id: string): Promise<boolean> =>
      client.cookEvents
        .deleteById(id)
        .then(() => {
          setEvents(log => log.filter(event => event._id !== id));
          return true;
        })
        .catch(() => {
          notifyRef.current('Could not remove that entry.');
          return false;
        }),
    [client]
  );

  return { events, remove };
}
