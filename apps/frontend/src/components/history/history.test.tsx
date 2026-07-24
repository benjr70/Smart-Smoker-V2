import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../api';
import { createFakeBackend, FakeBackend } from '../../api/fakeBackend';
import { Smoke, SmokeHistory } from '../../api/types';
import { History } from './history';

// The card and review children are mocked to expose the smoke id and the
// view/delete actions; the screen wires them to the injected client's hook. The
// fake client is provided through the context instead of mocking service modules.
jest.mock('./smokeCards/smokeCard', () => ({
  SmokeCard: ({ name, smokeId, onViewClick, onDeleteClick }: any) => (
    <div data-testid={`smoke-card-${smokeId}`}>
      <div>{name}</div>
      <button data-testid={`view-${smokeId}`} onClick={() => onViewClick(smokeId)}>
        View
      </button>
      <button data-testid={`delete-${smokeId}`} onClick={() => onDeleteClick(smokeId)}>
        Delete
      </button>
    </div>
  ),
}));

jest.mock('./smokeReview/smokeReview', () => ({
  SmokeReview: ({ smokeId }: any) => <div data-testid="smoke-review">{smokeId}</div>,
}));

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

const renderHistory = (backend: FakeBackend) => {
  const client = createApiClient(backend);
  return render(
    <ApiClientProvider client={client}>
      <SnackbarProvider>
        <History />
      </SnackbarProvider>
    </ApiClientProvider>
  );
};

describe('History', () => {
  test('renders the seeded smokes newest-first', async () => {
    const backend = createFakeBackend({
      history: [historyRow('smoke-1', 'Oldest'), historyRow('smoke-2', 'Newest')],
    });

    renderHistory(backend);

    await screen.findByTestId('smoke-card-smoke-2');
    const cards = screen.getAllByTestId(/smoke-card-/);
    // Reversed: the last seeded row renders first.
    expect(cards[0]).toHaveTextContent('Newest');
    expect(cards[1]).toHaveTextContent('Oldest');
  });

  test('renders an empty list and raises the snackbar when the fetch fails', async () => {
    const backend = createFakeBackend({ history: [historyRow('smoke-1', 'Brisket')] });
    backend.injectFault({ method: 'get', path: 'history', status: 500 });

    renderHistory(backend);

    expect(await screen.findByText('Could not load smoke history.')).toBeVisible();
    expect(screen.queryByTestId(/smoke-card-/)).not.toBeInTheDocument();
  });

  test('viewing a smoke opens its review, and back returns to the list', async () => {
    const backend = createFakeBackend({
      history: [historyRow('smoke-1', 'Brisket')],
    });

    renderHistory(backend);

    fireEvent.click(await screen.findByTestId('view-smoke-1'));
    expect(screen.getByTestId('smoke-review')).toHaveTextContent('smoke-1');

    // The only button on the review view is the back IconButton.
    fireEvent.click(screen.getByRole('button'));
    await screen.findByTestId('smoke-card-smoke-1');
    expect(screen.queryByTestId('smoke-review')).not.toBeInTheDocument();
  });

  test('deleting a smoke removes it and refreshes the list without it', async () => {
    const backend = createFakeBackend({
      history: [historyRow('smoke-1', 'Brisket'), historyRow('smoke-2', 'Pork')],
      smoke: { records: { 'smoke-1': smokeAggregate('smoke-1') } },
    });

    renderHistory(backend);

    fireEvent.click(await screen.findByTestId('delete-smoke-1'));

    await waitFor(() => expect(screen.queryByTestId('smoke-card-smoke-1')).not.toBeInTheDocument());
    expect(screen.getByTestId('smoke-card-smoke-2')).toBeInTheDocument();
    expect(backend.store.smoke.records['smoke-1']).toBeUndefined();
  });

  test('a failed delete raises the snackbar and leaves the smoke in the list', async () => {
    const backend = createFakeBackend({
      history: [historyRow('smoke-1', 'Brisket')],
      smoke: { records: { 'smoke-1': smokeAggregate('smoke-1') } },
    });
    backend.injectFault({ method: 'delete', path: 'presmoke/pre-smoke-1', status: 500 });

    renderHistory(backend);

    fireEvent.click(await screen.findByTestId('delete-smoke-1'));

    expect(await screen.findByText('Could not delete smoke.')).toBeVisible();
    expect(screen.getByTestId('smoke-card-smoke-1')).toBeInTheDocument();
  });
});
