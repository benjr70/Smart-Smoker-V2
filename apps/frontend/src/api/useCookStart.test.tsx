import '@testing-library/jest-dom';
import { renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider } from './ApiClientProvider';
import { createApiClient } from './client';
import { createFakeBackend, FakeBackend } from './fakeBackend';
import { SnackbarProvider } from './SnackbarProvider';
import { useCookStart } from './useCookStart';

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
    timeline: {
      records: {
        'smoke-1': {
          startedAt,
          finishedAt: null,
          durationMs: null,
          peakChamber: null,
          peakMeat: null,
          targetTemp: null,
        },
      },
    },
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
    backend.store.timeline['smoke-1'].startedAt = '2026-08-01T10:00:00.000Z';
    rerender({ isSmoking: true });

    await waitFor(() => expect(result.current).toEqual(new Date('2026-08-01T10:00:00.000Z')));
  });

  test('says so when the cook timer cannot be read', async () => {
    const backend = backendWithStart('2026-08-01T10:00:00.000Z');
    backend.injectFault({ method: 'get', path: 'timeline/smoke-1', status: 500 });

    const { result } = renderCookStartHook(backend, true);

    expect(await screen.findByText('Could not load the cook timer.')).toBeInTheDocument();
    expect(result.current).toBeNull();
  });
});
