import '@testing-library/jest-dom';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider } from './ApiClientProvider';
import { ApiClient, createApiClient } from './client';
import { FakeBackend, createFakeBackend } from './fakeBackend';
import { SnackbarProvider } from './SnackbarProvider';
import { CookEventsSubscriptionPort, useCookEvents } from './useCookEvents';
import { CookEvent } from './types';

/**
 * A client whose cook-log read has not come back yet, and the handle that lets
 * it come back — the slow network a newer log has to be allowed to overtake.
 */
const withHeldRead = (log: CookEvent[]) => {
  let release: () => void = () => undefined;
  const held = new Promise<CookEvent[]>(resolve => {
    release = () => resolve(log);
  });
  return {
    bend: (client: ApiClient): ApiClient => ({
      ...client,
      cookEvents: { ...client.cookEvents, listCurrent: () => held },
    }),
    release: async () => {
      release();
      await act(async () => {
        await held;
      });
    },
  };
};

/** A subscription port a test drives by hand, standing in for the websocket. */
const fakeSubscription = () => {
  const listeners: ((events: unknown[]) => void)[] = [];
  let unsubscribed = 0;
  return {
    port: {
      subscribe: (listener: (events: unknown[]) => void) => {
        listeners.push(listener);
        return () => {
          unsubscribed += 1;
        };
      },
    } as unknown as CookEventsSubscriptionPort,
    announce: (events: unknown[]) => act(() => listeners.forEach(listen => listen(events))),
    get subscribers() {
      return listeners.length;
    },
    get unsubscribed() {
      return unsubscribed;
    },
  };
};

const renderCookEvents = (
  backend: FakeBackend,
  subscription: CookEventsSubscriptionPort,
  /** Bends the client the hook is handed — used to hold the mount read open. */
  bend: (client: ApiClient) => ApiClient = same => same
) => {
  const client = bend(createApiClient(backend));
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ApiClientProvider client={client}>
      <SnackbarProvider>{children}</SnackbarProvider>
    </ApiClientProvider>
  );
  return renderHook(() => useCookEvents({ subscription }), { wrapper });
};

const lit = (): FakeBackend =>
  createFakeBackend({
    state: { smokeId: 'smoke-1', smoking: true },
    cookEvents: {
      current: [
        {
          _id: 'event-1',
          smokeId: 'smoke-1',
          stampKey: 'wood',
          label: 'Added Wood',
          tone: 'amber',
          at: '2026-08-25T12:00:00.000Z',
          chamberTemp: 243,
        } as never,
      ],
    },
  });

describe('useCookEvents', () => {
  it('reads the log the cook already has', async () => {
    const socket = fakeSubscription();
    const { result } = renderCookEvents(lit(), socket.port);

    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0].label).toBe('Added Wood');
    expect(result.current.events[0].at).toEqual(new Date('2026-08-25T12:00:00.000Z'));
  });

  it('replaces what it holds with the log another client announced', async () => {
    const socket = fakeSubscription();
    const { result } = renderCookEvents(lit(), socket.port);
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    await socket.announce([
      {
        _id: 'event-2',
        smokeId: 'smoke-1',
        stampKey: 'wrap',
        label: 'Wrapped',
        tone: 'p1',
        at: '2026-08-25T13:00:00.000Z',
        chamberTemp: 250,
      },
    ]);

    // Replaced, not merged: the announcement carries the whole log, so a
    // client that merged would resurrect an event somebody else deleted.
    expect(result.current.events.map(event => event._id)).toEqual(['event-2']);
    expect(result.current.events[0].at).toEqual(new Date('2026-08-25T13:00:00.000Z'));
  });

  it('logs a tap and shows it without waiting to be told', async () => {
    const socket = fakeSubscription();
    const backend = lit();
    const { result } = renderCookEvents(backend, socket.port);
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    await act(async () => {
      expect(await result.current.record('spritz')).toBe(true);
    });

    expect(result.current.events.map(event => event.stampKey)).toEqual(['wood', 'spritz']);
    expect(backend.requests.some(r => r.method === 'post' && r.path === 'cook-events')).toBe(true);
  });

  it('reports a tap that could not be logged, and records nothing', async () => {
    const socket = fakeSubscription();
    const backend = createFakeBackend({ state: { smokeId: '', smoking: false } });
    const { result } = renderCookEvents(backend, socket.port);
    await waitFor(() => expect(result.current.events).toEqual([]));

    await act(async () => {
      expect(await result.current.record('wood')).toBe(false);
    });

    expect(result.current.events).toEqual([]);
  });

  it('removes a mis-tapped event', async () => {
    const socket = fakeSubscription();
    const backend = lit();
    const { result } = renderCookEvents(backend, socket.port);
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    await act(async () => {
      expect(await result.current.remove('event-1')).toBe(true);
    });

    expect(result.current.events).toEqual([]);
  });

  it('keeps the entry when the delete could not be made', async () => {
    const socket = fakeSubscription();
    const backend = lit();
    backend.injectFault({ method: 'delete', path: 'cook-events/event-1', status: 500 });
    const { result } = renderCookEvents(backend, socket.port);
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    await act(async () => {
      expect(await result.current.remove('event-1')).toBe(false);
    });

    // The log still says what the backend says: an entry dropped from the
    // screen alone would be back on the next announcement anyway.
    expect(result.current.events).toHaveLength(1);
  });

  it('stops listening when the screen is left', async () => {
    const socket = fakeSubscription();
    const { unmount } = renderCookEvents(lit(), socket.port);
    await waitFor(() => expect(socket.subscribers).toBe(1));

    unmount();

    expect(socket.unsubscribed).toBe(1);
  });

  /**
   * The mount read and the websocket race, and the read is the slower of the
   * two: applying it whenever it lands would put the log as it was before the
   * announcement back on the screen, and the entry another client had just
   * made would vanish until the next write.
   */
  it('does not let a slow first read undo a log announced while it was in flight', async () => {
    const socket = fakeSubscription();
    const held = withHeldRead([]);
    const { result } = renderCookEvents(lit(), socket.port, held.bend);

    await socket.announce([
      {
        _id: 'event-9',
        smokeId: 'smoke-1',
        stampKey: 'wrap',
        label: 'Wrapped',
        tone: 'p1',
        at: '2026-08-25T13:00:00.000Z',
        chamberTemp: 250,
      },
    ]);
    await held.release();

    expect(result.current.events.map(event => event._id)).toEqual(['event-9']);
  });

  // The same race, lost the other way round: the tap this screen made itself.
  it('does not let a slow first read undo a tap made while it was in flight', async () => {
    const socket = fakeSubscription();
    const held = withHeldRead([]);
    const { result } = renderCookEvents(lit(), socket.port, held.bend);

    await act(async () => {
      expect(await result.current.record('spritz')).toBe(true);
    });
    await held.release();

    expect(result.current.events.map(event => event.stampKey)).toEqual(['spritz']);
  });

  it('shows an empty log when it cannot be read', async () => {
    const socket = fakeSubscription();
    const backend = lit();
    backend.injectFault({ method: 'get', path: 'cook-events/current', status: 500 });
    const { result } = renderCookEvents(backend, socket.port);

    await waitFor(() => expect(result.current.events).toEqual([]));
  });
});
