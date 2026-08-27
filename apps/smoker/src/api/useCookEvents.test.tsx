/**
 * The cook log as the touchscreen holds it: read when the screen comes up,
 * replaced whenever anything announces a new one, and added to by a thumb on a
 * button.
 */
import '@testing-library/jest-dom';
import { act, renderHook, waitFor } from '@testing-library/react';
import { CookEventsSubscriptionPort } from './cookLogPorts';
import { WireCookEvent, cookEventsFromWire } from './cookEventFrames';
import { CookEvent } from './types';
import { CookEventsReadPort, useCookEvents } from './useCookEvents';

/** One row of a cook log as the wire carries it. */
const wireEvent = (id: string, stampKey: string, at: string): WireCookEvent => ({
  _id: id,
  smokeId: 'smoke-1',
  stampKey,
  label: stampKey,
  tone: 'amber',
  at,
  chamberTemp: 225,
});

/** A subscription port a test drives by hand, standing in for the websocket. */
const fakeSubscription = () => {
  const listeners: ((events: WireCookEvent[]) => void)[] = [];
  const reconnects: (() => void)[] = [];
  let unsubscribed = 0;
  const port: CookEventsSubscriptionPort = {
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
    announce: (events: WireCookEvent[]) => act(() => listeners.forEach(listen => listen(events))),
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

/** A cook-log client a test answers for, one call at a time. */
const fakeClient = (log: WireCookEvent[] = []) => {
  const port = {
    reads: 0,
    posted: [] as string[],
    listCurrent: async (): Promise<CookEvent[]> => {
      port.reads += 1;
      return frames(log);
    },
    record: async (stampKey: string): Promise<CookEvent> => {
      port.posted.push(stampKey);
      return frames([
        wireEvent(`e-${port.posted.length}`, stampKey, '2026-08-27T14:00:00.000Z'),
      ])[0];
    },
  };
  return port;
};

/** The wire rows as a client hands them on, so a test states one shape. */
const frames = (raw: WireCookEvent[]): CookEvent[] => cookEventsFromWire(raw);

describe('the cook log the touchscreen holds', () => {
  it('shows what the backend had when the screen came up, oldest first', async () => {
    const subscription = fakeSubscription();
    const client = fakeClient([
      wireEvent('e2', 'wrap', '2026-08-27T13:00:00.000Z'),
      wireEvent('e1', 'wood', '2026-08-27T12:00:00.000Z'),
    ]);

    const { result } = renderHook(() => useCookEvents({ client, subscription: subscription.port }));

    await waitFor(() => expect(result.current.events.map(e => e._id)).toEqual(['e1', 'e2']));
  });

  it('replaces the log with the one announced over the socket', async () => {
    const subscription = fakeSubscription();
    const client = fakeClient([wireEvent('e1', 'wood', '2026-08-27T12:00:00.000Z')]);
    const { result } = renderHook(() => useCookEvents({ client, subscription: subscription.port }));
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    // Replaced rather than merged: an announcement carries the whole log, and
    // merging would resurrect an event a phone had just deleted.
    await subscription.announce([wireEvent('e9', 'sauce', '2026-08-27T15:00:00.000Z')]);

    expect(result.current.events.map(e => e._id)).toEqual(['e9']);
  });

  /**
   * The read is the slower of the two channels. A log from before the newer
   * news must not land on top of it, or the entry somebody just tapped drops
   * off the screen until the next write.
   */
  it('does not let a slow mount read undo news that arrived while it was in flight', async () => {
    const subscription = fakeSubscription();
    let release: (log: CookEvent[]) => void = () => undefined;
    const client: CookEventsReadPort = {
      listCurrent: () => new Promise<CookEvent[]>(resolve => (release = resolve)),
      record: async () => frames([wireEvent('e-new', 'wood', '2026-08-27T14:00:00.000Z')])[0],
    };
    const { result } = renderHook(() => useCookEvents({ client, subscription: subscription.port }));

    await subscription.announce([wireEvent('e9', 'sauce', '2026-08-27T15:00:00.000Z')]);
    await act(async () => {
      release(frames([wireEvent('e1', 'wood', '2026-08-27T12:00:00.000Z')]));
    });

    expect(result.current.events.map(e => e._id)).toEqual(['e9']);
  });

  /**
   * A read the panel could not make is not a reason to take anything off the
   * screen. The kiosk is the one screen with nowhere to go — no reload, no back
   * button, and a cook running — and a button that has lost the time it was
   * last tapped at is a button claiming it never was.
   */
  it('keeps the log it already had when a later read fails', async () => {
    const subscription = fakeSubscription();
    let reachable = true;
    const client: CookEventsReadPort = {
      listCurrent: () =>
        reachable
          ? Promise.resolve(frames([wireEvent('e1', 'wood', '2026-08-27T12:00:00.000Z')]))
          : Promise.reject(new Error('the panel cannot reach the cloud')),
      record: async () => frames([wireEvent('e-new', 'wood', '2026-08-27T14:00:00.000Z')])[0],
    };
    const { result } = renderHook(() => useCookEvents({ client, subscription: subscription.port }));
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    reachable = false;
    await subscription.reconnect();

    expect(result.current.events.map(e => e._id)).toEqual(['e1']);
  });

  /**
   * An announcement reaches only whoever was connected when it was made, and
   * this panel drops off the wifi routinely with nobody there to reload it. The
   * channel coming back up is its one chance to find out what it missed.
   */
  it('reads the log again whenever the channel comes back up', async () => {
    const subscription = fakeSubscription();
    const client = fakeClient([wireEvent('e1', 'wood', '2026-08-27T12:00:00.000Z')]);
    renderHook(() => useCookEvents({ client, subscription: subscription.port }));
    await waitFor(() => expect(client.reads).toBe(1));

    await subscription.reconnect();

    expect(client.reads).toBe(2);
  });

  it('logs a tap and appends what the backend stored', async () => {
    const subscription = fakeSubscription();
    const client = fakeClient([]);
    const { result } = renderHook(() => useCookEvents({ client, subscription: subscription.port }));
    await waitFor(() => expect(client.reads).toBe(1));

    let logged: boolean | undefined;
    await act(async () => {
      logged = await result.current.record('wood');
    });

    expect(logged).toBe(true);
    expect(client.posted).toEqual(['wood']);
    // From the backend's own answer: the moment and the temperatures are the
    // server's, and an entry invented here would show a time no reload agrees
    // with.
    expect(result.current.events.map(e => e.stampKey)).toEqual(['wood']);
  });

  it('adds nothing when the backend refused the tap', async () => {
    const subscription = fakeSubscription();
    const client: CookEventsReadPort = {
      listCurrent: async () => [],
      record: () => Promise.reject(new Error('nothing is cooking')),
    };
    const { result } = renderHook(() => useCookEvents({ client, subscription: subscription.port }));

    let logged: boolean | undefined;
    await act(async () => {
      logged = await result.current.record('wood');
    });

    expect(logged).toBe(false);
    expect(result.current.events).toEqual([]);
  });

  it('stops listening when the screen is left', async () => {
    const subscription = fakeSubscription();
    const client = fakeClient([]);
    const { unmount } = renderHook(() =>
      useCookEvents({ client, subscription: subscription.port })
    );
    await waitFor(() => expect(client.reads).toBe(1));

    unmount();

    expect(subscription.unsubscribed).toBe(1);
  });
});
