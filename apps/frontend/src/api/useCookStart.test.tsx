import '@testing-library/jest-dom';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider } from './ApiClientProvider';
import { createApiClient } from './client';
import { createFakeBackend, FakeBackend, NO_CURRENT_TIMELINE } from './fakeBackend';
import { SnackbarProvider } from './SnackbarProvider';
import { COOK_START_REFRESH_MS, useCookStart } from './useCookStart';

const renderCookStartHook = (backend: FakeBackend, smoking: boolean) => {
  const client = createApiClient(backend);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ApiClientProvider client={client}>
      <SnackbarProvider>{children}</SnackbarProvider>
    </ApiClientProvider>
  );
  return renderHook(({ isSmoking }: { isSmoking: boolean }) => useCookStart(isSmoking), {
    wrapper,
    initialProps: { isSmoking: smoking },
  });
};

const backendWithStart = (startedAt: string | null) =>
  createFakeBackend({
    state: { smokeId: 'smoke-1', smoking: true },
    timeline: { current: { ...NO_CURRENT_TIMELINE, startedAt } },
  });

describe('useCookStart', () => {
  test('reads the recorded start of the cook that is set up', async () => {
    const { result } = renderCookStartHook(backendWithStart('2026-08-01T10:00:00.000Z'), true);

    await waitFor(() => expect(result.current).toEqual(new Date('2026-08-01T10:00:00.000Z')));
  });

  test('reads no start while no session is set up', async () => {
    const backend = createFakeBackend({ state: { smokeId: '', smoking: false } });

    const { result } = renderCookStartHook(backend, false);

    await waitFor(() => expect(backend.requests.length).toBeGreaterThan(0));
    expect(result.current).toBeNull();
  });

  test('re-reads the start when smoking is switched on, so the stamp just written is picked up', async () => {
    const backend = backendWithStart(null);
    const { result, rerender } = renderCookStartHook(backend, false);

    await waitFor(() => expect(result.current).toBeNull());

    // The backend stamps the start as smoking is switched on.
    backend.store.timeline.current.startedAt = '2026-08-01T10:00:00.000Z';
    rerender({ isSmoking: true });

    await waitFor(() => expect(result.current).toEqual(new Date('2026-08-01T10:00:00.000Z')));
  });

  test('says so when the cook timer cannot be read', async () => {
    const backend = backendWithStart('2026-08-01T10:00:00.000Z');
    backend.injectFault({ method: 'get', path: 'timeline/current', status: 500 });

    const { result } = renderCookStartHook(backend, true);

    expect(await screen.findByText('Could not load the cook timer.')).toBeInTheDocument();
    expect(result.current).toBeNull();
  });

  /**
   * The cook can end anywhere: the touchscreen presses Finish, or another
   * client clears the session. Neither moves this screen's smoking flag — it
   * may already be false — so nothing about the props changes, and a start read
   * once and never again would leave the bar counting a cook that is over.
   */
  test('drops the start when the cook is finished somewhere else', async () => {
    jest.useFakeTimers();
    try {
      const backend = backendWithStart('2026-08-01T10:00:00.000Z');
      const { result } = renderCookStartHook(backend, false);

      await waitFor(() => expect(result.current).toEqual(new Date('2026-08-01T10:00:00.000Z')));

      // The touchscreen finishes the cook: the backend session is cleared, and
      // the running-cook route answers with a cook of nothing.
      backend.store.state = { smokeId: '', smoking: false };
      backend.store.timeline.current = { ...NO_CURRENT_TIMELINE };
      await act(async () => {
        jest.advanceTimersByTime(COOK_START_REFRESH_MS);
      });

      await waitFor(() => expect(result.current).toBeNull());
    } finally {
      jest.useRealTimers();
    }
  });

  // A start we can no longer confirm is not a start worth counting: the clock
  // stops rather than running on from a stamp that may belong to a cook that
  // has ended.
  test('lets go of the start when a later read fails', async () => {
    jest.useFakeTimers();
    try {
      const backend = backendWithStart('2026-08-01T10:00:00.000Z');
      const { result } = renderCookStartHook(backend, true);

      await waitFor(() => expect(result.current).toEqual(new Date('2026-08-01T10:00:00.000Z')));

      backend.injectFault({ method: 'get', path: 'timeline/current', status: 500 });
      await act(async () => {
        jest.advanceTimersByTime(COOK_START_REFRESH_MS);
      });

      await waitFor(() => expect(result.current).toBeNull());
    } finally {
      jest.useRealTimers();
    }
  });

  // One outage is one message. The refresh keeps asking while the backend is
  // down, and a snackbar a minute about the same failure is noise the user
  // cannot act on.
  test('reports an outage once rather than on every refresh', async () => {
    jest.useFakeTimers();
    try {
      const backend = backendWithStart('2026-08-01T10:00:00.000Z');
      backend.injectFault({ method: 'get', path: 'timeline/current', status: 500 });
      renderCookStartHook(backend, true);

      await screen.findByText('Could not load the cook timer.');

      // The message times out, and the next refresh fails exactly as before.
      await act(async () => {
        jest.advanceTimersByTime(COOK_START_REFRESH_MS);
      });

      await waitFor(() =>
        expect(screen.queryByText('Could not load the cook timer.')).not.toBeInTheDocument()
      );
    } finally {
      jest.useRealTimers();
    }
  });

  // The snackbar outlives the screen that raised it, so a read that fails after
  // the user has walked away must not put a message about the cook timer on
  // whatever they are looking at now.
  test('says nothing about a screen the user has already left', async () => {
    const backend = backendWithStart('2026-08-01T10:00:00.000Z');
    backend.injectFault({ method: 'get', path: 'timeline/current', status: 500 });
    const client = createApiClient(backend);
    const Timer = (): null => {
      useCookStart(true);
      return null;
    };
    const { rerender } = render(
      <ApiClientProvider client={client}>
        <SnackbarProvider>
          <Timer />
        </SnackbarProvider>
      </ApiClientProvider>
    );

    // The user leaves the smoke step while the read is still in flight.
    rerender(
      <ApiClientProvider client={client}>
        <SnackbarProvider>{null}</SnackbarProvider>
      </ApiClientProvider>
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByText('Could not load the cook timer.')).not.toBeInTheDocument();
  });
});
