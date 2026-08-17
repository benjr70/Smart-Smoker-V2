import '@testing-library/jest-dom';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, createApiClient, SnackbarProvider } from '../../../api';
import {
  createFakeBackend,
  FakeBackend,
  NO_CURRENT_TIMELINE,
  StoredApplicationSettings,
} from '../../../api/fakeBackend';
import { COMPLETION_ESTIMATE_REFRESH_MS, useCompletionEstimate } from './useCompletionEstimate';

/** A settings document watching the given probes at the given temperatures. */
const settingsWatching = (watched: Record<string, number>): Partial<StoredApplicationSettings> => ({
  probeTarget: {
    enabled: true,
    probes: ['probe1', 'probe2', 'probe3'].map(slot => ({
      slot,
      enabled: watched[slot] !== undefined,
      target: watched[slot] ?? 203,
      targetSource: watched[slot] === undefined ? ('default' as const) : ('user' as const),
    })),
  },
});

/** A backend with a cook running, watched on probe 1, half way to 203°F. */
const runningCook = (): FakeBackend =>
  createFakeBackend({
    state: { smokeId: 'smoke-1', smoking: true },
    appSettings: { settings: settingsWatching({ probe1: 203 }) },
    smokeProfile: {
      current: {
        chamberName: 'Chamber',
        probe1Name: 'Brisket',
        probe2Name: 'probe 2',
        probe3Name: 'probe 3',
        notes: '',
        woodType: '',
      },
    },
    timeline: {
      current: {
        ...NO_CURRENT_TIMELINE,
        startedAt: '2026-08-01T10:00:00.000Z',
        estimate: {
          state: 'ok',
          eta: '2026-08-01T18:30:00.000Z',
          hoursRemaining: 2.5,
          ratePerHour: 8.2,
          progressPercent: 62,
          startTemp: 45,
          targetTemp: 203,
        },
      },
    },
  });

const renderEstimate = (backend: FakeBackend, smoking = true) => {
  const client = createApiClient(backend);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ApiClientProvider client={client}>
      <SnackbarProvider>{children}</SnackbarProvider>
    </ApiClientProvider>
  );
  return renderHook(({ isSmoking }: { isSmoking: boolean }) => useCompletionEstimate(isSmoking), {
    wrapper,
    initialProps: { isSmoking: smoking },
  });
};

/** Every read of the running cook the backend has been asked for. */
const estimateReads = (backend: FakeBackend): number =>
  backend.requests.filter(request => request.path === 'timeline/current').length;

describe('the running cook’s estimate', () => {
  test('reads the estimate, and names the probe it is being taken to', async () => {
    const { result } = renderEstimate(runningCook());

    await waitFor(() => expect(result.current.estimate?.state).toBe('ok'));
    expect(result.current.estimate?.targetTemp).toBe(203);
    // The name is the one the cook gave the probe, resolved by the backend —
    // "Brisket reached 203°F" is only worth saying with the meat's own name in
    // it.
    expect(result.current.probe).toEqual({ slot: 'probe1', name: 'Brisket' });
  });

  test('has no probe to point at when nothing is being watched', async () => {
    const backend = createFakeBackend({
      state: { smokeId: 'smoke-1', smoking: true },
      appSettings: { settings: settingsWatching({}) },
    });

    const { result } = renderEstimate(backend);

    await waitFor(() => expect(estimateReads(backend)).toBeGreaterThan(0));
    expect(result.current.probe).toBeNull();
  });
});

describe('when the backend cannot be reached', () => {
  test('the estimate is nothing rather than a stale answer', async () => {
    const backend = runningCook();
    backend.injectFault({ method: 'get', path: 'timeline/current', status: 500 });

    const { result } = renderEstimate(backend);

    await waitFor(() => expect(estimateReads(backend)).toBeGreaterThan(0));
    // An estimate that cannot be confirmed is not one to keep showing: the card
    // renders the absence as an em-dash, which is honest, where an ETA left on
    // screen from ten minutes ago is not.
    expect(result.current.estimate).toBeNull();
    // The probe is still known, because the settings read succeeded.
    await waitFor(() => expect(result.current.probe).not.toBeNull());
  });
});

describe('when the estimate is re-read', () => {
  test('again the moment the smoker is lit or put out', async () => {
    const backend = runningCook();
    const { rerender } = renderEstimate(backend, false);

    await waitFor(() => expect(estimateReads(backend)).toBe(1));

    // Switching smoking is what suspends and resumes the estimate, and the
    // backend knows before this screen does.
    rerender({ isSmoking: true });

    await waitFor(() => expect(estimateReads(backend)).toBe(2));
  });

  test('again the moment the target is edited', async () => {
    const backend = runningCook();
    const { result } = renderEstimate(backend);

    await waitFor(() => expect(estimateReads(backend)).toBe(1));

    await act(async () => {
      result.current.setTarget(195);
    });

    // The estimate is taken to the target that was just changed, so the answer
    // on screen is stale the instant the write lands.
    await waitFor(() => expect(estimateReads(backend)).toBe(2));
  });

  test('on the cadence the running cook is already polled at, and no faster', async () => {
    jest.useFakeTimers();
    try {
      const backend = runningCook();
      renderEstimate(backend);

      await waitFor(() => expect(estimateReads(backend)).toBe(1));

      // Half a cadence in, the backend has been asked exactly once: the screen
      // does not poll the cook every render or every second.
      await act(async () => {
        jest.advanceTimersByTime(COMPLETION_ESTIMATE_REFRESH_MS / 2);
      });
      expect(estimateReads(backend)).toBe(1);

      await act(async () => {
        jest.advanceTimersByTime(COMPLETION_ESTIMATE_REFRESH_MS / 2);
      });
      await waitFor(() => expect(estimateReads(backend)).toBe(2));
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('editing the target', () => {
  test('writes the watched probe’s target to the settings the settings screen edits', async () => {
    const backend = runningCook();
    const { result } = renderEstimate(backend);

    await waitFor(() => expect(result.current.probe).not.toBeNull());

    await act(async () => {
      result.current.setTarget(195);
    });

    await waitFor(() =>
      expect(backend.store.appSettings?.probeTarget?.probes?.[0]).toMatchObject({
        slot: 'probe1',
        target: 195,
        // A temperature somebody typed is theirs, and the row has to say so, or
        // the backend seeds over it the next time a cook is set up.
        targetSource: 'user',
      })
    );
    // Only the watched probe moves; the rows beside it are left as they were.
    expect(backend.store.appSettings?.probeTarget?.probes?.[1]?.target).toBe(203);
  });

  test('leaves the alert settings alone but for the target', async () => {
    const backend = runningCook();
    const { result } = renderEstimate(backend);

    await waitFor(() => expect(result.current.probe).not.toBeNull());

    await act(async () => {
      result.current.setTarget(195);
    });

    await waitFor(() => expect(backend.store.appSettings?.probeTarget?.enabled).toBe(true));
    expect(backend.store.appSettings?.probeTarget?.probes?.[0]?.enabled).toBe(true);
  });

  test('says so when the target could not be saved', async () => {
    const backend = runningCook();
    backend.injectFault({ method: 'post', path: 'appSettings', status: 500 });
    const { result } = renderEstimate(backend);

    await waitFor(() => expect(result.current.probe).not.toBeNull());

    await act(async () => {
      result.current.setTarget(195);
    });

    expect(await screen.findByText('Could not save the target temperature.')).toBeInTheDocument();
  });
});
