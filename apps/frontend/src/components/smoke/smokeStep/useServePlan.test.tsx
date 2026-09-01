import '@testing-library/jest-dom';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import {
  ApiClientProvider,
  CompletionEstimate,
  ServePlanStatus,
  createApiClient,
  SnackbarProvider,
} from '../../../api';
import { createFakeBackend, FakeBackend } from '../../../api/fakeBackend';
import { useServePlan } from './useServePlan';

/** A cook set up on the backend, so a plan written against it has somewhere to go. */
const backendWithCook = (): FakeBackend =>
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
  props: Partial<Parameters<typeof useServePlan>[0]> = {}
) => {
  const client = createApiClient(backend);
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
