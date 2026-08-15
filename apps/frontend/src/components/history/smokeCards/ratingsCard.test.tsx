/**
 * The history detail's Ratings section: four half-step rating bars that
 * auto-save as they change, a transient "Ratings saved" flash, and the review
 * notes the backend stores with the scores.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import {
  ApiClientProvider,
  createApiClient,
  createFakeBackend,
  FakeBackend,
  rating,
  RecordedRequest,
} from '../../../api';
import { DesignSurface, appTheme } from '../../../theme';
import { RatingsCard } from './ratingsCard';

let backend: FakeBackend;

const storedRating: rating = {
  smokeFlavor: 8,
  seasoning: 7,
  tenderness: 9,
  overallTaste: 8.5,
  notes: 'Excellent smoke flavor',
  _id: 'rating-123',
};

/** The rating save writes: `POST ratings/:id`. */
const ratingSaves = (): RecordedRequest[] =>
  backend.requests.filter(r => r.method === 'post' && r.path.startsWith('ratings'));

const renderCard = (ratings: rating = storedRating): ReturnType<typeof render> =>
  render(
    <CssVarsProvider theme={appTheme} defaultMode="light">
      <DesignSurface>
        <ApiClientProvider client={createApiClient(backend)}>
          <RatingsCard ratings={ratings} />
        </ApiClientProvider>
      </DesignSurface>
    </CssVarsProvider>
  );

beforeEach(() => {
  backend = createFakeBackend({
    ratings: { records: { 'rating-123': storedRating } },
  });
});

describe('auto-saving a changed score', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /** Let the pending save round-trip (the fake backend resolves on microtasks). */
  const flushSave = async (): Promise<void> => act(async () => Promise.resolve());

  it('persists the new score the moment it changes', async () => {
    renderCard();

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Smoke Flavor' }), { key: 'ArrowUp' });
    await flushSave();

    expect(ratingSaves()).toHaveLength(1);
    expect(ratingSaves()[0].path).toBe('ratings/rating-123');
    expect(backend.store.ratings.records['rating-123'].smokeFlavor).toBe(8.5);
  });

  it('flashes "Ratings saved" once the save lands, then clears it', async () => {
    renderCard();
    expect(screen.queryByTestId('ratings-saved-flash')).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Overall Taste' }), { key: 'ArrowUp' });
    await flushSave();

    expect(screen.getByTestId('ratings-saved-flash')).toHaveTextContent('Ratings saved');

    act(() => {
      jest.runAllTimers();
    });
    expect(screen.queryByTestId('ratings-saved-flash')).not.toBeInTheDocument();
  });

  it('does not save, or flash, merely from being shown the stored rating', async () => {
    renderCard();
    await flushSave();

    expect(ratingSaves()).toHaveLength(0);
    expect(screen.queryByTestId('ratings-saved-flash')).not.toBeInTheDocument();
  });

  it('feeds the star displays: a re-read returns the overall taste just set', async () => {
    renderCard();

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Overall Taste' }), { key: 'ArrowUp' });
    await flushSave();

    // The history list's and detail header's stars draw from what the backend
    // returns for the rating — which is now the new score.
    const reread = createApiClient(backend).ratings.getById('rating-123');
    await act(async () => Promise.resolve());
    expect((await reread).overallTaste).toBe(9);
  });

  it('leaves a never-stored rating alone: nothing to update, nothing sent', async () => {
    const { _id, ...unstored } = storedRating;
    renderCard({ ...unstored, smokeFlavor: 0, seasoning: 0, tenderness: 0, overallTaste: 0 });

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Seasoning' }), { key: 'ArrowUp' });
    await flushSave();

    expect(ratingSaves()).toHaveLength(0);
  });
});

describe('the review notes', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const flushSave = async (): Promise<void> => act(async () => Promise.resolve());

  it('shows the notes stored with the rating', () => {
    renderCard();

    expect(screen.getByRole('textbox', { name: 'Review Notes' })).toHaveValue(
      'Excellent smoke flavor'
    );
  });

  it('persists an edit once the field is left, and confirms it saved', async () => {
    renderCard();
    const notes = screen.getByRole('textbox', { name: 'Review Notes' });

    fireEvent.change(notes, { target: { value: 'Would smoke again' } });
    fireEvent.blur(notes);
    await flushSave();

    expect(backend.store.ratings.records['rating-123'].notes).toBe('Would smoke again');
    expect(screen.getByTestId('ratings-saved-flash')).toBeInTheDocument();
  });

  it('does not re-save notes that were never edited', async () => {
    renderCard();
    const notes = screen.getByRole('textbox', { name: 'Review Notes' });

    fireEvent.focus(notes);
    fireEvent.blur(notes);
    await flushSave();

    expect(ratingSaves()).toHaveLength(0);
  });
});

describe('the Ratings section', () => {
  it('is the design section: a starred heading over four half-step bars', () => {
    renderCard();

    expect(screen.getByTestId('review-ratings-card')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ratings' })).toBeVisible();
    expect(screen.getByRole('slider', { name: 'Smoke Flavor' })).toHaveAttribute(
      'aria-valuenow',
      '8'
    );
    expect(screen.getByRole('slider', { name: 'Seasoning' })).toHaveAttribute('aria-valuenow', '7');
    expect(screen.getByRole('slider', { name: 'Tenderness' })).toHaveAttribute(
      'aria-valuenow',
      '9'
    );
    expect(screen.getByRole('slider', { name: 'Overall Taste' })).toHaveAttribute(
      'aria-valuenow',
      '8.5'
    );
  });

  it('shows each score out of ten, on the testids the journeys read', () => {
    renderCard();

    expect(screen.getByTestId('review-rating-overallTaste')).toHaveAttribute(
      'aria-valuenow',
      '8.5'
    );
    expect(screen.getByTestId('review-rating-overallTaste-value')).toHaveTextContent('8.5 / 10');
  });
});
