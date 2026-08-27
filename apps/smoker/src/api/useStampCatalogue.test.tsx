/**
 * The stamps the touchscreen offers: read when the screen comes up, replaced
 * whenever a phone announces a new catalogue, and read again whenever the
 * channel comes back up.
 */
import '@testing-library/jest-dom';
import { act, renderHook, waitFor } from '@testing-library/react';
import { StampCatalogueSubscriptionPort } from './cookLogPorts';
import { CookStamp, DEFAULT_STAMPS } from './cookStamps';
import { StampCatalogueReadPort, useStampCatalogue } from './useStampCatalogue';

/** One stamp of a stored catalogue. */
const stamp = (key: string, label: string, enabled = true): CookStamp => ({
  key,
  label,
  tone: 'amber',
  enabled,
  custom: false,
});

/** A subscription port a test drives by hand, standing in for the websocket. */
const fakeSubscription = () => {
  const listeners: ((stamps: unknown) => void)[] = [];
  const reconnects: (() => void)[] = [];
  let unsubscribed = 0;
  const port: StampCatalogueSubscriptionPort = {
    subscribe: (listener, onConnected) => {
      listeners.push(listener);
      if (onConnected) reconnects.push(onConnected);
      return () => {
        unsubscribed += 1;
      };
    },
  };
  return {
    port,
    announce: (stamps: unknown) => act(() => listeners.forEach(listen => listen(stamps))),
    reconnect: async () => {
      await act(async () => {
        reconnects.forEach(say => say());
      });
    },
    get unsubscribed() {
      return unsubscribed;
    },
  };
};

/** A catalogue client a test answers for. */
const fakeClient = (catalogue: CookStamp[]) => {
  const port = {
    reads: 0,
    get: async (): Promise<CookStamp[]> => {
      port.reads += 1;
      return catalogue;
    },
  };
  return port;
};

describe('the stamp catalogue the touchscreen offers', () => {
  /**
   * The panel has to have buttons to draw from its first paint: an empty row
   * that fills in a moment later is a row somebody's thumb is already moving
   * towards.
   */
  it('holds the shipped stamps until the read lands', () => {
    const subscription = fakeSubscription();
    const client: StampCatalogueReadPort = { get: () => new Promise<CookStamp[]>(() => undefined) };

    const { result } = renderHook(() =>
      useStampCatalogue({ client, subscription: subscription.port })
    );

    expect(result.current.stamps.map(s => s.key)).toEqual(DEFAULT_STAMPS.map(s => s.key));
  });

  it('shows the stored catalogue once it has been read', async () => {
    const subscription = fakeSubscription();
    const client = fakeClient([stamp('wood', 'Split Added'), stamp('wrap', 'Foiled', false)]);

    const { result } = renderHook(() =>
      useStampCatalogue({ client, subscription: subscription.port })
    );

    await waitFor(() =>
      expect(result.current.stamps.map(s => s.label)).toEqual(['Split Added', 'Foiled'])
    );
    expect(result.current.stamps[1].enabled).toBe(false);
  });

  /**
   * A rename made on a phone has to reach the pit without anybody restarting
   * it — the whole list is announced, so the whole list is applied: merging a
   * rename into a list that has since lost a stamp would put the stamp back.
   */
  it('replaces the catalogue with the one announced over the socket', async () => {
    const subscription = fakeSubscription();
    const client = fakeClient([stamp('wood', 'Added Wood')]);
    const { result } = renderHook(() =>
      useStampCatalogue({ client, subscription: subscription.port })
    );
    await waitFor(() => expect(result.current.stamps).toHaveLength(1));

    await subscription.announce([stamp('wood', 'Split Added'), stamp('mop', 'Mopped')]);

    expect(result.current.stamps.map(s => s.label)).toEqual(['Split Added', 'Mopped']);
  });

  /**
   * A frame that is not a catalogue leaves the buttons alone. There is nobody
   * in the garage to notice the row went blank, and no reload coming.
   */
  it('ignores an announcement that is not a catalogue', async () => {
    const subscription = fakeSubscription();
    const client = fakeClient([stamp('wood', 'Added Wood')]);
    const { result } = renderHook(() =>
      useStampCatalogue({ client, subscription: subscription.port })
    );
    await waitFor(() => expect(result.current.stamps).toHaveLength(1));

    await subscription.announce({ stamps: 'nonsense' });

    expect(result.current.stamps.map(s => s.label)).toEqual(['Added Wood']);
  });

  it('does not let a slow read undo a catalogue announced while it was in flight', async () => {
    const subscription = fakeSubscription();
    let release: (catalogue: CookStamp[]) => void = () => undefined;
    const client: StampCatalogueReadPort = {
      get: () => new Promise<CookStamp[]>(resolve => (release = resolve)),
    };
    const { result } = renderHook(() =>
      useStampCatalogue({ client, subscription: subscription.port })
    );

    await subscription.announce([stamp('mop', 'Mopped')]);
    await act(async () => {
      release([stamp('wood', 'Added Wood')]);
    });

    expect(result.current.stamps.map(s => s.label)).toEqual(['Mopped']);
  });

  it('reads the catalogue again whenever the channel comes back up', async () => {
    const subscription = fakeSubscription();
    const client = fakeClient([stamp('wood', 'Added Wood')]);
    renderHook(() => useStampCatalogue({ client, subscription: subscription.port }));
    await waitFor(() => expect(client.reads).toBe(1));

    await subscription.reconnect();

    expect(client.reads).toBe(2);
  });

  /** A backend the panel cannot reach leaves the buttons it already had. */
  it('keeps the catalogue it had when a read fails', async () => {
    const subscription = fakeSubscription();
    const client: StampCatalogueReadPort = {
      get: () => Promise.reject(new Error('the panel cannot reach the cloud')),
    };

    const { result } = renderHook(() =>
      useStampCatalogue({ client, subscription: subscription.port })
    );

    await waitFor(() => expect(client.get).toBeDefined());
    expect(result.current.stamps.map(s => s.key)).toEqual(DEFAULT_STAMPS.map(s => s.key));
  });

  it('stops listening when the screen is left', async () => {
    const subscription = fakeSubscription();
    const client = fakeClient([stamp('wood', 'Added Wood')]);
    const { unmount } = renderHook(() =>
      useStampCatalogue({ client, subscription: subscription.port })
    );
    await waitFor(() => expect(client.reads).toBe(1));

    unmount();

    expect(subscription.unsubscribed).toBe(1);
  });
});
