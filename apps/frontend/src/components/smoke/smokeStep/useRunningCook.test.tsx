import '@testing-library/jest-dom';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, createApiClient, SnackbarProvider } from '../../../api';
import {
  createFakeBackend,
  FakeBackend,
  NO_CURRENT_TIMELINE,
  StoredApplicationSettings,
} from '../../../api/fakeBackend';
import { RUNNING_COOK_REFRESH_MS, useRunningCook } from './useRunningCook';

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

const renderCook = (backend: FakeBackend, smoking = true) => {
  const client = createApiClient(backend);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ApiClientProvider client={client}>
      <SnackbarProvider>{children}</SnackbarProvider>
    </ApiClientProvider>
  );
  return renderHook(({ isSmoking }: { isSmoking: boolean }) => useRunningCook(isSmoking), {
    wrapper,
    initialProps: { isSmoking: smoking },
  });
};

/** Every read of the running cook the backend has been asked for. */
const estimateReads = (backend: FakeBackend): number =>
  backend.requests.filter(request => request.path === 'timeline/current').length;

describe('the running cook’s estimate', () => {
  test('reads the estimate, and names the probe it is being taken to', async () => {
    const { result } = renderCook(runningCook());

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

    const { result } = renderCook(backend);

    await waitFor(() => expect(estimateReads(backend)).toBeGreaterThan(0));
    expect(result.current.probe).toBeNull();
  });
});

describe('when the backend cannot be reached', () => {
  test('the estimate is nothing rather than a stale answer', async () => {
    const backend = runningCook();
    backend.injectFault({ method: 'get', path: 'timeline/current', status: 500 });

    const { result } = renderCook(backend);

    await waitFor(() => expect(estimateReads(backend)).toBeGreaterThan(0));
    // An estimate that cannot be confirmed is not one to keep showing: the card
    // renders the absence as an em-dash, which is honest, where an ETA left on
    // screen from ten minutes ago is not.
    expect(result.current.estimate).toBeNull();
    // The probe is still known, because the settings read succeeded.
    await waitFor(() => expect(result.current.probe).not.toBeNull());
  });

  test('says so when the running cook cannot be read', async () => {
    const backend = runningCook();
    backend.injectFault({ method: 'get', path: 'timeline/current', status: 500 });

    const { result } = renderCook(backend);

    expect(await screen.findByText('Could not load the cook timer.')).toBeInTheDocument();
    expect(result.current.startedAt).toBeNull();
  });

  /**
   * A settings read that dropped says nothing about which probe is being
   * watched. Reading it as "none" would take the target editor and the progress
   * bar off the card for a whole minute — until the next refresh — over one
   * failed request, while the estimate beside them carried on answering.
   */
  test('a settings read that fails leaves the watched probe as it was', async () => {
    jest.useFakeTimers();
    try {
      const backend = runningCook();
      const { result } = renderCook(backend);

      await waitFor(() =>
        expect(result.current.probe).toEqual({ slot: 'probe1', name: 'Brisket' })
      );

      backend.injectFault({ method: 'get', path: 'appSettings', status: 500 });
      await act(async () => {
        jest.advanceTimersByTime(RUNNING_COOK_REFRESH_MS);
      });

      await waitFor(() => expect(estimateReads(backend)).toBe(2));
      expect(result.current.probe).toEqual({ slot: 'probe1', name: 'Brisket' });
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
      const backend = runningCook();
      backend.injectFault({ method: 'get', path: 'timeline/current', status: 500 });
      renderCook(backend);

      await screen.findByText('Could not load the cook timer.');

      // The message times out, and the next refresh fails exactly as before.
      await act(async () => {
        jest.advanceTimersByTime(RUNNING_COOK_REFRESH_MS);
      });

      await waitFor(() =>
        expect(screen.queryByText('Could not load the cook timer.')).not.toBeInTheDocument()
      );
    } finally {
      jest.useRealTimers();
    }
  });

  // The snackbar outlives the screen that raised it, so a read that fails after
  // the user has walked away must not put a message about the cook on whatever
  // they are looking at now.
  test('says nothing about a screen the user has already left', async () => {
    const backend = runningCook();
    backend.injectFault({ method: 'get', path: 'timeline/current', status: 500 });
    const client = createApiClient(backend);
    const Cook = (): null => {
      useRunningCook(true);
      return null;
    };
    const { rerender } = render(
      <ApiClientProvider client={client}>
        <SnackbarProvider>
          <Cook />
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

/**
 * The elapsed clock's one input, read from the server rather than remembered in
 * the browser: the stamp is a fact about the cook, so a phone that reloads, or
 * is picked up six hours in, shows the cook's real age instead of starting again
 * from zero. It comes off the same read as the estimate, because the backend
 * answers them together.
 */
describe('the start of the cook', () => {
  test('is the stamp the backend recorded for the cook that is set up', async () => {
    const { result } = renderCook(runningCook());

    await waitFor(() =>
      expect(result.current.startedAt).toEqual(new Date('2026-08-01T10:00:00.000Z'))
    );
  });

  test('is nothing while no session is set up', async () => {
    const backend = createFakeBackend({ state: { smokeId: '', smoking: false } });

    const { result } = renderCook(backend, false);

    await waitFor(() => expect(estimateReads(backend)).toBeGreaterThan(0));
    expect(result.current.startedAt).toBeNull();
  });

  test('is re-read when smoking is switched on, so the stamp just written is picked up', async () => {
    const backend = runningCook();
    backend.store.timeline.current.startedAt = null;
    const { result, rerender } = renderCook(backend, false);

    await waitFor(() => expect(result.current.startedAt).toBeNull());

    // The backend stamps the start as smoking is switched on.
    backend.store.timeline.current.startedAt = '2026-08-01T10:00:00.000Z';
    rerender({ isSmoking: true });

    await waitFor(() =>
      expect(result.current.startedAt).toEqual(new Date('2026-08-01T10:00:00.000Z'))
    );
  });

  /**
   * The cook can end anywhere: the touchscreen presses Finish, or another
   * client clears the session. Neither moves this screen's smoking flag — it
   * may already be false — so nothing about the props changes, and a start read
   * once and never again would leave the bar counting a cook that is over.
   */
  test('is dropped when the cook is finished somewhere else', async () => {
    jest.useFakeTimers();
    try {
      const backend = runningCook();
      const { result } = renderCook(backend, false);

      await waitFor(() =>
        expect(result.current.startedAt).toEqual(new Date('2026-08-01T10:00:00.000Z'))
      );

      // The touchscreen finishes the cook: the backend session is cleared, and
      // the running-cook route answers with a cook of nothing.
      backend.store.state = { smokeId: '', smoking: false };
      backend.store.timeline.current = { ...NO_CURRENT_TIMELINE };
      await act(async () => {
        jest.advanceTimersByTime(RUNNING_COOK_REFRESH_MS);
      });

      await waitFor(() => expect(result.current.startedAt).toBeNull());
    } finally {
      jest.useRealTimers();
    }
  });

  // A start we can no longer confirm is not a start worth counting: the clock
  // stops rather than running on from a stamp that may belong to a cook that
  // has ended.
  test('is let go of when a later read fails', async () => {
    jest.useFakeTimers();
    try {
      const backend = runningCook();
      const { result } = renderCook(backend);

      await waitFor(() =>
        expect(result.current.startedAt).toEqual(new Date('2026-08-01T10:00:00.000Z'))
      );

      backend.injectFault({ method: 'get', path: 'timeline/current', status: 500 });
      await act(async () => {
        jest.advanceTimersByTime(RUNNING_COOK_REFRESH_MS);
      });

      await waitFor(() => expect(result.current.startedAt).toBeNull());
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('when the estimate is re-read', () => {
  test('again the moment the smoker is lit or put out', async () => {
    const backend = runningCook();
    const { rerender } = renderCook(backend, false);

    await waitFor(() => expect(estimateReads(backend)).toBe(1));

    // Switching smoking is what suspends and resumes the estimate, and the
    // backend knows before this screen does.
    rerender({ isSmoking: true });

    await waitFor(() => expect(estimateReads(backend)).toBe(2));
  });

  test('again the moment the target is edited', async () => {
    const backend = runningCook();
    const { result } = renderCook(backend);

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
      renderCook(backend);

      await waitFor(() => expect(estimateReads(backend)).toBe(1));

      // Half a cadence in, the backend has been asked exactly once: the screen
      // does not poll the cook every render or every second.
      await act(async () => {
        jest.advanceTimersByTime(RUNNING_COOK_REFRESH_MS / 2);
      });
      expect(estimateReads(backend)).toBe(1);

      await act(async () => {
        jest.advanceTimersByTime(RUNNING_COOK_REFRESH_MS / 2);
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
    const { result } = renderCook(backend);

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
    const { result } = renderCook(backend);

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
    const { result } = renderCook(backend);

    await waitFor(() => expect(result.current.probe).not.toBeNull());

    await act(async () => {
      result.current.setTarget(195);
    });

    expect(await screen.findByText('Could not save the target temperature.')).toBeInTheDocument();
  });

  test('answers the plan the backend judged this cook against', async () => {
    const backend = runningCook();
    backend.store.timeline.current.servePlan = {
      serveAt: '2026-08-01T22:00:00.000Z',
      restMinutes: 45,
      pullBy: '2026-08-01T21:15:00.000Z',
      slackMinutes: 20,
      verdict: 'ontrack',
      milestones: [{ kind: 'pullBy', at: '2026-08-01T21:15:00.000Z', temp: null }],
    };
    const { result } = renderCook(backend);

    // Read from the timeline this screen already polls: the plan and the
    // estimate it is judged against come off one request, not two.
    await waitFor(() => expect(result.current.servePlan?.verdict).toBe('ontrack'));
    expect(result.current.servePlan?.serveAt).toEqual(new Date('2026-08-01T22:00:00.000Z'));
    expect(estimateReads(backend)).toBe(1);
  });

  test('re-reads the cook when something it does not own asks it to', async () => {
    const backend = runningCook();
    const { result } = renderCook(backend);

    await waitFor(() => expect(estimateReads(backend)).toBe(1));

    await act(async () => {
      result.current.refresh();
    });

    // A plan just written is not the plan on screen until the backend has
    // judged it again, so whoever wrote one can ask for that read.
    await waitFor(() => expect(estimateReads(backend)).toBe(2));
  });
});
