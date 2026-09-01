import '@testing-library/jest-dom';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import {
  ApiClientProvider,
  CompletionEstimate,
  ServePlanStatus,
  Smoke,
  TransportPort,
  createApiClient,
  SnackbarProvider,
} from '../../../api';
import { createFakeBackend, FakeBackend } from '../../../api/fakeBackend';
import { useServePlan } from './useServePlan';

/** A cook set up on the backend, so a plan written against it has somewhere to go. */
const backendWithCook = (record: Partial<Smoke> = {}): FakeBackend =>
  createFakeBackend({
    state: { smokeId: 'smoke-1', smoking: true },
    smoke: {
      records: {
        'smoke-1': {
          _id: 'smoke-1',
          preSmokeId: 'pre-1',
          tempsId: 'temps-1',
          postSmokeId: 'post-1',
          smokeProfileId: 'prof-1',
          ratingId: 'rate-1',
          date: new Date('2026-08-01T10:00:00.000Z'),
          status: 0,
          ...record,
        },
      },
    },
  });

/** A plan the backend has already judged: a cook that is no longer unplanned. */
const judged = (): ServePlanStatus => ({
  serveAt: new Date('2026-08-01T22:00:00.000Z'),
  restMinutes: 30,
  pullBy: new Date('2026-08-01T21:30:00.000Z'),
  slackMinutes: 20,
  verdict: 'ontrack',
  milestones: [],
});

/** An estimate the plan can be worked back from: a real, trustworthy ETA. */
const estimateAt = (eta: string | null, state: CompletionEstimate['state'] = 'ok') =>
  ({
    state,
    eta: eta === null ? null : new Date(eta),
    hoursRemaining: 2.5,
    ratePerHour: 8.2,
    progressPercent: 62,
    startTemp: 45,
    targetTemp: 203,
  }) as CompletionEstimate;

const renderPlan = (
  backend: FakeBackend,
  props: Partial<Parameters<typeof useServePlan>[0]> = {},
  transport: TransportPort = backend
) => {
  const client = createApiClient(transport);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ApiClientProvider client={client}>
      <SnackbarProvider>{children}</SnackbarProvider>
    </ApiClientProvider>
  );
  return renderHook((current: Parameters<typeof useServePlan>[0]) => useServePlan(current), {
    wrapper,
    initialProps: {
      plan: null,
      estimate: estimateAt('2026-08-01T18:37:00.000Z'),
      refresh: jest.fn(),
      ...props,
    },
  });
};

/** Every plan the backend has been asked to store. */
const planWrites = (backend: FakeBackend) =>
  backend.requests.filter(request => request.path === 'smoke/current/serve-plan');

describe('the serve plan of the cook on screen', () => {
  test('seeds a plan from the first real estimate: the ETA, the rest, and half an hour', async () => {
    const backend = backendWithCook();

    renderPlan(backend);

    // 18:37 plus no stored rest plus the half-hour cushion is 19:07, which is a
    // quarter past seven once it is rounded up to the quarter-hours the plan is
    // made in.
    await waitFor(() => expect(planWrites(backend)).toHaveLength(1));
    expect(planWrites(backend)[0].body).toEqual({
      serveAt: new Date('2026-08-01T19:15:00.000Z'),
    });
    expect(backend.store.smoke.records['smoke-1'].serveAt).toEqual(
      new Date('2026-08-01T19:15:00.000Z')
    );
  });

  test('seeds once, however many times the cook is re-read before it lands', async () => {
    const backend = backendWithCook();
    const { rerender } = renderPlan(backend);

    await waitFor(() => expect(planWrites(backend)).toHaveLength(1));
    // The poll answers again — still no plan, because the write and the read
    // that confirms it are a round trip apart — and the estimate has moved.
    rerender({
      plan: null,
      estimate: estimateAt('2026-08-01T18:52:00.000Z'),
      refresh: jest.fn(),
    });
    rerender({
      plan: null,
      estimate: estimateAt('2026-08-01T19:02:00.000Z'),
      refresh: jest.fn(),
    });

    await waitFor(() => expect(planWrites(backend)).toHaveLength(1));
  });

  test('plans nothing from an estimate the backend does not stand behind', async () => {
    const backend = backendWithCook();

    renderPlan(backend, { estimate: estimateAt(null, 'warming') });

    await waitFor(() => expect(backend.requests.length).toBeGreaterThan(0));
    expect(planWrites(backend)).toHaveLength(0);
  });

  test('plans nothing at all with the planner switched off', async () => {
    const backend = backendWithCook();
    backend.store.appSettings = {
      servePlan: { enabled: false, driftAlert: true, driftMin: 30 },
    };
    const { result } = renderPlan(backend);

    await waitFor(() => expect(result.current.enabled).toBe(false));
    expect(planWrites(backend)).toHaveLength(0);
  });

  test('stores a moved serving time, and asks for the cook to be judged again', async () => {
    const backend = backendWithCook();
    const refresh = jest.fn();
    const { result } = renderPlan(backend, {
      plan: judged(),
      estimate: estimateAt('2026-08-01T18:37:00.000Z'),
      refresh,
    });

    await act(async () => {
      result.current.setServeAt(new Date('2026-08-01T22:15:00.000Z'));
    });

    expect(planWrites(backend)).toEqual([
      {
        method: 'put',
        path: 'smoke/current/serve-plan',
        body: { serveAt: new Date('2026-08-01T22:15:00.000Z') },
      },
    ]);
    // The verdict is the backend's, and the plan it judged has just changed.
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  test('stores a changed rest without touching the serving time', async () => {
    const backend = backendWithCook();
    const { result } = renderPlan(backend, {
      plan: judged(),
      estimate: estimateAt('2026-08-01T18:37:00.000Z'),
      refresh: jest.fn(),
    });

    await act(async () => {
      result.current.setRestMinutes(45);
    });

    expect(planWrites(backend)).toEqual([
      { method: 'put', path: 'smoke/current/serve-plan', body: { restMinutes: 45 } },
    ]);
    expect(backend.store.smoke.records['smoke-1'].serveAt).toBeUndefined();
  });

  test('seeds a plan around the rest the cook already has stored', async () => {
    // A rest written on its own — the touchscreen's Post-Smoke field and this
    // stepper are one value — with no serving time beside it. Seeding as
    // though the meat rested for nothing would put dinner an hour before the
    // plan the spec describes, and the backend would call the cook late the
    // moment it judged it.
    const backend = backendWithCook({ restMinutes: 60 });

    renderPlan(backend);

    // 18:37 plus the hour of rest plus the half-hour cushion is 20:07, and a
    // quarter past eight once it is rounded up to the plan's quarter-hours.
    await waitFor(() => expect(planWrites(backend)).toHaveLength(1));
    expect(planWrites(backend)[0].body).toEqual({
      serveAt: new Date('2026-08-01T20:15:00.000Z'),
    });
  });

  test('seeds again after a seed the backend refused', async () => {
    const backend = backendWithCook();
    let refused = false;
    const flaky: TransportPort = {
      ...backend,
      put: <T,>(path: string, body?: unknown): Promise<T> => {
        if (path === 'smoke/current/serve-plan' && !refused) {
          refused = true;
          return Promise.reject(new Error('the backend was restarting'));
        }
        return backend.put<T>(path, body);
      },
    };
    const { rerender } = renderPlan(backend, {}, flaky);

    // The first seed was dropped, so the cook still has no plan when the next
    // poll answers — and a cook with no plan is one to seed.
    await waitFor(() => expect(screen.getByText('Could not save the serve plan.')).toBeTruthy());
    rerender({
      plan: null,
      estimate: estimateAt('2026-08-01T18:52:00.000Z'),
      refresh: jest.fn(),
    });

    await waitFor(() => expect(planWrites(backend)).toHaveLength(1));
    expect(planWrites(backend)[0].body).toEqual({
      serveAt: new Date('2026-08-01T19:30:00.000Z'),
    });
  });

  test('stores what was tapped in the order it was tapped', async () => {
    const backend = backendWithCook();
    const { result } = renderPlan(backend, {
      plan: judged(),
      estimate: estimateAt('2026-08-01T18:37:00.000Z'),
      refresh: jest.fn(),
    });

    // Two taps inside one round trip: the second must not overtake the first,
    // or the plan stored last is not the plan tapped last.
    await act(async () => {
      result.current.setServeAt(new Date('2026-08-01T22:15:00.000Z'));
      result.current.setServeAt(new Date('2026-08-01T22:30:00.000Z'));
      await Promise.resolve();
    });

    await waitFor(() => expect(planWrites(backend)).toHaveLength(2));
    expect(planWrites(backend).map(write => write.body)).toEqual([
      { serveAt: new Date('2026-08-01T22:15:00.000Z') },
      { serveAt: new Date('2026-08-01T22:30:00.000Z') },
    ]);
    expect(backend.store.smoke.records['smoke-1'].serveAt).toEqual(
      new Date('2026-08-01T22:30:00.000Z')
    );
  });

  test('starts a plan on request when no estimate is trustworthy yet', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T14:02:00.000Z'));
    try {
      const backend = backendWithCook({ restMinutes: 30 });
      const { result } = renderPlan(backend, { estimate: estimateAt(null, 'warming') });

      await act(async () => {
        await result.current.createPlan();
      });

      // Now, plus the stored rest, plus the cushion — the seed's own formula,
      // with the moment nobody can project replaced by the moment it is.
      await waitFor(() => expect(planWrites(backend)).toHaveLength(1));
      expect(planWrites(backend)[0].body).toEqual({
        serveAt: new Date('2026-08-01T15:15:00.000Z'),
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test('says so when the plan could not be stored', async () => {
    const backend = backendWithCook();
    backend.injectFault({ method: 'put', path: 'smoke/current/serve-plan', status: 500 });
    const { result } = renderPlan(backend, {
      plan: judged(),
      estimate: estimateAt('2026-08-01T18:37:00.000Z'),
      refresh: jest.fn(),
    });

    await act(async () => {
      result.current.setRestMinutes(45);
    });

    expect(await screen.findByText('Could not save the serve plan.')).toBeInTheDocument();
  });
});
