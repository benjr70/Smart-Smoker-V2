import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../api';
import { createFakeBackend, FakeBackend } from '../../api/fakeBackend';
import { Smoke, SmokeHistory } from '../../api/types';
import { DesignSurface, appTheme } from '../../theme';
import { History } from './history';

// Only the review is mocked: it is the next screen, not this one. The cards
// are the real ones, so what the list shows is what a user would see.
jest.mock('./smokeReview/smokeReview', () => ({
  SmokeReview: ({ smokeId }: any) => <div data-testid="smoke-review">{smokeId}</div>,
}));

const historyRow = (
  smokeId: string,
  name: string,
  fields: Partial<SmokeHistory> = {}
): SmokeHistory => ({
  name,
  meatType: 'Brisket',
  weight: '12',
  weightUnit: 'lbs',
  woodType: 'Hickory',
  date: '2023-07-15',
  smokeId,
  overAllRating: '5',
  durationMs: 6 * 60 * 60 * 1000,
  ...fields,
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
    <CssVarsProvider theme={appTheme} defaultMode="light">
      <DesignSurface>
        <ApiClientProvider client={client}>
          <SnackbarProvider>
            <History />
          </SnackbarProvider>
        </ApiClientProvider>
      </DesignSurface>
    </CssVarsProvider>
  );
};

describe('History', () => {
  test('renders the seeded smokes newest-first', async () => {
    const backend = createFakeBackend({
      history: [historyRow('smoke-1', 'Oldest'), historyRow('smoke-2', 'Newest')],
    });

    renderHistory(backend);

    await screen.findByText('Newest');
    const cards = screen.getAllByTestId('smoke-card');
    // Reversed: the last seeded row renders first.
    expect(cards[0]).toHaveTextContent('Newest');
    expect(cards[1]).toHaveTextContent('Oldest');
  });

  test('heads the list with what screen this is and how many cooks are on it', async () => {
    const backend = createFakeBackend({
      history: [historyRow('smoke-1', 'Oldest'), historyRow('smoke-2', 'Newest')],
    });

    renderHistory(backend);

    await screen.findByText('Newest');
    expect(screen.getByTestId('history-header')).toHaveTextContent('History');
    expect(screen.getByTestId('history-count')).toHaveTextContent('2 sessions');
  });

  test('searching narrows the list and the count, and clearing the search restores both', async () => {
    const backend = createFakeBackend({
      history: [
        historyRow('smoke-1', 'Sunday Brisket'),
        historyRow('smoke-2', 'Pulled pork', { meatType: 'Pork' }),
      ],
    });

    renderHistory(backend);
    await screen.findByText('Sunday Brisket');

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search smoke history' }), 'pork');

    expect(screen.getByText('Pulled pork')).toBeInTheDocument();
    expect(screen.queryByText('Sunday Brisket')).not.toBeInTheDocument();
    expect(screen.getByTestId('history-count')).toHaveTextContent('1 of 2');

    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(screen.getByText('Sunday Brisket')).toBeInTheDocument();
    expect(screen.getByTestId('history-count')).toHaveTextContent('2 sessions');
  });

  test('offers a chip per meat in the list, narrows to the chosen ones, and widens again', async () => {
    const backend = createFakeBackend({
      history: [
        historyRow('smoke-1', 'Sunday Brisket'),
        historyRow('smoke-2', 'Pulled pork', { meatType: 'Pork' }),
        historyRow('smoke-3', 'Beer can chicken', { meatType: 'Chicken' }),
      ],
    });

    renderHistory(backend);
    await screen.findByText('Sunday Brisket');

    expect(screen.getAllByRole('button', { pressed: false }).map(chip => chip.textContent)).toEqual(
      [
        // The chips follow the list, which is newest first.
        'Chicken',
        'Pork',
        'Brisket',
      ]
    );

    await userEvent.click(screen.getByRole('button', { name: 'Pork' }));

    expect(screen.getByText('Pulled pork')).toBeInTheDocument();
    expect(screen.queryByText('Sunday Brisket')).not.toBeInTheDocument();
    expect(screen.getByTestId('history-count')).toHaveTextContent('1 of 3');

    // A second chip widens the list to either meat rather than replacing the
    // first choice.
    await userEvent.click(screen.getByRole('button', { name: 'Chicken' }));

    expect(screen.getByText('Pulled pork')).toBeInTheDocument();
    expect(screen.getByText('Beer can chicken')).toBeInTheDocument();
    expect(screen.getByTestId('history-count')).toHaveTextContent('2 of 3');

    await userEvent.click(screen.getByRole('button', { name: 'All' }));

    expect(screen.getByText('Sunday Brisket')).toBeInTheDocument();
    expect(screen.getByTestId('history-count')).toHaveTextContent('3 sessions');
  });

  test('tells a user who has never smoked to go and finish a cook', async () => {
    renderHistory(createFakeBackend({ history: [] }));

    expect(await screen.findByText('No smokes logged yet')).toBeInTheDocument();
    expect(screen.getByText('Finish a smoke and it will show up here.')).toBeInTheDocument();
    // There is nothing to clear back to, so nothing offers to.
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  test('offers the filters back when a search matches none of the cooks', async () => {
    const backend = createFakeBackend({ history: [historyRow('smoke-1', 'Sunday Brisket')] });

    renderHistory(backend);
    await screen.findByText('Sunday Brisket');

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search smoke history' }),
      'pastrami'
    );

    expect(screen.getByText('No sessions found')).toBeInTheDocument();
    expect(screen.getByText('Try a different search or clear your filters.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(screen.getByText('Sunday Brisket')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search smoke history' })).toHaveValue('');
  });

  test('renders an empty list and raises the snackbar when the fetch fails', async () => {
    const backend = createFakeBackend({ history: [historyRow('smoke-1', 'Brisket')] });
    backend.injectFault({ method: 'get', path: 'history', status: 500 });

    renderHistory(backend);

    expect(await screen.findByText('Could not load smoke history.')).toBeVisible();
    expect(screen.queryByTestId('smoke-card')).not.toBeInTheDocument();
  });

  test('viewing a smoke opens its review, and back returns to the list', async () => {
    const backend = createFakeBackend({
      history: [historyRow('smoke-1', 'Brisket')],
    });

    renderHistory(backend);

    fireEvent.click(await screen.findByRole('button', { name: 'View Brisket' }));
    expect(screen.getByTestId('smoke-review')).toHaveTextContent('smoke-1');

    // The only button on the review view is the back IconButton.
    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('heading', { name: 'Brisket' });
    expect(screen.queryByTestId('smoke-review')).not.toBeInTheDocument();
  });

  test('offers no way to delete a cook once it is open — deleting is the list’s', async () => {
    const backend = createFakeBackend({
      history: [historyRow('smoke-1', 'Brisket')],
      smoke: { records: { 'smoke-1': smokeAggregate('smoke-1') } },
    });

    renderHistory(backend);
    fireEvent.click(await screen.findByRole('button', { name: 'View Brisket' }));

    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  test('deleting a smoke asks first, then removes it and refreshes the list without it', async () => {
    const backend = createFakeBackend({
      history: [historyRow('smoke-1', 'Brisket'), historyRow('smoke-2', 'Pork')],
      smoke: { records: { 'smoke-1': smokeAggregate('smoke-1') } },
    });

    renderHistory(backend);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Brisket' }));

    // The sheet names the cook and what goes with it, so nobody confirms the
    // wrong one.
    const sheet = screen.getByRole('dialog', { name: 'Delete this smoke?' });
    expect(sheet).toHaveTextContent('Brisket');
    expect(sheet).toHaveTextContent('2023-07-15');
    expect(sheet).toHaveTextContent('temperature log, notes, and ratings');
    expect(backend.store.smoke.records['smoke-1']).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Delete smoke' }));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Brisket' })).not.toBeInTheDocument()
    );
    expect(screen.getByRole('heading', { name: 'Pork' })).toBeInTheDocument();
    expect(backend.store.smoke.records['smoke-1']).toBeUndefined();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('declining the confirmation leaves the smoke where it was', async () => {
    const backend = createFakeBackend({
      history: [historyRow('smoke-1', 'Brisket')],
      smoke: { records: { 'smoke-1': smokeAggregate('smoke-1') } },
    });

    renderHistory(backend);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Brisket' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Brisket' })).toBeInTheDocument();
    expect(backend.store.smoke.records['smoke-1']).toBeDefined();
  });

  test('a failed delete raises the snackbar and leaves the smoke in the list', async () => {
    const backend = createFakeBackend({
      history: [historyRow('smoke-1', 'Brisket')],
      smoke: { records: { 'smoke-1': smokeAggregate('smoke-1') } },
    });
    backend.injectFault({ method: 'delete', path: 'presmoke/pre-smoke-1', status: 500 });

    renderHistory(backend);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Brisket' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete smoke' }));

    expect(await screen.findByText('Could not delete smoke.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Brisket' })).toBeInTheDocument();
  });
});
