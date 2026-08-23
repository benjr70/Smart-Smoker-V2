import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../api';
import { createFakeBackend, FakeBackend } from '../../api/fakeBackend';
import { AutoStopCard } from './autoStop';

const renderCard = (backend: FakeBackend) => {
  const client = createApiClient(backend);
  return render(
    <ApiClientProvider client={client}>
      <SnackbarProvider>
        <AutoStopCard />
      </SnackbarProvider>
    </ApiClientProvider>
  );
};

describe('AutoStopCard', () => {
  test('shows the threshold the installation has stored', async () => {
    const backend = createFakeBackend({
      appSettings: { settings: { autoStop: { idleHours: 12 } } },
    });

    renderCard(backend);

    await screen.findByDisplayValue('12');
    expect(screen.getByLabelText('Hours idle')).toHaveValue(12);
  });

  // A deployment that has never opened this card still auto-stops on six hours,
  // so a blank field would misreport what the app is about to do.
  test('shows the shipped six hours when nothing has been saved', async () => {
    renderCard(createFakeBackend());

    expect(await screen.findByLabelText('Hours idle')).toHaveValue(6);
  });

  test('an edited threshold is stored on leaving and shown again on the way back in', async () => {
    const backend = createFakeBackend();

    const { unmount } = renderCard(backend);
    fireEvent.change(await screen.findByLabelText('Hours idle'), { target: { value: '12' } });
    unmount();

    await waitFor(() => expect(backend.store.appSettings?.autoStop).toEqual({ idleHours: 12 }));

    // A reload is a fresh mount against the same backend.
    renderCard(backend);

    await screen.findByDisplayValue('12');
    expect(screen.getByLabelText('Hours idle')).toHaveValue(12);
  });

  // Clearing the field to retype it is half of every edit, and the save happens
  // on the way out where nobody would see it fail: an empty field posted as NaN
  // — or as the zero the backend refuses — would lose the edit silently.
  test('keeps the last threshold while the field is empty mid-edit', async () => {
    const backend = createFakeBackend();

    const { unmount } = renderCard(backend);
    const hours = await screen.findByLabelText('Hours idle');
    fireEvent.change(hours, { target: { value: '12' } });
    fireEvent.change(hours, { target: { value: '' } });
    expect(hours).toHaveValue(12);

    unmount();
    await waitFor(() => expect(backend.store.appSettings?.autoStop).toEqual({ idleHours: 12 }));
  });

  // The backend refuses anything under an hour, and the save is out of sight on
  // unmount: a rejected save would be an edit the user believes they made.
  test('holds the threshold at an hour rather than saving something the backend refuses', async () => {
    const backend = createFakeBackend();

    const { unmount } = renderCard(backend);
    fireEvent.change(await screen.findByLabelText('Hours idle'), { target: { value: '0' } });
    unmount();

    await waitFor(() => expect(backend.store.appSettings?.autoStop).toEqual({ idleHours: 1 }));
  });

  test('says what the threshold does', async () => {
    renderCard(createFakeBackend());

    const summary = await screen.findByTestId('settings-auto-stop-summary');
    expect(summary).toHaveTextContent(/auto-stop/i);
    expect(summary).toHaveTextContent(/last reading/i);
  });

  test('raises the snackbar when loading the threshold fails', async () => {
    const backend = createFakeBackend();
    backend.injectFault({ method: 'get', path: 'appSettings', status: 500 });

    renderCard(backend);

    expect(await screen.findByText('Could not load the auto-stop threshold.')).toBeInTheDocument();
  });
});
