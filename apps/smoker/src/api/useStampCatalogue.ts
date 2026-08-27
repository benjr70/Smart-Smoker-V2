/**
 * The stamps this screen offers.
 *
 * One read when the screen comes up, then the websocket — and the read again
 * every time that channel reconnects, because an announcement reaches only the
 * clients connected when it was made and this appliance drops off the wifi
 * routinely with nobody near it to reload. The catalogue is installation-wide
 * and edited on a phone, so a rename made in the kitchen has to reach the
 * touchscreen in the garage without either of them restarting.
 *
 * The whole list is announced and the whole list is applied — merging a rename
 * into a list that has since lost a stamp would put the stamp back. Until the
 * read comes back the shipped six are held, so the panel has buttons to draw
 * from its first paint rather than an empty row a thumb is already moving
 * towards.
 *
 * There is no edit here, because there is none on the pit: stamps are added,
 * renamed, recoloured and reordered on a screen with a keyboard.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getDefaultApiClient } from './client';
import { CookStamp, normalizeStamps } from './cookStamps';
import { StampCatalogueSubscriptionPort } from './cookLogPorts';
import { createSocketStampCatalogueSubscription } from './socketEventAdapter';

/** What this hook needs of the API: the stored catalogue, and nothing else. */
export interface StampCatalogueReadPort {
  get(): Promise<CookStamp[]>;
}

export interface UseStampCatalogueOptions {
  /** Where the catalogue is read. Defaults to this appliance's backend. */
  client?: StampCatalogueReadPort;
  /** The announcement channel; production uses the websocket. */
  subscription?: StampCatalogueSubscriptionPort;
}

export interface UseStampCatalogueResult {
  /** The catalogue, in the order the buttons are laid out. */
  stamps: CookStamp[];
}

/** Whether an announced frame is a catalogue this panel can draw buttons from. */
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
  const [stamps, setStamps] = useState<CookStamp[]>(() => normalizeStamps(undefined));

  // The appliance's own backend unless the screen was handed a port; the client
  // behind it is built once and hands back the same resource every time.
  const client = options.client ?? getDefaultApiClient().cookStamps;

  // Built once and held, so a re-render never reopens the socket.
  const subscriptionRef = useRef<StampCatalogueSubscriptionPort | null>(null);
  if (subscriptionRef.current === null) {
    subscriptionRef.current = options.subscription ?? createSocketStampCatalogueSubscription();
  }

  /**
   * How many catalogues newer than a read in flight have already been applied.
   * The read is the slower of the two channels, and a catalogue from before the
   * newer news must not land on top of it.
   */
  const superseded = useRef(0);
  /** Whether the screen is still up; an answer to a screen that is gone is worth nothing. */
  const onScreen = useRef(true);

  const read = useCallback((): void => {
    const asked = superseded.current;
    void client
      .get()
      .then(catalogue => {
        if (onScreen.current && superseded.current === asked) setStamps(normalizeStamps(catalogue));
      })
      // A backend the panel cannot reach leaves the buttons it already has —
      // the shipped six on a cold start, which are what the backend itself
      // falls back to when a tap arrives, so a thumb on one is still logged.
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
    const port = subscriptionRef.current as StampCatalogueSubscriptionPort;
    return port.subscribe(
      announced => {
        // A frame that is not a catalogue leaves the buttons alone: there is
        // nobody in the garage to notice the row went blank.
        if (!isCatalogue(announced)) {
          return;
        }
        superseded.current += 1;
        setStamps(normalizeStamps(announced));
      },
      // Reconnected: a catalogue announced while the wifi was down was
      // announced to nobody, so it is asked for again rather than assumed.
      () => read()
    );
  }, [read]);

  return { stamps };
}
