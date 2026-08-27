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
   * Change the whole list and store it. Resolves `true` when the backend took
   * it, `false` when it refused or could not be reached — and on a refusal the
   * catalogue goes back to what is actually stored, so the editor never shows
   * an edit the backend does not have.
   *
   * The edit is described rather than handed over: the caller says what to do
   * to the catalogue and is given the catalogue to do it to, which is the list
   * as of the moment the edit runs rather than the one that was on screen when
   * the user clicked. A settings page renders once per save round trip, so two
   * clicks in quick succession are both computed from the same render — a
   * `save(nextList)` built that way silently undoes the earlier one. Edits are
   * also run one at a time, so the writes reach the backend in the order the
   * user made them and the last answer is the last edit's.
   */
  edit: (change: (stamps: CookStamp[]) => CookStamp[]) => Promise<boolean>;
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
  /**
   * The catalogue as this client last knew it, readable without a re-render.
   * State alone cannot answer an edit that was queued behind another: the
   * render holding it has not happened yet.
   */
  const latestRef = useRef<CookStamp[]>(stamps);
  /**
   * The edits already under way. Each one waits for it, so no two saves of the
   * whole list are ever in flight together and the backend is left holding the
   * last edit the user made rather than whichever answer came back last.
   */
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
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

  /** Hold a catalogue: what is rendered and what the next edit is built on. */
  const hold = useCallback((catalogue: CookStamp[]): void => {
    latestRef.current = catalogue;
    setStamps(catalogue);
  }, []);

  useEffect(() => {
    let reading = true;
    void client.cookStamps
      .get()
      .then(catalogue => {
        if (reading && !supersededRef.current) hold(catalogue);
      })
      .catch(() => {
        // The shipped six rather than a screen with no buttons: they are what
        // the backend falls back to as well, so a tap on one is still logged.
        if (reading && !supersededRef.current) hold(DEFAULT_STAMPS.map(stamp => ({ ...stamp })));
      });
    return () => {
      reading = false;
    };
  }, [client, hold]);

  useEffect(() => {
    const port = subscriptionRef.current as StampCatalogueSubscriptionPort;
    return port.subscribe(announced => {
      if (!isCatalogue(announced)) {
        return;
      }
      supersededRef.current = true;
      hold(normalizeStamps(announced));
    });
  }, [hold]);

  const edit = useCallback(
    (change: (stamps: CookStamp[]) => CookStamp[]): Promise<boolean> => {
      const queued = queueRef.current.then(() => {
        // Built here rather than by the caller, and from the list as it stands
        // now: an edit made while an earlier one was still saving would
        // otherwise be computed from the catalogue as it was before it.
        const next = change(latestRef.current.map(stamp => ({ ...stamp })));
        supersededRef.current = true;
        // Shown at once, so the switch the user just flipped stays flipped
        // while the save is in the air — and so the edit after it is built on
        // it. A refusal below puts the stored catalogue back.
        hold(next);
        return client.cookStamps
          .save(next)
          .then(saved => {
            hold(saved);
            return true;
          })
          .catch(() =>
            // Back to what is stored. An editor left showing a rejected edit is
            // an editor lying about what every other screen is offering.
            client.cookStamps
              .get()
              .then(stored => {
                hold(stored);
              })
              .catch(() => undefined)
              .then(() => {
                notifyRef.current('Could not save the cook log stamps.');
                return false;
              })
          );
      });
      // The queue never rejects: one failed save must not strand every edit
      // made after it.
      queueRef.current = queued.then(
        () => undefined,
        () => undefined
      );
      return queued;
    },
    [client, hold]
  );

  return { stamps, edit };
}
