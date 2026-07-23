import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../../api';
import { createFakeBackend, FakeBackend } from '../../../api/fakeBackend';
import { Smoke } from '../../../api/types';
import { SmokeReview } from './smokeReview';

// The card children are mocked so each rendered piece is observable as a data
// attribute; the screen's own job is to fetch the aggregate and hand each piece
// to the right card. The fake client is injected through the provider instead
// of mocking five separate service modules.
jest.mock('../smokeCards/preSmokeCard', () => ({
  PreSmokeCard: ({ preSmoke }: any) => (
    <div data-testid="pre-smoke-card" data-presmoke={JSON.stringify(preSmoke)} />
  ),
}));
jest.mock('../smokeCards/smokeProfileCard', () => ({
  SmokeProfileCard: ({ smokeProfile, temps }: any) => (
    <div
      data-testid="smoke-profile-card"
      data-smokeprofile={JSON.stringify(smokeProfile)}
      data-temps={JSON.stringify(temps)}
    />
  ),
}));
jest.mock('../smokeCards/postSmokeCard', () => ({
  PostSmokeCard: ({ postSmoke }: any) => (
    <div data-testid="post-smoke-card" data-postsmoke={JSON.stringify(postSmoke)} />
  ),
}));
jest.mock('../smokeCards/ratingsCard', () => ({
  RatingsCard: ({ ratings }: any) => (
    <div data-testid="ratings-card" data-ratings={JSON.stringify(ratings)} />
  ),
}));

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

const renderReview = (backend: FakeBackend, smokeId: string) => {
  const client = createApiClient(backend);
  return render(
    <ApiClientProvider client={client}>
      <SnackbarProvider>
        <SmokeReview smokeId={smokeId} />
      </SnackbarProvider>
    </ApiClientProvider>
  );
};

describe('SmokeReview', () => {
  test('loads the aggregate and hands each display piece to its card', async () => {
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
            notes: '',
            woodType: 'Hickory',
          },
        },
      },
      temps: {
        records: {
          'temps-smoke-1': [
            { ChamberTemp: 225, MeatTemp: 150, Meat2Temp: 0, Meat3Temp: 0, date: new Date() },
          ],
        },
      },
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

    renderReview(backend, 'smoke-1');

    await waitFor(() => {
      const preSmoke = JSON.parse(
        screen.getByTestId('pre-smoke-card').getAttribute('data-presmoke') ?? '{}'
      );
      expect(preSmoke.name).toBe('Brisket');
    });

    const profileCard = screen.getByTestId('smoke-profile-card');
    expect(JSON.parse(profileCard.getAttribute('data-smokeprofile') ?? '{}').chamberName).toBe(
      'My Chamber'
    );
    expect(JSON.parse(profileCard.getAttribute('data-temps') ?? '[]')).toHaveLength(1);
    expect(
      JSON.parse(screen.getByTestId('post-smoke-card').getAttribute('data-postsmoke') ?? '{}')
        .restTime
    ).toBe('30');
    expect(
      JSON.parse(screen.getByTestId('ratings-card').getAttribute('data-ratings') ?? '{}')
        .smokeFlavor
    ).toBe(4);
  });

  test('renders the empty-default temps when the temps piece is absent', async () => {
    const backend = createFakeBackend({
      smoke: { records: { 'smoke-1': smokeAggregate('smoke-1') } },
      preSmoke: { records: { 'pre-smoke-1': { name: 'Brisket', weight: {}, steps: [] } } },
      // No temps record — the aggregate fills the empty default and the profile
      // card still renders the rest of the review.
    });

    renderReview(backend, 'smoke-1');

    await waitFor(() => {
      const preSmoke = JSON.parse(
        screen.getByTestId('pre-smoke-card').getAttribute('data-presmoke') ?? '{}'
      );
      expect(preSmoke.name).toBe('Brisket');
    });

    expect(
      JSON.parse(screen.getByTestId('smoke-profile-card').getAttribute('data-temps') ?? '[]')
    ).toEqual([]);
  });

  test('raises the failure snackbar when the smoke parent cannot be read', async () => {
    const backend = createFakeBackend({});

    renderReview(backend, 'missing-smoke');

    expect(await screen.findByText('Could not load smoke review.')).toBeVisible();
  });
});
