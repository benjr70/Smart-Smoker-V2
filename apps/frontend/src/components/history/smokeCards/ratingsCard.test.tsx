/**
 * The history detail's Ratings section: four half-step rating bars and the
 * review notes, auto-saving as they change. A burst of changes (a drag, a
 * typing run) settles for {@link SAVE_DEBOUNCE_MS} and then saves once; the
 * transient "Ratings saved" flash confirms the save actually landed.
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
import { RatingsCard, SAVE_DEBOUNCE_MS } from './ratingsCard';

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

const renderCard = (
  ratings: rating = storedRating,
  transport: FakeBackend = backend
): ReturnType<typeof render> =>
  render(
    <CssVarsProvider theme={appTheme} defaultMode="light">
      <DesignSurface>
        <ApiClientProvider client={createApiClient(transport)}>
          <RatingsCard ratings={ratings} />
        </ApiClientProvider>
      </DesignSurface>
    </CssVarsProvider>
  );

beforeEach(() => {
  jest.useFakeTimers();
  backend = createFakeBackend({
    ratings: { records: { 'rating-123': storedRating } },
  });
});

afterEach(() => jest.useRealTimers());

/**
 * Let a burst of changes settle and its save round-trip: run out the debounce,
 * then the microtasks the fake backend resolves on.
 */
const settle = async (): Promise<void> =>
  act(async () => {
    jest.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    await Promise.resolve();
  });

describe('auto-saving a changed score', () => {
  it('persists the new score once the change settles', async () => {
    renderCard();

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Smoke Flavor' }), { key: 'ArrowUp' });
    await settle();

    expect(ratingSaves()).toHaveLength(1);
    expect(ratingSaves()[0].path).toBe('ratings/rating-123');
    expect(backend.store.ratings.records['rating-123'].smokeFlavor).toBe(8.5);
  });

  it('collapses a burst of changes into one save carrying the newest score', async () => {
    renderCard();
    const bar = screen.getByRole('slider', { name: 'Smoke Flavor' });

    // A drag fires a change per half-step crossed; saving each one raced the
    // backend (parallel POSTs land in any order, so a stale intermediate score
    // could win). The burst must settle into exactly one save of the end value.
    fireEvent.keyDown(bar, { key: 'ArrowUp' });
    fireEvent.keyDown(bar, { key: 'ArrowUp' });
    fireEvent.keyDown(bar, { key: 'ArrowUp' });
    expect(ratingSaves()).toHaveLength(0);
    await settle();

    expect(ratingSaves()).toHaveLength(1);
    expect(backend.store.ratings.records['rating-123'].smokeFlavor).toBe(9.5);
  });

  it('flashes "Ratings saved" once the save lands, then clears it', async () => {
    renderCard();
    expect(screen.queryByTestId('ratings-saved-flash')).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Overall Taste' }), { key: 'ArrowUp' });
    await settle();

    expect(screen.getByTestId('ratings-saved-flash')).toHaveTextContent('Ratings saved');

    act(() => {
      jest.runAllTimers();
    });
    expect(screen.queryByTestId('ratings-saved-flash')).not.toBeInTheDocument();
  });

  it('does not save, or flash, merely from being shown the stored rating', async () => {
    renderCard();
    await settle();

    expect(ratingSaves()).toHaveLength(0);
    expect(screen.queryByTestId('ratings-saved-flash')).not.toBeInTheDocument();
  });

  it('feeds the star displays: a re-read returns the overall taste just set', async () => {
    renderCard();

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Overall Taste' }), { key: 'ArrowUp' });
    await settle();

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
    await settle();

    expect(ratingSaves()).toHaveLength(0);
  });
});

describe('the review notes', () => {
  it('shows the notes stored with the rating', () => {
    renderCard();

    expect(screen.getByRole('textbox', { name: 'Review Notes' })).toHaveValue(
      'Excellent smoke flavor'
    );
  });

  it('persists an edit once typing settles — no blur needed — and confirms it', async () => {
    renderCard();
    const notes = screen.getByRole('textbox', { name: 'Review Notes' });

    fireEvent.change(notes, { target: { value: 'Would smoke again' } });
    await settle();

    expect(backend.store.ratings.records['rating-123'].notes).toBe('Would smoke again');
    expect(screen.getByTestId('ratings-saved-flash')).toBeInTheDocument();
  });

  it('flushes a pending edit when the card unmounts mid-burst', async () => {
    const { unmount } = renderCard();
    const notes = screen.getByRole('textbox', { name: 'Review Notes' });

    // Type, then leave the screen before the debounce runs out — the save the
    // clock still owed must fire on the way out, or the edit is lost.
    fireEvent.change(notes, { target: { value: 'Typed and walked away' } });
    unmount();
    await act(async () => Promise.resolve());

    expect(ratingSaves()).toHaveLength(1);
    expect(backend.store.ratings.records['rating-123'].notes).toBe('Typed and walked away');
  });

  it('saves nothing when an edit is reverted before it settles', async () => {
    const { unmount } = renderCard();
    const notes = screen.getByRole('textbox', { name: 'Review Notes' });

    fireEvent.change(notes, { target: { value: 'Second thoughts' } });
    fireEvent.change(notes, { target: { value: storedRating.notes } });
    await settle();
    unmount();
    await act(async () => Promise.resolve());

    expect(ratingSaves()).toHaveLength(0);
  });

  it('retries a failed save on the next change instead of marking it saved', async () => {
    // The card logs the rejection this test provokes on purpose; keep it out
    // of the test output.
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    // A transport whose writes fail while "offline": the save rejects, so the
    // edit must stay unsaved — not be silently marked persisted — and ride out
    // with the next change's save once the backend is reachable again.
    let offline = true;
    const flaky: FakeBackend = {
      ...backend,
      post: <T,>(path: string, body?: unknown): Promise<T> =>
        offline ? Promise.reject(new Error('offline')) : backend.post<T>(path, body),
    };
    renderCard(storedRating, flaky);
    const notes = screen.getByRole('textbox', { name: 'Review Notes' });

    fireEvent.change(notes, { target: { value: 'Nearly lost' } });
    await settle();
    expect(screen.queryByTestId('ratings-saved-flash')).not.toBeInTheDocument();
    expect(backend.store.ratings.records['rating-123'].notes).toBe(storedRating.notes);

    offline = false;
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Tenderness' }), { key: 'ArrowUp' });
    await settle();

    expect(backend.store.ratings.records['rating-123'].notes).toBe('Nearly lost');
    expect(backend.store.ratings.records['rating-123'].tenderness).toBe(9.5);
    expect(screen.getByTestId('ratings-saved-flash')).toBeInTheDocument();
    logSpy.mockRestore();
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
