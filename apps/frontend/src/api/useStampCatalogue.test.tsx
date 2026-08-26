import '@testing-library/jest-dom';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider } from './ApiClientProvider';
import { createApiClient } from './client';
import { FakeBackend, createFakeBackend } from './fakeBackend';
import { SnackbarProvider } from './SnackbarProvider';
import { CookStamp, DEFAULT_STAMPS, newCustomStamp } from './cookStamps';
import { StampCatalogueSubscriptionPort, useStampCatalogue } from './useStampCatalogue';

/** A subscription port a test drives by hand, standing in for the websocket. */
const fakeSubscription = () => {
  const listeners: ((stamps: unknown) => void)[] = [];
  let unsubscribed = 0;
  return {
    port: {
      subscribe: (listener: (stamps: unknown) => void) => {
        listeners.push(listener);
        return () => {
          unsubscribed += 1;
        };
      },
    } as unknown as StampCatalogueSubscriptionPort,
    announce: (stamps: unknown) => act(() => listeners.forEach(listen => listen(stamps))),
    get unsubscribed() {
      return unsubscribed;
    },
  };
};

/**
 * Let the mount read land. The catalogue a screen starts on is the shipped one
 * and most of these tests store exactly that, so waiting for the value to
 * change would wait for nothing: the read still has to be allowed to resolve
 * inside `act` before the test goes on.
 */
const settle = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
  });
};

const renderCatalogue = (backend: FakeBackend, subscription: StampCatalogueSubscriptionPort) => {
  const client = createApiClient(backend);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ApiClientProvider client={client}>
      <SnackbarProvider>{children}</SnackbarProvider>
    </ApiClientProvider>
  );
  return renderHook(() => useStampCatalogue({ subscription }), { wrapper });
};

describe('useStampCatalogue', () => {
  it('starts on the shipped stamps and reads the stored catalogue on mount', async () => {
    const stored: CookStamp[] = [
      ...DEFAULT_STAMPS.map(stamp => (stamp.key === 'wood' ? { ...stamp, label: 'Split' } : stamp)),
      { ...newCustomStamp(), label: 'Foil Boat' },
    ];
    const backend = createFakeBackend({
      appSettings: { settings: { cookLog: { stamps: stored } } },
    });
    const subscription = fakeSubscription();

    const { result } = renderCatalogue(backend, subscription.port);

    expect(result.current.stamps).toEqual([...DEFAULT_STAMPS]);
    await waitFor(() => expect(result.current.stamps).toEqual(stored));
  });

  it('follows a catalogue announced while the screen is open, without a reload', async () => {
    const backend = createFakeBackend();
    const subscription = fakeSubscription();
    const { result } = renderCatalogue(backend, subscription.port);
    await waitFor(() => expect(result.current.stamps).toEqual([...DEFAULT_STAMPS]));
    await settle();

    const renamed = DEFAULT_STAMPS.map(stamp =>
      stamp.key === 'wood' ? { ...stamp, label: 'Split' } : stamp
    );
    await subscription.announce(renamed);

    expect(result.current.stamps).toEqual(renamed);
  });

  it('ignores an announcement that is not a catalogue', async () => {
    const backend = createFakeBackend();
    const subscription = fakeSubscription();
    const { result } = renderCatalogue(backend, subscription.port);
    await waitFor(() => expect(result.current.stamps).toEqual([...DEFAULT_STAMPS]));
    await settle();

    await subscription.announce({ nonsense: true });

    expect(result.current.stamps).toEqual([...DEFAULT_STAMPS]);
  });

  it('keeps the shipped stamps when the catalogue cannot be read', async () => {
    const backend = createFakeBackend();
    backend.injectFault({ method: 'get', path: 'appSettings', status: 500 });
    const subscription = fakeSubscription();

    const { result } = renderCatalogue(backend, subscription.port);

    await waitFor(() => expect(backend.requests).toHaveLength(1));
    await settle();
    expect(result.current.stamps).toEqual([...DEFAULT_STAMPS]);
  });

  it('saves the whole list and holds what the backend stored', async () => {
    const backend = createFakeBackend();
    const subscription = fakeSubscription();
    const { result } = renderCatalogue(backend, subscription.port);
    await waitFor(() => expect(result.current.stamps).toEqual([...DEFAULT_STAMPS]));
    await settle();

    const edited = DEFAULT_STAMPS.map(stamp =>
      stamp.key === 'lid' ? { ...stamp, enabled: false } : stamp
    );
    await act(async () => {
      await result.current.save(edited);
    });

    expect(result.current.stamps).toEqual(edited);
    expect(await createApiClient(backend).cookStamps.get()).toEqual(edited);
  });

  it('puts the catalogue back as it was when a save is refused', async () => {
    const backend = createFakeBackend();
    const subscription = fakeSubscription();
    const { result } = renderCatalogue(backend, subscription.port);
    await waitFor(() => expect(result.current.stamps).toEqual([...DEFAULT_STAMPS]));
    await settle();
    backend.injectFault({ method: 'post', path: 'appSettings', status: 400 });

    await act(async () => {
      await result.current.save([...DEFAULT_STAMPS, { ...newCustomStamp(), label: 'Rotated' }]);
    });

    expect(result.current.stamps).toEqual([...DEFAULT_STAMPS]);
  });

  it('stops listening when the screen is left', async () => {
    const backend = createFakeBackend();
    const subscription = fakeSubscription();
    const { result, unmount } = renderCatalogue(backend, subscription.port);
    await waitFor(() => expect(result.current.stamps).toEqual([...DEFAULT_STAMPS]));
    await settle();

    unmount();

    expect(subscription.unsubscribed).toBe(1);
  });
});
