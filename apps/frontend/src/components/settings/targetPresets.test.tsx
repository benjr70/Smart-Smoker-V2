import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../api';
import { createFakeBackend, FakeBackend } from '../../api/fakeBackend';
import { TargetPresetsCard } from './targetPresets';

const renderCard = (backend: FakeBackend) => {
  const client = createApiClient(backend);
  return render(
    <ApiClientProvider client={client}>
      <SnackbarProvider>
        <TargetPresetsCard />
      </SnackbarProvider>
    </ApiClientProvider>
  );
};

describe('TargetPresetsCard', () => {
  test('shows the stored default target temperature for each meat category', async () => {
    const backend = createFakeBackend({
      appSettings: { settings: { targetPresets: { beef: 210, pork: 190, poultry: 170 } } },
    });

    renderCard(backend);

    await screen.findByDisplayValue('210');
    expect(screen.getByLabelText('Beef')).toHaveValue(210);
    expect(screen.getByLabelText('Pork')).toHaveValue(190);
    expect(screen.getByLabelText('Poultry')).toHaveValue(170);
  });

  // A deployment that has never opened this card still has to show the
  // temperatures the backend would seed from, not blank fields.
  test('shows the shipped defaults when nothing has been saved', async () => {
    renderCard(createFakeBackend());

    expect(await screen.findByLabelText('Beef')).toHaveValue(203);
    expect(screen.getByLabelText('Pork')).toHaveValue(195);
    expect(screen.getByLabelText('Poultry')).toHaveValue(165);
  });

  // Settings are the one screen whose whole job is to still be there tomorrow.
  test('an edited temperature is stored on leaving and shown again on the way back in', async () => {
    const backend = createFakeBackend();

    const { unmount } = renderCard(backend);
    fireEvent.change(await screen.findByLabelText('Poultry'), { target: { value: '175' } });
    unmount();

    await waitFor(() =>
      expect(backend.store.appSettings?.targetPresets).toEqual({
        beef: 203,
        pork: 195,
        poultry: 175,
        wrapTemp: 165,
      })
    );

    // A reload is a fresh mount against the same backend.
    renderCard(backend);

    await screen.findByDisplayValue('175');
    expect(screen.getByLabelText('Poultry')).toHaveValue(175);
  });

  // Clearing a field to retype it is half of every edit. Saving what is on
  // screen at that instant would post NaN, which the backend rejects — and the
  // save happens on the way out, where nobody would see it fail.
  test('keeps the last temperature while a field is empty mid-edit', async () => {
    const backend = createFakeBackend();

    const { unmount } = renderCard(backend);
    const beef = await screen.findByLabelText('Beef');
    fireEvent.change(beef, { target: { value: '' } });
    expect(beef).toHaveValue(203);

    fireEvent.change(screen.getByLabelText('Pork'), { target: { value: '190' } });
    unmount();

    await waitFor(() =>
      expect(backend.store.appSettings?.targetPresets).toEqual({
        beef: 203,
        pork: 190,
        poultry: 165,
        wrapTemp: 165,
      })
    );
  });

  /**
   * The wrap temperature the Serve Plan's wrap milestone is measured against.
   * It lives in this card because it is a temperature the cook keeps beside the
   * ones the meat is done at, and it is saved in this card's block.
   */
  test('shows the shipped wrap temperature and stores an edited one', async () => {
    const backend = createFakeBackend();

    const { unmount } = renderCard(backend);
    const wrap = await screen.findByLabelText('Wrap at');
    expect(wrap).toHaveValue(165);

    fireEvent.change(wrap, { target: { value: '160' } });
    unmount();

    await waitFor(() =>
      expect(backend.store.appSettings?.targetPresets).toEqual({
        beef: 203,
        pork: 195,
        poultry: 165,
        wrapTemp: 160,
      })
    );
  });

  test('shows the wrap temperature the installation has stored', async () => {
    renderCard(
      createFakeBackend({
        appSettings: {
          settings: { targetPresets: { beef: 203, pork: 195, poultry: 165, wrapTemp: 150 } },
        },
      })
    );

    await screen.findByDisplayValue('150');
    expect(screen.getByLabelText('Wrap at')).toHaveValue(150);
  });

  test('says what the wrap temperature is for', async () => {
    renderCard(createFakeBackend());

    const summary = await screen.findByTestId('settings-wrap-temp-summary');
    expect(summary).toHaveTextContent(/wrap/i);
  });

  test('says when the temperatures are applied and what they never overwrite', async () => {
    renderCard(createFakeBackend());

    const summary = await screen.findByTestId('settings-target-presets-summary');
    expect(summary).toHaveTextContent(/when a cook starts/i);
    expect(summary).toHaveTextContent(/pre-smoke/i);
    expect(summary).toHaveTextContent(/never overwritten/i);
  });

  test('raises the snackbar when loading the default target temps fails', async () => {
    const backend = createFakeBackend();
    backend.injectFault({ method: 'get', path: 'appSettings', status: 500 });

    renderCard(backend);

    expect(await screen.findByText('Could not load default target temps.')).toBeInTheDocument();
  });
});
