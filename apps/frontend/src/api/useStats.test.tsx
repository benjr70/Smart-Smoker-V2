import '@testing-library/jest-dom';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider } from './ApiClientProvider';
import { createApiClient } from './client';
import { FakeBackend, createFakeBackend } from './fakeBackend';
import { SnackbarProvider } from './SnackbarProvider';
import { PreSmoke, Smoke } from './types';
import { useStats } from './useStats';

const completedCook = (id: string): Smoke => ({
  _id: id,
  preSmokeId: `pre-${id}`,
  tempsId: `temps-${id}`,
  postSmokeId: `post-${id}`,
  smokeProfileId: `profile-${id}`,
  ratingId: `rating-${id}`,
  date: new Date('2026-04-20T12:00:00Z'),
  status: 1,
});

const archive = (): FakeBackend =>
  createFakeBackend({
    smoke: { all: [completedCook('smoke-1')] },
    preSmoke: {
      records: {
        'pre-smoke-1': {
          name: 'Sunday brisket',
          meatType: 'Brisket',
          weight: { weight: 12, unit: 'LB' },
          steps: [],
          notes: '',
        } as unknown as PreSmoke,
      },
    },
    smokeProfile: { records: { 'profile-smoke-1': { woodType: 'Hickory' } } },
    postSmoke: { records: { 'post-smoke-1': { restTime: '01:00', steps: [] } } },
    timeline: {
      records: {
        'smoke-1': {
          startedAt: null,
          finishedAt: null,
          durationMs: 6 * 60 * 60 * 1000,
          peakChamber: null,
          peakMeat: null,
          targetTemp: null,
        },
      },
    },
  });

const renderStatsHook = (backend: FakeBackend) => {
  const client = createApiClient(backend);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ApiClientProvider client={client}>
      <SnackbarProvider>{children}</SnackbarProvider>
    </ApiClientProvider>
  );
  return renderHook(() => useStats(), { wrapper });
};

describe('useStats', () => {
  test('says it is still reading until the archive arrives', () => {
    const { result } = renderStatsHook(archive());

    expect(result.current.status).toBe('loading');
    expect(result.current.stats).toBeNull();
  });

  test('exposes the statistics the archive adds up to', async () => {
    const { result } = renderStatsHook(archive());

    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(result.current.stats?.totalSessions).toBe(1);
    expect(result.current.stats?.totalPounds).toBe(12);
    expect(result.current.stats?.totalCookMs).toBe(6 * 60 * 60 * 1000);
  });

  test('reports a failed read rather than an archive of nothing', async () => {
    const backend = archive();
    backend.injectFault({ method: 'get', path: 'stats', status: 503 });

    const { result } = renderStatsHook(backend);

    await waitFor(() => expect(result.current.status).toBe('failed'));
    // Null, not a zeroed shape: a screen must be able to tell "the read broke"
    // from "you have never finished a cook", which look identical in zeros.
    expect(result.current.stats).toBeNull();
  });

  test('re-reads the archive on request', async () => {
    const backend = archive();
    const { result } = renderStatsHook(backend);

    await waitFor(() => expect(result.current.status).toBe('loaded'));
    backend.store.smoke.all.push(completedCook('smoke-2'));
    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => expect(result.current.stats?.totalSessions).toBe(2));
  });
});
