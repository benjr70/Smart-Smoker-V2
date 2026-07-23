import '@testing-library/jest-dom';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider } from './ApiClientProvider';
import { createApiClient } from './client';
import { createFakeBackend, FakeBackend } from './fakeBackend';
import { SnackbarProvider } from './SnackbarProvider';
import { Smoke, SmokeHistory } from './types';
import { useHistory } from './useHistory';

const historyRow = (smokeId: string, name: string): SmokeHistory => ({
  name,
  meatType: 'Brisket',
  weight: '12',
  weightUnit: 'lbs',
  woodType: 'Hickory',
  date: '2023-07-15',
  smokeId,
  overAllRating: '5',
});

const smokeAggregate = (id: string): Smoke => ({
  _id: id,
  preSmokeId: `pre-${id}`,
  tempsId: `temps-${id}`,
  postSmokeId: `post-${id}`,
  smokeProfileId: `profile-${id}`,
  ratingId: `rating-${id}`,
  date: new Date('2023-07-15'),
  status: 1,
});

const renderHistoryHook = (backend: FakeBackend) => {
  const client = createApiClient(backend);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ApiClientProvider client={client}>
      <SnackbarProvider>{children}</SnackbarProvider>
    </ApiClientProvider>
  );
  return renderHook(() => useHistory(), { wrapper });
};

describe('useHistory', () => {
  test('lists the seeded smokes newest-first', async () => {
    const backend = createFakeBackend({
      history: [historyRow('smoke-1', 'Oldest'), historyRow('smoke-2', 'Newest')],
    });

    const { result } = renderHistoryHook(backend);

    await waitFor(() => expect(result.current.history).toHaveLength(2));
    // The backend returns rows oldest-first; the hook reverses them so the most
    // recent smoke renders at the top of the list.
    expect(result.current.history[0].name).toBe('Newest');
    expect(result.current.history[1].name).toBe('Oldest');
  });

  test('yields an empty list and raises the snackbar when the history read fails', async () => {
    const backend = createFakeBackend({ history: [historyRow('smoke-1', 'Brisket')] });
    backend.injectFault({ method: 'get', path: 'history', status: 500 });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ApiClientProvider client={createApiClient(backend)}>
        <SnackbarProvider>{children}</SnackbarProvider>
      </ApiClientProvider>
    );
    const { result } = renderHook(() => useHistory(), { wrapper });

    // The screen must survive a failed fetch: no thrown render error, an empty
    // list, and the failure snackbar raised.
    await waitFor(() => expect(screen.getByText('Could not load smoke history.')).toBeVisible());
    expect(result.current.history).toEqual([]);
  });

  test('removing a smoke deletes its parent and children and drops it from the refreshed list', async () => {
    const backend = createFakeBackend({
      history: [historyRow('smoke-1', 'Brisket'), historyRow('smoke-2', 'Pork')],
      smoke: { records: { 'smoke-1': smokeAggregate('smoke-1') } },
      preSmoke: { records: { 'pre-smoke-1': { weight: {}, steps: [] } } },
      smokeProfile: {
        records: {
          'profile-smoke-1': {
            chamberName: 'Chamber',
            probe1Name: 'Probe 1',
            probe2Name: 'Probe 2',
            probe3Name: 'Probe 3',
            notes: '',
            woodType: '',
          },
        },
      },
      temps: { records: { 'temps-smoke-1': [] } },
      postSmoke: { records: { 'post-smoke-1': { restTime: '', steps: [] } } },
      ratings: {
        records: {
          'rating-smoke-1': {
            smokeFlavor: 0,
            seasoning: 0,
            tenderness: 0,
            overallTaste: 0,
            notes: '',
          },
        },
      },
    });

    const { result } = renderHistoryHook(backend);
    await waitFor(() => expect(result.current.history).toHaveLength(2));

    await act(async () => {
      await result.current.remove('smoke-1');
    });

    // The parent and all five children are gone from the store.
    expect(backend.store.smoke.records['smoke-1']).toBeUndefined();
    expect(backend.store.preSmoke.records['pre-smoke-1']).toBeUndefined();
    expect(backend.store.smokeProfile.records['profile-smoke-1']).toBeUndefined();
    expect(backend.store.temps.records['temps-smoke-1']).toBeUndefined();
    expect(backend.store.postSmoke.records['post-smoke-1']).toBeUndefined();
    expect(backend.store.ratings.records['rating-smoke-1']).toBeUndefined();
    // The refreshed list no longer contains the deleted smoke.
    expect(result.current.history.map(row => row.smokeId)).toEqual(['smoke-2']);
  });

  test('a mid-cascade delete failure raises the snackbar and leaves the parent in the refreshed list', async () => {
    const backend = createFakeBackend({
      history: [historyRow('smoke-1', 'Brisket'), historyRow('smoke-2', 'Pork')],
      smoke: { records: { 'smoke-1': smokeAggregate('smoke-1') } },
    });
    // A child delete fails: the client deletes the parent last, so the parent
    // (and its history row) survives and the operation stays retryable.
    backend.injectFault({ method: 'delete', path: 'presmoke/pre-smoke-1', status: 500 });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ApiClientProvider client={createApiClient(backend)}>
        <SnackbarProvider>{children}</SnackbarProvider>
      </ApiClientProvider>
    );
    const { result } = renderHook(() => useHistory(), { wrapper });
    await waitFor(() => expect(result.current.history).toHaveLength(2));

    await act(async () => {
      await result.current.remove('smoke-1');
    });

    expect(screen.getByText('Could not delete smoke.')).toBeVisible();
    expect(backend.store.smoke.records['smoke-1']).toBeDefined();
    // Newest-first: the surviving parent is still present in the refreshed list.
    expect(result.current.history.map(row => row.smokeId)).toEqual(['smoke-2', 'smoke-1']);
  });
});
