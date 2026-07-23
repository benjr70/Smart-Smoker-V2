import '@testing-library/jest-dom';
import { renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider } from './ApiClientProvider';
import { createApiClient } from './client';
import { createFakeBackend, FakeBackend } from './fakeBackend';
import { SnackbarProvider } from './SnackbarProvider';
import { Smoke } from './types';
import { useReview } from './useReview';

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

const renderReviewHook = (backend: FakeBackend, smokeId: string) => {
  const client = createApiClient(backend);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ApiClientProvider client={client}>
      <SnackbarProvider>{children}</SnackbarProvider>
    </ApiClientProvider>
  );
  return renderHook(() => useReview(smokeId), { wrapper });
};

describe('useReview', () => {
  test('returns all five display pieces from a seeded backend, defaulting a missing child', async () => {
    const backend = createFakeBackend({
      smoke: { records: { 'smoke-1': smokeAggregate('smoke-1') } },
      preSmoke: { records: { 'pre-smoke-1': { name: 'Brisket', weight: {}, steps: ['Trim'] } } },
      smokeProfile: {
        records: {
          'profile-smoke-1': {
            chamberName: 'My Chamber',
            probe1Name: 'Probe 1',
            probe2Name: 'Probe 2',
            probe3Name: 'Probe 3',
            notes: 'profile notes',
            woodType: 'Hickory',
          },
        },
      },
      // No temps record seeded — the aggregate fills the empty default.
      postSmoke: { records: { 'post-smoke-1': { restTime: '30', steps: ['Rest'] } } },
      ratings: {
        records: {
          'rating-smoke-1': {
            smokeFlavor: 4,
            seasoning: 5,
            tenderness: 3,
            overallTaste: 4,
            notes: 'tasty',
          },
        },
      },
    });

    const { result } = renderReviewHook(backend, 'smoke-1');

    await waitFor(() => expect(result.current.preSmoke.name).toBe('Brisket'));
    // The four present children load...
    expect(result.current.smokeProfile.chamberName).toBe('My Chamber');
    expect(result.current.postSmoke.restTime).toBe('30');
    expect(result.current.rating.smokeFlavor).toBe(4);
    // ...and the absent temps piece is the empty default, not undefined.
    expect(result.current.temps).toEqual([]);
  });

  test('raises the snackbar and keeps defaults when the smoke parent is missing', async () => {
    const backend = createFakeBackend({});

    renderReviewHook(backend, 'missing-smoke');

    await waitFor(() => expect(screen.getByText('Could not load smoke review.')).toBeVisible());
  });
});
