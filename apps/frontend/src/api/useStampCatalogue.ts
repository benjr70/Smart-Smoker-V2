/**
 * The stamps this screen offers, and the one thing a screen does to them.
 *
 * One read on mount and then the websocket, exactly like the cook log: the
 * catalogue is installation-wide and edited from whichever client is to hand,
 * so a phone renaming a stamp has to reach the touchscreen in the garage
 * without either of them reloading. The whole list is announced and the whole
 * list is applied — merging a rename into a list that has since lost a stamp
 * would put the stamp back.
 *
 * Until the read comes back the shipped six are held, so every screen has
 * buttons to draw from its first paint rather than an empty grid that fills in.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApiClient } from './ApiClientProvider';
import { useApiSnackbar } from './SnackbarProvider';
import { CookStamp, DEFAULT_STAMPS, normalizeStamps } from './cookStamps';
import { createSocketStampCatalogueSubscription } from './socketEventAdapter';

/**
 * How this browser hears that the catalogue changed.
 *
 * The frame arrives as the wire carries it and is checked here, so the adapter
 * under this port stays a transport detail and a screen cannot tell which of
 * the two channels a catalogue arrived on.
 */
export interface StampCatalogueSubscriptionPort {
  /** Listen for announced catalogues; returns the unsubscribe. */
  subscribe(listener: (stamps: unknown) => void): () => void;
}

export interface UseStampCatalogueOptions {
  /** The announcement channel; production uses the websocket. */
  subscription?: StampCatalogueSubscriptionPort;
}

export interface UseStampCatalogueResult {
  /** The catalogue, in the order the buttons are laid out. */
  stamps: CookStamp[];
  /**
   * Store the whole list. Resolves `true` when the backend took it, `false`
   * when it refused or could not be reached — and on a refusal the catalogue
   * goes back to what is actually stored, so the editor never shows an edit the
   * backend does not have.
   */
  save: (stamps: CookStamp[]) => Promise<boolean>;
}

/** Whether an announced frame is a catalogue this client can draw buttons from. */
const isCatalogue = (payload: unknown): payload is CookStamp[] =>
  Array.isArray(payload) &&
  payload.every(
    stamp =>
      typeof stamp === 'object' &&
      stamp !== null &&
      typeof (stamp as CookStamp).key === 'string' &&
      typeof (stamp as CookStamp).label === 'string'
  );

export function useStampCatalogue(options: UseStampCatalogueOptions = {}): UseStampCatalogueResult {
  const client = useApiClient();
  const notify = useApiSnackbar();
  const [stamps, setStamps] = useState<CookStamp[]>(() => normalizeStamps(undefined));
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  // Built once and held, so a re-render never reopens the socket.
  const subscriptionRef = useRef<StampCatalogueSubscriptionPort | null>(null);
  // Whether anything newer than the mount read has already been applied — an
  // announcement or a save. The read is the slower of the two channels, and a
  // catalogue from before the newer news must not land on top of it.
  const supersededRef = useRef(false);
  if (subscriptionRef.current === null) {
    subscriptionRef.current = options.subscription ?? createSocketStampCatalogueSubscription();
  }

  useEffect(() => {
    let reading = true;
    void client.cookStamps
      .get()
      .then(catalogue => {
        if (reading && !supersededRef.current) setStamps(catalogue);
      })
      .catch(() => {
        // The shipped six rather than a screen with no buttons: they are what
        // the backend falls back to as well, so a tap on one is still logged.
        if (reading && !supersededRef.current)
          setStamps(DEFAULT_STAMPS.map(stamp => ({ ...stamp })));
      });
    return () => {
      reading = false;
    };
  }, [client]);

  useEffect(() => {
    const port = subscriptionRef.current as StampCatalogueSubscriptionPort;
    return port.subscribe(announced => {
      if (!isCatalogue(announced)) {
        return;
      }
      supersededRef.current = true;
      setStamps(normalizeStamps(announced));
    });
  }, []);

  const save = useCallback(
    (edited: CookStamp[]): Promise<boolean> =>
      client.cookStamps
        .save(edited)
        .then(saved => {
          supersededRef.current = true;
          setStamps(saved);
          return true;
        })
        .catch(() =>
          // Back to what is stored. An editor left showing a rejected edit is
          // an editor lying about what every other screen is offering.
          client.cookStamps
            .get()
            .then(stored => {
              setStamps(stored);
            })
            .catch(() => undefined)
            .then(() => {
              notifyRef.current('Could not save the cook log stamps.');
              return false;
            })
        ),
    [client]
  );

  return { stamps, save };
}
