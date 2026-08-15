import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../../api';
import { createFakeBackend, FakeBackend } from '../../../api/fakeBackend';
import { Smoke } from '../../../api/types';
import { SmokeReview } from './smokeReview';

// The header, sections and ratings card are mocked so each rendered piece is
// observable as a data attribute; the screen's own job is to fetch the
// aggregate and hand each piece to the right part of the page. The fake client
// is injected through the provider instead of mocking five separate service
// modules.
jest.mock('./ReviewHeader', () => ({
  ReviewHeader: (props: any) => (
    <div
      data-testid="review-header"
      data-name={props.name}
      data-date={JSON.stringify(props.date)}
      data-startedat={JSON.stringify(props.startedAt)}
      data-overallrating={props.overallRating}
    />
  ),
}));
jest.mock('./PreSmokeSection', () => ({
  PreSmokeSection: ({ preSmoke, woodType }: any) => (
    <div
      data-testid="presmoke-section"
      data-presmoke={JSON.stringify(preSmoke)}
      data-woodtype={woodType}
    />
  ),
}));
jest.mock('./SmokeSection', () => ({
  SmokeSection: ({ smokeProfile, temps, timeline }: any) => (
    <div
      data-testid="smoke-section"
      data-smokeprofile={JSON.stringify(smokeProfile)}
      data-temps={JSON.stringify(temps)}
      data-timeline={JSON.stringify(timeline)}
    />
  ),
}));
jest.mock('./PostSmokeSection', () => ({
  PostSmokeSection: ({ postSmoke }: any) => (
    <div data-testid="postsmoke-section" data-postsmoke={JSON.stringify(postSmoke)} />
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
  test('loads the aggregate and hands each display piece to its section', async () => {
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
      timeline: {
        records: {
          'smoke-1': {
            startedAt: '2026-08-01T10:00:00.000Z',
            finishedAt: '2026-08-01T16:30:00.000Z',
            durationMs: 23400000,
            peakChamber: 268,
            peakMeat: 203,
            targetTemp: 203,
          },
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
        screen.getByTestId('presmoke-section').getAttribute('data-presmoke') ?? '{}'
      );
      expect(preSmoke.name).toBe('Brisket');
    });

    // The header gets the name, the day, the stamps and the overall score.
    const header = screen.getByTestId('review-header');
    expect(header.getAttribute('data-name')).toBe('Brisket');
    expect(JSON.parse(header.getAttribute('data-date') ?? 'null')).toBe('2023-07-15T00:00:00.000Z');
    expect(JSON.parse(header.getAttribute('data-startedat') ?? 'null')).toBe(
      '2026-08-01T10:00:00.000Z'
    );
    expect(header.getAttribute('data-overallrating')).toBe('4');

    // The pre-smoke section reads the wood from the profile.
    expect(screen.getByTestId('presmoke-section').getAttribute('data-woodtype')).toBe('Hickory');

    // The smoke section gets the profile, the cook and the derived timeline.
    const smokeSection = screen.getByTestId('smoke-section');
    expect(JSON.parse(smokeSection.getAttribute('data-smokeprofile') ?? '{}').chamberName).toBe(
      'My Chamber'
    );
    expect(JSON.parse(smokeSection.getAttribute('data-temps') ?? '[]')).toHaveLength(1);
    expect(JSON.parse(smokeSection.getAttribute('data-timeline') ?? 'null')?.targetTemp).toBe(203);

    expect(
      JSON.parse(screen.getByTestId('postsmoke-section').getAttribute('data-postsmoke') ?? '{}')
        .restTime
    ).toBe('30');
    expect(
      JSON.parse(screen.getByTestId('ratings-card').getAttribute('data-ratings') ?? '{}')
        .smokeFlavor
    ).toBe(4);
  });

  test('renders the empty-default temps and a null timeline when those pieces are absent', async () => {
    const backend = createFakeBackend({
      smoke: { records: { 'smoke-1': smokeAggregate('smoke-1') } },
      preSmoke: { records: { 'pre-smoke-1': { name: 'Brisket', weight: {}, steps: [] } } },
      // No temps and no timeline — the aggregate fills the empty default and a
      // null timeline, and the sections still render the rest of the review.
    });

    renderReview(backend, 'smoke-1');

    await waitFor(() => {
      const preSmoke = JSON.parse(
        screen.getByTestId('presmoke-section').getAttribute('data-presmoke') ?? '{}'
      );
      expect(preSmoke.name).toBe('Brisket');
    });

    const smokeSection = screen.getByTestId('smoke-section');
    expect(JSON.parse(smokeSection.getAttribute('data-temps') ?? '[]')).toEqual([]);
    expect(JSON.parse(smokeSection.getAttribute('data-timeline') ?? '"unset"')).toBeNull();
  });

  test('raises the failure snackbar when the smoke parent cannot be read', async () => {
    const backend = createFakeBackend({});

    renderReview(backend, 'missing-smoke');

    expect(await screen.findByText('Could not load smoke review.')).toBeVisible();
  });
});
